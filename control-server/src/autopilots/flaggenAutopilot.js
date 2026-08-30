// smejj.com — Feature-Flags-Wache (Autopilot Nr. 70), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// WARUM ES SIE GIBT: Ein Flag kostet keinen Deploy — genau deshalb bleiben
// Flag-Entscheidungen liegen. 'partial' mit 10 % von vor sechs Wochen ist eine
// gestellte Frage, die niemand mehr beantwortet: Rolle ich weiter auf oder
// zurück? Diese Wache misst das Alter der Flag-Entscheidungen (updatedAt) im
// Takt und legt die vergessenen als EINE Entscheidungskarte in die Tagesmappe
// (Nr. 60): aufräumen oder bewusst lassen — beides ist eine Antwort.
//
// STUFUNG, bewusst ehrlich: Ein altes Flag ist KEIN Ausfall — die Ampel bleibt
// grün, solange die Ablage lesbar und die Werte gültig sind. ROT nur bei
// unlesbarer Ablage oder ungültigen Zuständen (fail-closed). Die Erinnerung
// ist eine Karte, kein Alarm: Absicht kann eine Wache nicht erkennen.
import { createRecordStore } from "../admin/recordStore.js";
import { listFlags, FLAG_STATUS } from "../admin/featureFlags.js";

/** Die Ablage der Entscheidungskarte — gelesen von der Tagesmappe (Nr. 60). */
export const FLAGGEN_ABLAGE = "autopiloten/flaggen";

/** Ab diesem Alter ohne Änderung gilt eine Flag-Entscheidung als vergessen. */
export const VERALTET_TAGE = 30;
const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Bewertet die Flag-Liste. Getrennt testbar (kaputt + gesund):
 *   - ungültiger Zustand im Bestand -> rot (die Verwaltung sollte das
 *     verhindern; kommt es doch vor, ist etwas kaputt, nicht vergesslich)
 *   - on/partial älter als 30 Tage unverändert -> gezählt, Karte, grün
 *   - off ist kein Vergessen: ein ausgeschaltetes Flag darf alt sein
 */
export function beurteileFlaggen(flags = [], jetztMs = Date.now()) {
  const ungueltig = flags.filter((f) => !Object.values(FLAG_STATUS).includes(f?.status));
  if (ungueltig.length) {
    return { ok: false, grund: `${ungueltig.length} Flag(s) mit ungültigem Zustand (${ungueltig.map((f) => `${f?.name || "?"}:${f?.status}`).join(", ").slice(0, 120)})` };
  }
  const grenze = jetztMs - VERALTET_TAGE * TAG_MS;
  const veraltet = flags.filter((f) => {
    if (f?.status === FLAG_STATUS.off) return false;
    const geaendert = Date.parse(f?.updatedAt || f?.createdAt || "");
    return Number.isFinite(geaendert) && geaendert < grenze;
  });
  return { ok: true, veraltet, total: flags.length, an: flags.filter((f) => f?.status === FLAG_STATUS.on).length, partial: flags.filter((f) => f?.status === FLAG_STATUS.partial).length };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Proben, beide richtig beurteilt. */
export function fuehreSelbsttestAus({ jetztMs = Date.now() } = {}) {
  const fehler = [];
  const altIso = new Date(jetztMs - 40 * TAG_MS).toISOString();
  const frischIso = new Date(jetztMs - TAG_MS).toISOString();
  const ungueltig = beurteileFlaggen([{ name: "kaputt", status: "vielleicht" }], jetztMs);
  if (ungueltig.ok) fehler.push("ein Flag mit ungültigem Zustand muss rot sein");
  const alt = beurteileFlaggen([
    { name: "neu-menue", status: "partial", updatedAt: altIso },
    { name: "sauber", status: "on", updatedAt: frischIso }
  ], jetztMs);
  if (!alt.ok || alt.veraltet.length !== 1 || alt.veraltet[0].name !== "neu-menue") fehler.push("ein 40 Tage altes partial-Flag muss als veraltet gezählt werden");
  const ausIstOk = beurteileFlaggen([{ name: "ruht", status: "off", updatedAt: altIso }], jetztMs);
  if (!ausIstOk.ok || ausIstOk.veraltet.length !== 0) fehler.push("ein ausgeschaltetes Flag darf alt sein — off ist keine offene Frage");
  const leer = beurteileFlaggen([], jetztMs);
  if (!leer.ok || leer.total !== 0) fehler.push("keine Flags ist grün mit der Zahl 0");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Flags lesen, bewerten, Karte ablegen. Die Karte zählt die
 * veralteten Flags mit Namen (maximal 5, dann 'und N weitere') — die Tagesmappe
 * zeigt sie unter ENTSCHEIDEN nur, wenn es mindestens eine gibt; eine Karte
 * älter als 3 Tage gilt dort als stumme Quelle.
 *
 * @param {{env?: object, jetztMs?: number, leser?: Function, kartenAblage?: object}} eingabe
 *   leser (Signatur wie listFlags) und kartenAblage austauschbar.
 */
export async function laufFlaggen({
  env = process.env,
  jetztMs = Date.now(),
  leser = listFlags,
  kartenAblage = null
} = {}) {
  const probe = fuehreSelbsttestAus({ jetztMs });
  if (!probe.bestanden) {
    return { ok: false, meldung: `Flaggen-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  let antwort;
  try {
    antwort = await leser({ env });
  } catch (error) {
    return { ok: false, meldung: `Flag-Ablage unlesbar: ${String(error?.message || error).slice(0, 140)}` };
  }
  if (!antwort?.ok) {
    return { ok: false, meldung: `Flag-Ablage nicht lesbar (${antwort?.error || "unbekannt"}) — Schaltzustände sind unbewacht` };
  }
  const urteil = beurteileFlaggen(antwort.flags || [], jetztMs);
  if (!urteil.ok) {
    // Fail-closed und OHNE Karte: ungültige Werte sind keine vergessene Frage,
    // sondern ein kaputter Bestand — die Karte käme aus kaputten Daten.
    return { ok: false, meldung: `Feature-Flags: ${urteil.grund}` };
  }

  const namen = urteil.veraltet.map((f) => f.name).filter(Boolean);
  const namenKurz = namen.length > 5 ? `${namen.slice(0, 5).join(", ")} und ${namen.length - 5} weitere` : namen.join(", ");
  let karteStatus = "Karte nicht abgelegt";
  try {
    const ablage = kartenAblage || createRecordStore(FLAGGEN_ABLAGE, { maximal: 10 });
    await ablage.schreib({
      id: "letzte-karte",
      art: "flaggen-karte",
      veraltetAnzahl: namen.length,
      veraltetNamen: namen.slice(0, 20),
      total: urteil.total,
      createdAt: new Date(jetztMs).toISOString()
    }, { env, timeoutMs: 5000 });
    karteStatus = "Karte in der Tagesmappe-Ablage";
  } catch {
    karteStatus = "Karte NICHT abgelegt (Ablage gestört)";
  }

  const vergessen = namen.length > 0
    ? ` — ${namen.length} Flag(s) länger als ${VERALTET_TAGE} Tage unverändert (${namenKurz}): Entscheidung in der Tagesmappe`
    : "";
  return {
    ok: true,
    meldung: `Selbsttest 4/4; ${urteil.total} Flags (${urteil.an} an, ${urteil.partial} teilweis)${vergessen}; ${karteStatus}`
  };
}
