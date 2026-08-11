// smejj.com — Modul AP: Autopiloten-Alarmwache und Vorfall-Protokollierung.
// Ausgelagert aus opsAutopiloten.js (800-Zeilen-Regel).
import { sendAuthMail } from "../auth/mailer.js";

const VORFAELLE_MAX = 50;

/**
 * Vorfälle aus der Ampelübersicht fortschreiben (Rot- und Gelb-Phasen).
 */
export function vorfaelleFortschreiben(uebersicht, jetztMs, env, state) {
  const { vorfaelle, offeneVorfaelle, ablage, ablageStand } = state;
  const problematische = new Map(
    uebersicht.autopiloten
      .filter((a) => a.ampel === "rot" || a.ampel === "gelb")
      .map((a) => [a.id, a])
  );
  let geaendert = false;

  for (const [id, a] of problematische) {
    const offen = offeneVorfaelle.get(id);
    if (offen) {
      if (offen.art !== "rot" && a.ampel === "rot") {
        offen.art = "rot";
        offen.grund = String(a.ampelGrund || "").slice(0, 200);
        geaendert = true;
      }
      continue;
    }
    const vorfall = {
      id,
      name: a.name,
      art: a.ampel,
      von: new Date(jetztMs).toISOString(),
      bis: null,
      grund: String(a.ampelGrund || "").slice(0, 200)
    };
    offeneVorfaelle.set(id, vorfall);
    vorfaelle.unshift(vorfall);
    geaendert = true;
  }
  for (const [id, vorfall] of [...offeneVorfaelle]) {
    if (problematische.has(id)) continue;
    vorfall.bis = new Date(jetztMs).toISOString();
    vorfall.dauerMs = Math.max(0, jetztMs - Date.parse(vorfall.von));
    offeneVorfaelle.delete(id);
    geaendert = true;
  }
  if (!geaendert) return;
  state.vorfaelle = vorfaelle.slice(0, VORFAELLE_MAX);
  ablage.schreib({
    id: "_vorfaelle",
    createdAt: new Date(jetztMs).toISOString(),
    eintraege: state.vorfaelle
  }, { env, timeoutMs: 20_000 }).catch((fehler) => {
    ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120);
  });
}

/**
 * Beim Start die abgelegten Vorfälle zurückholen.
 */
export function ladeVorfaelle(datensatz, state) {
  if (datensatz?.id !== "_vorfaelle" || !Array.isArray(datensatz.eintraege)) return false;
  if (!state.vorfaelle.length) {
    state.vorfaelle = datensatz.eintraege.slice(0, VORFAELLE_MAX);
    for (const v of state.vorfaelle) {
      if (v && v.bis === null && v.id) state.offeneVorfaelle.set(v.id, v);
    }
  }
  return true;
}

/**
 * Pruefdurchlauf der Alarm-Wache: neue Rot-Faelle melden.
 */
export async function pruefeAlarmCore({
  autopilotUebersicht,
  alarmiert,
  state,
  env = process.env,
  jetztMs = Date.now(),
  sende = null
} = {}) {
  const uebersicht = autopilotUebersicht({ jetztMs });
  vorfaelleFortschreiben(uebersicht, jetztMs, env, state);
  const rote = uebersicht.autopiloten.filter((a) => a.ampel === "rot");
  const roteIds = new Set(rote.map((a) => a.id));
  for (const id of [...alarmiert]) if (!roteIds.has(id)) alarmiert.delete(id);

  const neue = rote.filter((a) => !alarmiert.has(a.id));
  if (!neue.length) return { gemeldet: 0 };
  const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(",")[0].trim();
  if (!empfaenger) return { gemeldet: 0, hinweis: "kein Empfaenger hinterlegt" };

  const senden = sende || ((nachricht) => sendAuthMail(nachricht, env));
  let gemeldet = 0;
  for (const a of neue) {
    try {
      await senden({
        to: empfaenger,
        subject: `smejj.com Autopilot ROT: ${a.name}`,
        text: `Der Autopilot "${a.name}" steht auf ROT.\n\n`
          + `Grund: ${a.ampelGrund}\n`
          + `Ort: ${a.ort} · Zeitplan: ${a.zeitplan}\n\n`
          + "Ampel und Bedienungs-Anleitung: https://smejj.com/admin/autopiloten/\n\n"
          + "Diese Mail kommt einmal je Rot-Phase. Wird der Autopilot wieder gruen "
          + "und faellt erneut aus, meldet er sich wieder.",
        art: "autopilot-alarm"
      });
      alarmiert.add(a.id);
      gemeldet += 1;
    } catch {
      // Fehler ignorieren — nächster Takt versucht es erneut
    }
  }
  return { gemeldet };
}
