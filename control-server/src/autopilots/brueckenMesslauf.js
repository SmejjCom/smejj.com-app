// smejj.com — gemeinsamer Messlauf gegen die Chat-Brücke für Nr. 75
// (Tiefe-Spur-Messung) und Nr. 79 (Red-Team-Probe), Audit A bis Z 03.09.
//
// WARUM EIN HELFER: Beide Wächter tun dasselbe — echte Fälle mit Zusicherungen
// gegen die LIVE-Brücke fahren, mit derselben Bewertung wie der Mac-Messlauf
// (scoreCase/aggregateCaseScores), und das Ergebnis neustart-fest ablegen.
//
// ZWEI HAUSREGELN, die hier eingebaut sind:
//   1. Die Brücke erlaubt 12 Anfragen je Minute und Client. Der Lauf hält
//      5,5 s Abstand (wie scripts/verlauf/messlauf.mjs) — „nicht schneller
//      machen" steht dort seit dem 429-Vorfall.
//   2. Ein Lauf dauert Minuten; der Taktgeber gibt jedem Lauf 120 s. Darum
//      läuft die Messung im HINTERGRUND (eine je Kennung, nie parallel), und
//      die Ampel meldet den abgelegten Stand. Transportfehler (HTTP, Timeout,
//      Notfall-Assistent) sind keine schlechte Note, sondern „nicht messbar".
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordStore } from "../admin/recordStore.js";
import { issueSessionToken } from "../auth/sessionToken.js";
import { callViaControl } from "../../../src/evaluation/evalTransport.js";
import { scoreCase, aggregateCaseScores } from "../../../src/evaluation/evalScoring.js";
import { loadEvalSuite, expandPack } from "../../../src/evaluation/evalPacks.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const ABSTAND_MS = 5_500;
export const MESS_ABSTAND_MS = 22 * 60 * 60 * 1000;
export const ABLAGE_ID = "letzter-lauf";

const laufend = new Map();

/** Lädt die 14 Fälle der Kernsuite (nur die Dateien, die im Abbild liegen). */
export async function ladeKernsuite() {
  const { suite } = await loadEvalSuite(path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json"));
  return suite.cases;
}

/** Lädt ausgewählte Fälle eines Eval-Packs (Kurzschreibweise → Zusicherungen). */
export async function ladePackFaelle(packDatei, ids = []) {
  const pack = JSON.parse(await readFile(path.join(WURZEL, packDatei), "utf8"));
  const erg = expandPack(pack);
  const faelle = Array.isArray(erg) ? erg : (erg.cases || erg.faelle || []);
  const gewollt = new Set(ids);
  return ids.length ? faelle.filter((f) => gewollt.has(f.id)) : faelle;
}

/** Beurteilt eine Zusammenfassung. Getrennt testbar (kaputt + gesund). */
export function beurteileMessung(summary, { mindestNote = 0.95 } = {}) {
  if (!summary || !Number.isFinite(summary.cases) || summary.cases <= 0) return { ok: false, grund: "keine Fälle gemessen" };
  const prozent = Math.round((summary.weightedScore || 0) * 1000) / 10;
  if (summary.errors > 0) return { ok: false, grund: `nicht messbar: ${summary.errors} von ${summary.cases} Fällen mit Transportfehler (HTTP/Timeout/Notfall-Assistent)`, prozent };
  const zahlen = `Note ${String(prozent).replace(".", ",")} % (${summary.cases} Fälle, ${summary.criticalFailures} kritisch, p95 ${summary.latencyMsP95 ?? "?"} ms)`;
  if (summary.criticalFailures > 0) return { ok: false, grund: `${zahlen} — kritische Zusicherung verletzt`, prozent };
  if ((summary.weightedScore || 0) < mindestNote) return { ok: false, grund: `${zahlen} — unter der Messlatte ${Math.round(mindestNote * 100)} %`, prozent };
  return { ok: true, grund: zahlen, prozent };
}

async function messe({ faelle, modelId, env, fetchImpl, sleep }) {
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) throw new Error("SMEJJ_SESSION_SECRET fehlt — Brücke nicht anfragbar");
  const basis = String(env.SMEJJ_BRUECKE_URL || "https://smejj-chat-bridge.zeabur.app").replace(/\/+$/, "");
  const token = issueSessionToken({ secret, user: { userId: "messlauf-autopilot", email: "messlauf@smejj.invalid", method: "local-e2e" }, ttlMs: 30 * 60 * 1000 });
  const scores = [];
  for (const fall of faelle) {
    const ergebnis = await callViaControl(fall, { endpoint: `${basis}/api/chat`, modelId, fetchImpl, timeoutMs: 60_000, headers: { Authorization: `Bearer ${token}` } });
    scores.push(scoreCase(fall, ergebnis));
    await sleep(ABSTAND_MS);
  }
  return { summary: aggregateCaseScores(scores), faelle: scores.map((s) => ({ id: s.caseId, status: s.status, score: s.score, kritisch: s.criticalFailed })) };
}

/**
 * Startet bei Fälligkeit eine Hintergrund-Messung und meldet den abgelegten
 * Stand. `faelleLader` liefert die Fälle, `modelId` wählt die Spur
 * ("glm-5-2" = tiefe Spur, "" = Schnellspur wie der Nutzer).
 */
export async function messlaufImTakt({
  kennung, faelleLader, modelId = "", mindestNote = 0.95, mitNetz = true, env = process.env, fetchImpl = fetch,
  ablage = null, jetztMs = Date.now(), sleep = (ms) => new Promise((f) => setTimeout(f, ms)), messAbstandMs = MESS_ABSTAND_MS
} = {}) {
  const speicher = ablage || createRecordStore(`autopiloten/${kennung}`, { maximal: 10 });
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* neu messen */ }
  const alterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;
  const frisch = stand && Number.isFinite(alterMs) && alterMs < messAbstandMs;
  const bericht = stand ? `${stand.grund} (vor ${Math.max(0, Math.round(alterMs / 3_600_000))} h gegen ${stand.modelId || "Schnellspur"})` : "noch keine Messung abgelegt";
  if (frisch) return { ok: stand.ok !== false, meldung: bericht };
  if (!mitNetz) return { ok: stand ? stand.ok !== false : true, meldung: `Messung fällig — läuft im nächsten Netz-Takt; ${bericht}` };
  if (laufend.get(kennung)) return { ok: stand ? stand.ok !== false : true, meldung: `Messung läuft gerade im Hintergrund; ${bericht}` };

  const arbeit = (async () => {
    try {
      const faelle = await faelleLader();
      const { summary, faelle: einzeln } = await messe({ faelle, modelId, env, fetchImpl, sleep });
      const urteil = beurteileMessung(summary, { mindestNote });
      await speicher.schreib({ id: ABLAGE_ID, createdAt: new Date().toISOString(), ok: urteil.ok, grund: urteil.grund, prozent: urteil.prozent, modelId: modelId || "live-default", summary, faelle: einzeln }, { timeoutMs: 5000 });
    } catch (f) {
      try { await speicher.schreib({ id: ABLAGE_ID, createdAt: new Date().toISOString(), ok: false, grund: `nicht messbar: ${String(f?.message || f).slice(0, 80)}`, modelId: modelId || "live-default" }, { timeoutMs: 5000 }); } catch { /* still */ }
    } finally { laufend.delete(kennung); }
  })();
  laufend.set(kennung, arbeit);
  return { ok: stand ? stand.ok !== false : true, meldung: `Messung gestartet (Hintergrund, ${modelId || "Schnellspur"}); ${bericht}` };
}

/** Für Tests: wartet auf eine laufende Hintergrund-Messung. */
export async function warteAufMessung(kennung) { await laufend.get(kennung); }
