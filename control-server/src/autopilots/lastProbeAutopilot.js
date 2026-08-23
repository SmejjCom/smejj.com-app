// smejj.com — Last-Probe (Autopilot Nr. 56): misst einmal wöchentlich, wie
// sich die Kern-Endpunkte unter GLEICHZEITIGEN Anfragen verhalten — Engpässe
// sollen hier auffallen, nicht beim ersten Ansturm echter Nutzer.
//
// BEWUSST KLEIN: 20 gleichzeitige /health-Anfragen sind eine Probe, kein
// Lasttest-Gewitter. Sie messen den empfindlichsten Wert — die Streuung unter
// Parallellast (p95) — ohne den eigenen Dienst zu gefährden. Ein echter
// Stresstest mit tausenden Anfragen gehört in ein Wartungsfenster und auf
// Betreiber-Anordnung, nie in einen Automat-Takt.
//
// Gemessen wird der /health-Weg der eigenen Dienste — von innen (Zeabur-
// Netz), damit das langsame Netz des Betreibers nie in die Zahlen läuft
// (Modul-Gedächtnis "Netz des Betreibers ist der Flaschenhals").
import { createRecordStore } from "../admin/recordStore.js";

const PROBE_ABSTAND_MS = 6.5 * 24 * 60 * 60 * 1000; // wöchentlich, mit Spielraum wie der Modell-Einkäufer
const ABLAGE_ID = "letzte-last-probe";
const PARALLEL = 20;

/** Rote Grenzen: mehr als 10 % Fehler oder p95 über 2 s unter Mini-Last. */
export const GRENZEN = Object.freeze({ fehlerQuote: 0.10, p95Ms: 2_000 });

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("betrieb/last-proben", { maximal: 20 });
  return ablageStandard;
}

/** Perzentil über gemessene Dauern. Getrennt testbar. */
export function perzentil(dauern = [], p = 0.95) {
  if (!dauern.length) return null;
  const sortiert = [...dauern].sort((a, b) => a - b);
  const index = Math.min(sortiert.length - 1, Math.ceil(p * sortiert.length) - 1);
  return sortiert[Math.max(0, index)];
}

/** Beurteilt eine Messreihe. Getrennt testbar. */
export function beurteileMessreihe({ dauern = [], fehler = 0 }, { grenzen = GRENZEN } = {}) {
  const gesamt = dauern.length + fehler;
  if (!gesamt) return { ok: false, grund: "keine einzige Antwort — Ziel nicht erreichbar" };
  const quote = fehler / gesamt;
  const p95 = perzentil(dauern, 0.95);
  if (quote > grenzen.fehlerQuote) return { ok: false, grund: `${Math.round(quote * 100)} % Fehler unter ${gesamt} parallelen Anfragen`, p95 };
  if (p95 !== null && p95 > grenzen.p95Ms) return { ok: false, grund: `p95 ${p95} ms unter Parallellast (Grenze ${grenzen.p95Ms} ms)`, p95 };
  return { ok: true, grund: `p95 ${p95} ms, ${fehler}/${gesamt} Fehler`, p95 };
}

/** Selbsttest: kaputte UND gesunde Messreihen müssen richtig beurteilt werden. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  if (perzentil([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 0.95) !== 1000) {
    fehler.push("p95 über 10 Werte muss der höchste sein");
  }
  const kaputtFehler = beurteileMessreihe({ dauern: Array(15).fill(80), fehler: 5 });
  if (kaputtFehler.ok) fehler.push("25 % Fehlerquote gilt fälschlich als gesund");
  const kaputtLangsam = beurteileMessreihe({ dauern: Array(20).fill(3_000), fehler: 0 });
  if (kaputtLangsam.ok) fehler.push("p95 von 3 s gilt fälschlich als gesund");
  const gesund = beurteileMessreihe({ dauern: Array(20).fill(120), fehler: 0 });
  if (!gesund.ok) fehler.push("gesunde Messreihe löst fälschlich Alarm aus");
  return { bestanden: fehler.length === 0, fehler };
}

/** Feuert PARALLEL Anfragen gegen ein Ziel und sammelt Dauern und Fehler. */
export async function messeZiel(url, { fetchImpl = fetch, parallel = PARALLEL } = {}) {
  const einzeln = async () => {
    const begonnen = Date.now();
    try {
      const antwort = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      return antwort.ok ? { dauerMs: Date.now() - begonnen } : { fehler: true };
    } catch {
      return { fehler: true };
    }
  };
  const ergebnisse = await Promise.all(Array.from({ length: parallel }, einzeln));
  return {
    dauern: ergebnisse.filter((e) => !e.fehler).map((e) => e.dauerMs),
    fehler: ergebnisse.filter((e) => e.fehler).length
  };
}

/**
 * Der Lauf im Takt: wöchentlich messen, dazwischen den Stand melden.
 */
export async function laufLastProbe({ mitNetz = true, ablage = null, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Last-Probe rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* unten neu gemessen */ }
  const alterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;

  if (Number.isFinite(alterMs) && alterMs < PROBE_ABSTAND_MS && stand) {
    const tage = Math.round(alterMs / 86_400_000);
    if (!stand.ok) {
      return { ok: false, meldung: `Letzte Last-Probe (vor ${tage} Tag(en)) fiel durch: ${stand.zusammenfassung}` };
    }
    return { ok: true, meldung: `Last-Probe aktuell (vor ${tage} Tag(en)): ${stand.zusammenfassung}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Last-Probe fällig — läuft im nächsten Netz-Takt" };
  }

  const ziele = [
    { name: "Control", url: `${String(env.SMEJJ_CONTROL_ORIGIN || "https://smejj-control.zeabur.app").replace(/\/+$/, "")}/api/health` },
    { name: "Brücke", url: `${String(env.SMEJJ_BRUECKE_URL || "https://smejj-chat-bridge.zeabur.app").replace(/\/+$/, "")}/health` }
  ];
  const urteile = [];
  for (const ziel of ziele) {
    const messreihe = await messeZiel(ziel.url, { fetchImpl });
    const urteil = beurteileMessreihe(messreihe);
    urteile.push({ name: ziel.name, ...urteil });
  }
  const kaputte = urteile.filter((u) => !u.ok);
  const zusammenfassung = urteile.map((u) => `${u.name}: ${u.grund}`).join("; ");
  try {
    await speicher.schreib({ id: ABLAGE_ID, createdAt: new Date(jetztMs).toISOString(), ok: kaputte.length === 0, zusammenfassung });
  } catch { /* die Meldung unten trägt die Zahlen auch ohne Ablage */ }
  if (kaputte.length) {
    return { ok: false, meldung: `Last-Probe (${PARALLEL} parallel) durchgefallen — ${zusammenfassung}` };
  }
  return { ok: true, meldung: `Last-Probe (${PARALLEL} parallel) bestanden — ${zusammenfassung}` };
}
