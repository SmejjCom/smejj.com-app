// smejj.com — Autopilot Jobs (Zeabur): Qualitätsmessung, Voice-Region, Konkurrenz-Radar.
import { herzschlagSenden } from "./spiegelJob.mjs";
import { echterQualitaetslauf } from "./qualitaetJob.mjs";

/** Prüft ob eine Uhrzeit (HH:MM UTC) erreicht wurde und am aktuellen Tag noch nicht gelaufen ist. */
export function istFaelligUtc({ jetztMs, uhrzeitUtc, letzterTag }) {
  const jetzt = new Date(jetztMs);
  const tag = jetzt.toISOString().slice(0, 10);
  if (tag === letzterTag) return false;
  const [h, m] = String(uhrzeitUtc || "00:00").split(":").map(Number);
  const faelligAb = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate(), h || 0, m || 0);
  return jetztMs >= faelligAb;
}

/** Prüft ob ein Wochentag (0=So, 1=Mo, ...) und Uhrzeit UTC erreicht wurde und am aktuellen Tag noch nicht gelaufen ist. */
export function istWochenJobFaellig({ jetztMs, wochentagUtc, uhrzeitUtc, letzterTag }) {
  const jetzt = new Date(jetztMs);
  if (jetzt.getUTCDay() !== wochentagUtc) return false;
  return istFaelligUtc({ jetztMs, uhrzeitUtc, letzterTag });
}

export async function qualitaetsmessungLauf({ log = console.log, messlauf = echterQualitaetslauf } = {}) {
  const start = Date.now();
  log("[autopilot-jobs] Qualitätsmessung-Lauf gestartet");
  // Seit 2026-08-12 misst dieser Job WIRKLICH (qualitaetJob.mjs): Suite über
  // den echten Nutzerweg, Note in der Meldung. Ohne SMEJJ_SESSION_SECRET
  // bleibt er ein ehrlich beschriftetes Lebenszeichen; ein gescheiterter
  // Messlauf meldet "fehler" mit Grund — nie eine erfundene Zahl.
  const ergebnis = await messlauf({ log });
  const { ok, meldung } = ergebnis;
  const dauerMs = Date.now() - start;
  const statusHttp = await herzschlagSenden({
    id: "qualitaetsmessung",
    ok, meldung, dauerMs
  });
  log(`[autopilot-jobs] Qualitätsmessung beendet: ok=${ok}, gemessen=${ergebnis.gemessen}, HTTP ${statusHttp}`);
  return { ok, meldung, dauerMs };
}

export async function voiceRegionCheckLauf({ log = console.log } = {}) {
  const start = Date.now();
  log("[autopilot-jobs] Voice-Region-Prüfung gestartet");
  const ok = true;
  const meldung = "Lebenszeichen: Dienst läuft planmäßig — echte Google-Statusprüfung noch nicht angebunden";
  const dauerMs = Date.now() - start;
  const statusHttp = await herzschlagSenden({
    id: "voice-region-check",
    ok, meldung, dauerMs
  });
  log(`[autopilot-jobs] Voice-Region-Prüfung beendet: ok=${ok}, HTTP ${statusHttp}`);
  return { ok, meldung, dauerMs };
}

/**
 * Der Konkurrenz-Radar ist am 2026-08-14 in den Control-Server umgezogen
 * (control-server/src/evolution/konkurrenzRadar.js) und sucht dort WIRKLICH.
 *
 * DIESER JOB SENDET DESHALB KEINEN HERZSCHLAG MEHR. Täte er es weiter, hielte
 * sein Lebenszeichen ("Dienst läuft planmäßig — echter Quellenscan noch nicht
 * angebunden") die Ampel grün, auch wenn der echte Scan im Control-Server
 * scheitert. Genau so tarnen sich Attrappen: nicht durch eine Lüge, sondern
 * durch ein Signal, das eine andere Frage beantwortet als die gestellte.
 *
 * Die Funktion bleibt als Stummel, damit ein alter Aufruf im Dienst nicht
 * abstürzt — sie sagt nur noch, wo der Radar jetzt wohnt.
 */
export async function konkurrenzRadarLauf({ log = console.log } = {}) {
  const meldung = "Umgezogen: der Konkurrenz-Radar läuft seit 2026-08-14 im Control-Server "
    + "(echter Quellenscan). Dieser Job sendet bewusst KEINEN Herzschlag mehr.";
  log(`[autopilot-jobs] ${meldung}`);
  return { ok: true, meldung, dauerMs: 0, herzschlagGesendet: false };
}

// trainingLoopLauf wurde am 2026-08-12 entfernt: das Training ist seit dem
// 2026-08-02 per Beschluss stillgelegt (RAG statt Training), der Job meldete
// trotzdem täglich "Training-Loop aktiv". Ein stillgelegter Kreislauf sendet
// keine Lebenszeichen.
//
// Ebenfalls entfernt: autopilotWaechterLauf — er sendete alle 15 Minuten für
// ALLE 31 Autopiloten blind ok-Herzschläge ("Autopilot betriebsbereit & aktiv"),
// auch für Module, die nirgends im Server eingebunden sind. Damit war die
// Ampel keine Messung mehr, sondern ein Stempel. Jeder Job meldet nur noch
// seinen EIGENEN, wirklich gelaufenen Lauf.
