// smejj.com — Konto-Wache (Autopilot Nr. 52): bewacht die Grundpfeiler von
// Anmeldung und Berechtigung — die Dinge, deren Bruch am 25.07. den offenen
// Adminbereich und am 04.08. den Passwort-Reset über window.prompt möglich
// machte.
//
// Drei Prüfungen, alle messbar ohne Netz:
// 1. KONFIGURATION: Sitzungsgeheimnis vorhanden und stark genug? Admin-
//    Eigentümerliste gesetzt? Ohne beides ist jede Tür nur angelehnt.
// 2. BERECHTIGUNGS-DRIFT: Ändert sich die Admin-Eigentümerliste, wird das
//    24 Stunden lang ROT gemeldet — eine legitime Änderung sieht der
//    Betreiber als Bestätigung, eine fremde als Alarm. Danach gilt der neue
//    Stand (sonst bliebe die Ampel nach jeder gewollten Änderung ewig rot).
// 3. SELBSTTEST: Der Drift-Erkenner bekommt eine kaputte und eine gesunde
//    Probe — dieselbe Regel wie bei jedem Prüfer.
import { createRecordStore } from "../admin/recordStore.js";

const ABLAGE_ID = "admin-eigentuemer-stand";
const DRIFT_ALARM_MS = 24 * 60 * 60 * 1000;

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("admin/konto-wache", { maximal: 20 });
  return ablageStandard;
}

/** Normalisierte Eigentümerliste aus der Umgebung. */
export function leseEigentuemer(env = process.env) {
  return String(env.SMEJJ_ADMIN_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

/** Konfigurations-Prüfung. Getrennt testbar. */
export function pruefeKonfiguration(env = {}) {
  const probleme = [];
  const geheimnis = String(env.SMEJJ_SESSION_SECRET || "");
  if (!geheimnis) probleme.push("SMEJJ_SESSION_SECRET fehlt — Sitzungen wären fälschbar");
  else if (geheimnis.length < 32) probleme.push(`SMEJJ_SESSION_SECRET ist mit ${geheimnis.length} Zeichen zu kurz (unter 32)`);
  const eigentuemer = leseEigentuemer(env);
  if (!eigentuemer.length) probleme.push("SMEJJ_ADMIN_OWNER_EMAILS fehlt — niemand ist Admin, oder jeder");
  return { ok: probleme.length === 0, probleme, eigentuemer };
}

/**
 * Drift-Urteil: alte Liste gegen neue. Getrennt testbar.
 * @returns {{drift: boolean, hinzu: string[], weg: string[]}}
 */
export function erkenneDrift(alteListe = [], neueListe = []) {
  const alt = new Set(alteListe);
  const neu = new Set(neueListe);
  const hinzu = [...neu].filter((e) => !alt.has(e));
  const weg = [...alt].filter((e) => !neu.has(e));
  return { drift: hinzu.length > 0 || weg.length > 0, hinzu, weg };
}

/** Selbsttest: Drift und Konfigurationslöcher MÜSSEN auffallen, Ordnung nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = erkenneDrift(["a@example.com"], ["a@example.com", "boese@example.com"]);
  if (!kaputt.drift || kaputt.hinzu[0] !== "boese@example.com") fehler.push("hinzugefügter Admin wird nicht erkannt");
  const gesund = erkenneDrift(["a@example.com"], ["a@example.com"]);
  if (gesund.drift) fehler.push("unveränderte Liste gilt fälschlich als Drift");
  const loch = pruefeKonfiguration({ SMEJJ_SESSION_SECRET: "kurz", SMEJJ_ADMIN_OWNER_EMAILS: "" });
  if (loch.ok || loch.probleme.length !== 2) fehler.push(`Konfigurationslöcher: ${loch.probleme.length}/2 erkannt`);
  const ordentlich = pruefeKonfiguration({ SMEJJ_SESSION_SECRET: "x".repeat(48), SMEJJ_ADMIN_OWNER_EMAILS: "a@example.com" });
  if (!ordentlich.ok) fehler.push("gesunde Konfiguration löst fälschlich Alarm aus");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt.
 */
export async function laufKontoWache({ env = process.env, ablage = null, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Konto-Wache beurteilt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const konfiguration = pruefeKonfiguration(env);
  if (!konfiguration.ok) {
    return { ok: false, meldung: `Anmelde-Grundpfeiler verletzt: ${konfiguration.probleme.join("; ")}` };
  }

  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* unten ehrlich benannt */ }

  if (!stand) {
    // Erster Lauf: Referenz stempeln. Das ist keine Entwarnung, sondern der
    // Anfang der Messreihe — die Meldung sagt das.
    try {
      await speicher.schreib({ id: ABLAGE_ID, eigentuemer: konfiguration.eigentuemer, createdAt: new Date(jetztMs).toISOString() });
    } catch (f) {
      return { ok: false, meldung: `Referenzliste ließ sich nicht stempeln: ${String(f?.message || f).slice(0, 80)}` };
    }
    return { ok: true, meldung: `Selbsttest 4/4; Grundpfeiler stehen — Referenz gestempelt (${konfiguration.eigentuemer.length} Admin-Eigentümer)` };
  }

  const drift = erkenneDrift(stand.eigentuemer || [], konfiguration.eigentuemer);
  if (drift.drift) {
    const beschreibung = [
      ...drift.hinzu.map((e) => `NEU ${e}`),
      ...drift.weg.map((e) => `WEG ${e}`)
    ].join(", ");
    try {
      await speicher.schreib({
        id: ABLAGE_ID,
        eigentuemer: konfiguration.eigentuemer,
        createdAt: stand.createdAt || new Date(jetztMs).toISOString(),
        driftAm: new Date(jetztMs).toISOString(),
        driftWas: beschreibung
      });
    } catch { /* der Alarm unten gilt auch ohne Stempel */ }
    return { ok: false, meldung: `Admin-Eigentümerliste hat sich GEÄNDERT: ${beschreibung} — 24 h Alarm, dann gilt der neue Stand` };
  }

  const driftAmMs = Date.parse(stand.driftAm || "");
  if (Number.isFinite(driftAmMs) && jetztMs - driftAmMs < DRIFT_ALARM_MS) {
    const nochH = Math.ceil((DRIFT_ALARM_MS - (jetztMs - driftAmMs)) / 3_600_000);
    return { ok: false, meldung: `Admin-Liste wurde vor Kurzem geändert (${stand.driftWas || "?"}) — Alarm noch ${nochH} h, dann gilt der neue Stand` };
  }

  return { ok: true, meldung: `Selbsttest 4/4; Grundpfeiler stehen, Admin-Liste unverändert (${konfiguration.eigentuemer.length} Eigentümer)` };
}
