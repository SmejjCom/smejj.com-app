// smejj.com Dauertrainings-Schleife — Lernrunde (Betreiber 17.09.2026):
//   1. Im Chat echte Frage-Antwort-Paare sammeln (Daumen hoch + Einwilligung)
//   2. Trainiert wird erst, wenn genug NEUE Paare da sind (Standard 500)
//   3. Die neue Version geht nur live, wenn sie besser misst als der Stand davor
//
// WARUM DAS TOR: Die Schleife trainierte bisher in festen Abstaenden auf
// demselben Datensatz. Acht Laeufe (09.-11.09.) zeigten, was das bringt: keine
// einzige Version schlug die Basis. Ohne neue Daten mietet jeder weitere Lauf
// nur eine GPU. Das Tor laesst einen Lauf erst durch, wenn seit dem letzten
// mindestens `ziel` neue Lernpaare eingegangen sind.
//
// Nichts hier liest Nutzerkennungen: Lernpaare tragen nur Frage, Antwort,
// Zeitpunkt und den Einwilligungsbeleg (src/training/lernpaare.js).
import { createHash } from "node:crypto";
import { jsonl, pruefePaar } from "../con-autopilot/daten.js";
import { antwortQuelleZulaessig } from "../../src/training/policy.js";

export const LERNPAAR_PRAEFIX = "training/fragen/lernpaare/";
export const LERNRUNDE_STAND_KEY = "smejj/lernrunde/stand.json";
export const AKTIVER_ADAPTER_KEY = "smejj/hausmodell/aktiver-adapter.json";
export const EINWILLIGUNG_PRAEFIX = "training/consents/v1/";

/**
 * Rein: darf dieses Lernpaar in den Datensatz? (23.09.2026)
 *  - die Antwort stammt von einem Modell mit Trainingsrecht (Register in policy.js)
 *  - der Mensch hat seine Einwilligung NICHT widerrufen (widerrufen = Set der subjectRefs)
 * Fail-closed: fehlt die Herkunft, ist das Paar draussen.
 */
export function lernpaarZulaessig(lp, widerrufen = new Set()) {
  const recht = antwortQuelleZulaessig(lp?.quelle);
  if (!recht.zulaessig) return { zulaessig: false, grund: recht.grund };
  const wer = String(lp?.einwilligung?.subjectRef || "");
  if (!wer) return { zulaessig: false, grund: "einwilligung_ohne_beleg" };
  if (widerrufen.has(wer)) return { zulaessig: false, grund: "einwilligung_widerrufen" };
  return { zulaessig: true, grund: "erlaubt" };
}

/**
 * Welche Menschen haben widerrufen? Liest die Ereignisse unter
 * training/consents/v1/<subjectRef>/ — ein Widerruf sperrt den Geltungsbereich
 * DAUERHAFT (Ledger-Regel), also genuegt irgendein revoke-Ereignis.
 * Nicht lesbar = alle gelten als widerrufen: lieber keine Runde als eine mit
 * Paaren, deren Einwilligung niemand pruefen konnte.
 */
export async function widerrufeneSubjekte(e2, subjekte) {
  const widerrufen = new Set();
  for (const wer of subjekte) {
    if (!/^sub_[a-f0-9]{16,128}$/.test(wer)) { widerrufen.add(wer); continue; }
    try {
      const schluessel = (await e2.liste(`${EINWILLIGUNG_PRAEFIX}${wer}/`)).map((o) => o.key);
      if (schluessel.some((k) => /revocation/i.test(k))) { widerrufen.add(wer); continue; }
      for (const key of schluessel.filter((k) => k.endsWith(".json"))) {
        const ereignis = await e2.getJson(key, null);
        if (ereignis === null || ["revoke", "revocation-sentinel"].includes(ereignis?.eventType)) { widerrufen.add(wer); break; }
      }
    } catch { widerrufen.add(wer); }
  }
  return widerrufen;
}

/** Rein: ist eine Lernrunde faellig? */
export function lernrundeFaellig({ anzahlJetzt, anzahlBeiLetzterRunde = 0, ziel = 500 }) {
  const neu = Math.max(0, Number(anzahlJetzt || 0) - Number(anzahlBeiLetzterRunde || 0));
  return { faellig: neu >= ziel, neu, ziel };
}

const paarSchluessel = (messages) => JSON.stringify(messages.map((m) => [m.role, m.content]));

/**
 * Rein: Basis-Datensatz (train.jsonl) plus Lernpaare zu einem neuen Datensatz.
 * Doppelte Paare fallen heraus, unbrauchbare Paare prueft dieselbe Regel wie
 * beim gebauten Datensatz (pruefePaar).
 */
export function baueLernrundenDatensatz({ basisText = "", lernpaare = [], name, basisName, jetzt = () => new Date() }) {
  const gesehen = new Set();
  const paare = [];
  for (const zeile of String(basisText).split("\n")) {
    if (!zeile.trim()) continue;
    try {
      const p = JSON.parse(zeile);
      if (!Array.isArray(p?.messages)) continue;
      const k = paarSchluessel(p.messages);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      paare.push({ messages: p.messages });
    } catch { /* kaputte Zeile im Basis-Datensatz: ueberspringen, nicht raten */ }
  }
  let aufgenommen = 0;
  let verworfen = 0;
  for (const lp of lernpaare) {
    const messages = [
      { role: "user", content: String(lp?.frage || "").trim() },
      { role: "assistant", content: String(lp?.antwort || "").trim() }
    ];
    const k = paarSchluessel(messages);
    if (gesehen.has(k) || !pruefePaar(messages, { mindestAntwortLaenge: 1 }).ok) { verworfen += 1; continue; }
    gesehen.add(k);
    paare.push({ messages });
    aufgenommen += 1;
  }
  const text = jsonl(paare);
  return {
    text,
    manifest: {
      name,
      basis: basisName,
      paare: paare.length,
      lernpaare: aufgenommen,
      lernpaareVerworfen: verworfen,
      sha256: createHash("sha256").update(text).digest("hex"),
      gebautAm: jetzt().toISOString()
    }
  };
}

/**
 * Das Tor als `pruefeDaten` fuer cycle.js. Erst wenn die Lernrunde faellig ist,
 * wird der Datensatz gebaut und abgelegt — und der Stand fortgeschrieben, damit
 * die naechste Runde wieder `ziel` NEUE Paare braucht.
 */
export function baueLernrundenTor({ e2, ziel = 500, basisName, datensatzName, jetzt = () => new Date(), log = () => {} }) {
  return async function pruefeDaten() {
    if (!e2 || !basisName || !datensatzName) return { vorhanden: false, gruende: ["lernrunde_unvollstaendig"] };
    try {
      const schluessel = (await e2.liste(LERNPAAR_PRAEFIX)).map((o) => o.key).filter((k) => k.endsWith(".json"));
      const stand = await e2.getJson(LERNRUNDE_STAND_KEY, null);
      const urteil = lernrundeFaellig({ anzahlJetzt: schluessel.length, anzahlBeiLetzterRunde: stand?.lernpaare, ziel });
      if (!urteil.faellig) {
        return { vorhanden: false, gruende: [`lernrunde_wartet:${urteil.neu}_von_${urteil.ziel}_neuen_lernpaaren`] };
      }
      const basisText = await e2.getText(`datasets/${basisName}/train.jsonl`);
      if (!basisText) return { vorhanden: false, gruende: [`basis_datensatz_fehlt:${basisName}`] };
      const gelesen = [];
      for (const key of schluessel) {
        const lp = await e2.getJson(key, null);
        if (lp) gelesen.push(lp);
      }
      // Anbieterrechte + Widerruf (23.09.2026): erst hier wird aussortiert,
      // denn das Register kann sich seit der Ablage geaendert haben.
      const widerrufen = await widerrufeneSubjekte(e2, new Set(gelesen.map((lp) => String(lp?.einwilligung?.subjectRef || "")).filter(Boolean)));
      const aussortiert = {};
      const lernpaare = gelesen.filter((lp) => {
        const u = lernpaarZulaessig(lp, widerrufen);
        if (!u.zulaessig) aussortiert[u.grund] = (aussortiert[u.grund] || 0) + 1;
        return u.zulaessig;
      });
      const zulaessig = lernrundeFaellig({ anzahlJetzt: lernpaare.length, anzahlBeiLetzterRunde: stand?.zulaessige ?? stand?.lernpaare, ziel });
      if (!zulaessig.faellig) {
        const weg = Object.entries(aussortiert).map(([g, n]) => `${g}=${n}`).join(",") || "keine";
        return { vorhanden: false, gruende: [`lernrunde_wartet:${zulaessig.neu}_von_${ziel}_zulaessigen_lernpaaren(aussortiert:${weg})`] };
      }
      const { text, manifest: roh } = baueLernrundenDatensatz({ basisText, lernpaare, name: datensatzName, basisName, jetzt });
      const manifest = { ...roh, lernpaareOhneRecht: aussortiert };
      await e2.putText(`datasets/${datensatzName}/train.jsonl`, text, "application/x-ndjson; charset=utf-8");
      await e2.putJson(`datasets/${datensatzName}/manifest.json`, manifest);
      await e2.putJson(LERNRUNDE_STAND_KEY, { lernpaare: schluessel.length, zulaessige: lernpaare.length, datensatz: datensatzName, am: jetzt().toISOString() });
      log(`[smejj-lora-loop] Lernrunde: ${urteil.neu} neue Lernpaare, Datensatz ${datensatzName} mit ${manifest.paare} Paaren`);
      return { vorhanden: true, zeilen: manifest.paare, name: datensatzName };
    } catch (fehler) {
      return { vorhanden: false, gruende: [`lernrunde_nicht_lesbar:${String(fehler?.message || fehler).slice(0, 120)}`] };
    }
  };
}

/**
 * Schritt 3: eine Version, die BESSER gemessen hat, wird fuer das Hausmodell
 * freigegeben. Das Hausmodell liest AKTIVER_ADAPTER_KEY und laedt den Adapter
 * zu smejj 1. Ohne vollstaendige Adapter-Beschreibung (Datei, Groesse,
 * Pruefsumme) wird NICHTS freigegeben — ein halber Adapter ist schlimmer als keiner.
 */
export async function befoerdereZumHausmodell({ e2, stand, jetzt = () => new Date(), log = () => {} }) {
  const prefix = String(stand?.adapterSchluessel || "").replace(/\/+$/, "");
  if (!e2 || !prefix) return false;
  const adapter = await e2.getJson(`${prefix}/adapter.json`, null);
  const vollstaendig = adapter && typeof adapter.datei === "string" && /^[a-f0-9]{64}$/.test(String(adapter.sha256 || ""))
    && Number(adapter.sizeBytes) > 0;
  if (!vollstaendig) {
    log(`[smejj-lora-loop] Befoerderung abgelehnt: ${prefix}/adapter.json fehlt oder ist unvollstaendig`);
    return false;
  }
  await e2.putJson(AKTIVER_ADAPTER_KEY, {
    modell: "smejj-1-basis",
    version: stand.version || null,
    punktzahl: stand.kennzahlen?.punktzahl ?? null,
    adapter: { datei: adapter.datei, sha256: adapter.sha256, sizeBytes: Number(adapter.sizeBytes), prefix: adapter.prefix || prefix },
    freigegebenAm: jetzt().toISOString()
  });
  log(`[smejj-lora-loop] ${stand.version || "neue Version"} fuer das Hausmodell freigegeben`);
  return true;
}
