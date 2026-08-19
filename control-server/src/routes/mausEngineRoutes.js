// smejj.com control-server — Maus-Engine-Bridge (modellunabhaengig).
// Der Control Server plant und dispatcht nur: er baut den Planer-Aufruf
// ueber den bestehenden AI Router (GLM-5.2 zuerst, jedes Modell via
// requestedModel/BYOK moeglich), validiert fail-closed und delegiert die
// Ausfuehrung an den stateless Maus-Engine-Worker hinter dem bestehenden
// Budget-Gate. Keine Browserarbeit, keine Artefakte im Control Server.
import crypto from "node:crypto";
import { json } from "../http/respond.js";
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { aiTransparencyHeaders, transparencyNotice } from "../compliance/aiTransparency.js";
import { resolveChain, resolveModelRequest, executeWithFallback } from "../llm/modelRouter.js";
import { planAndExecute } from "../../../workers/maus-engine/planner-roundtrip.mjs";
import { buildStepPrompt } from "../../../workers/maus-engine/prompt-template.mjs";
import { validateLoopDecision } from "../../../workers/maus-engine/interactive-loop.mjs";
import { createMacroStore } from "../../../workers/maus-engine/macro-store.mjs";
import { idriveConfigFromEnv } from "../../../workers/maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../../../workers/glm-salad/s3.js";
// 2026-08-19 ausgelagert (800-Zeilen-Regel). buildPlannerClient wird hier
// zugleich WEITER EXPORTIERT: tests/maus-engine-route.test.mjs holt ihn von
// dieser Datei, und der bisherige Einstieg soll unveraendert gueltig bleiben.
import { buildPlannerClient, PLANER_TIMEOUT_MS } from "./mausPlanerClient.js";
export { buildPlannerClient };
import {
  ASYNC_RUN_TIMEOUT_MS, rememberAsyncRun, countRunningAsyncRuns,
  defaultRunStore, runAsyncInBackground, leseAsyncLauf
} from "./mausLaeufeSpeicher.js";

const MAX_BODY_BYTES = 128_000;
const MAX_PLANNER_PROMPT_CHARS = 24_000;
// VIER FRISTEN — und die oberste gehoert uns NICHT.
//
//   0. GATEWAY_HARTGRENZE_MS  die Plattform kappt die offene Verbindung
//   1. maxDurationMs          der Lauf stoppt sich SELBST (in der Engine)
//   2. WORKER_TIMEOUT_MS      so lange wartet der Control Server auf Antwort
//   3. ASYNC_RUN_TIMEOUT_MS   so lange lebt der Hintergrund-Auftrag
//
// Die Ordnung 1 < 0 und 1 < 2 < 3 ist der ganze Sinn: der Lauf soll sich SELBST
// beenden und ein ERGEBNIS liefern. Reisst vorher die Verbindung, gibt es kein
// Ergebnis, nur `worker_fehler: fetch failed` — man weiss dann nicht einmal,
// wie weit er kam.
//
// WIE WIR AUF PUNKT 0 GEKOMMEN SIND (2026-08-17, zwei Bauten in die falsche
// Richtung): Als LOOP_DEFAULT_STEPS von 8 auf 16 stieg, brach der Lauf nach gut
// fuenf Minuten ab. Naheliegende Deutung: unsere eigene Frist ist zu klein.
// Also WORKER_TIMEOUT_MS auf 660 s und die Lauf-Frist auf 600 s angehoben —
// **es aenderte nichts.** Derselbe Abbruch, dieselbe Zeit. Damit war bewiesen,
// dass nicht unsere Frist zuschlaegt, sondern die Plattform die Verbindung
// zwischen Control und Engine kappt.
//
// Merkregel: bevor man die eigene Frist anhebt, messen, WESSEN Frist zuschlaegt.
// Eine Zahl, die man selbst kontrolliert, ist die verlockendste falsche Antwort.
const GATEWAY_HARTGRENZE_MS = 300_000;
const WORKER_TIMEOUT_MS = 330_000;
const RATE_CAPACITY = 6;
const RATE_REFILL_PER_SEC = 0.05;
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });


// Budget-Defaults gemaess docs/architecture/MAUS_ENGINE.md (Freigabe Phase 0);
// Overrides aus dem Request werden hart auf die Schema-Grenzen geklemmt.
const BUDGET_DEFAULTS = Object.freeze({
  maxActions: 60,
  maxLocalRetries: 2,
  maxPlannerRoundtrips: 2,
  maxDurationMs: 300_000,
  defaultActionTimeoutMs: 30_000,
  // Interaktiver Loop-Modus (additiv 2026-07-15): 0 = aus. Nur bei
  // mode:"interaktiv" wird ohne Override der Standard 8 gesetzt.
  maxLoopSteps: 0
});
const BUDGET_LIMITS = Object.freeze({
  maxActions: [1, 500],
  maxLocalRetries: [0, 5],
  maxPlannerRoundtrips: [0, 3],
  maxDurationMs: [1000, 1_800_000],
  defaultActionTimeoutMs: [100, 120_000],
  maxLoopSteps: [0, 25]
});
// Schrittzahl des freien Modus, wenn der Aufrufer keine nennt.
//
// Die Zahl wird NICHT von dem bestimmt, was die Maus koennte, sondern davon,
// was in eine Verbindung passt. Gemessen: 20-30 s je Schritt (eine Modellfrage
// plus eine Browseraktion), und die Plattform kappt bei GATEWAY_HARTGRENZE_MS.
// 10 Schritte x 24 s = 240 s liegen darunter, 16 lagen darueber — deshalb
// zurueck von 16 auf 10.
//
// Der Weg dahin, damit ihn niemand nochmal geht: 8 war zu wenig (der Auftrag
// "Hilfeseite oeffnen, Impressum anklicken" endete mit
// `loop_budget_erschoepft`), 16 war mehr, als eine Verbindung liefern kann
// (`worker_fehler: fetch failed`). Mehr als ~12 gibt es erst, wenn die Engine
// selbst asynchron wird — Lauf starten, Status pollen. Das ist eine
// Architekturaenderung, keine Zahl.
//
// Jeder Schritt kostet EINEN Modellaufruf. Deshalb bleibt der Plan-Modus die
// Voreinstellung.
const LOOP_DEFAULT_STEPS = 10;
// Lauf-Frist des freien Modus. Sie ist bewusst KLEINER als die Plattformgrenze:
// so beendet sich der Lauf selbst und liefert ein Ergebnis, statt an einer
// gekappten Verbindung zu sterben. Die 60 s Abstand sind Luft fuer den letzten
// Schritt, der gerade laeuft.
const LOOP_DEFAULT_DURATION_MS = 240_000;

// Nach aussen gegeben, damit ein Test die Staffelung pruefen kann. Sie steht
// sonst nur als Kommentar da, und ein Kommentar haelt keine Zahl fest.
export const ZEITGRENZEN = Object.freeze({
  gatewayHartgrenze: GATEWAY_HARTGRENZE_MS,
  planerVersuch: PLANER_TIMEOUT_MS,
  planLaufFrist: BUDGET_DEFAULTS.maxDurationMs,
  loopLaufFrist: LOOP_DEFAULT_DURATION_MS,
  workerAntwort: WORKER_TIMEOUT_MS,
  hintergrundLauf: ASYNC_RUN_TIMEOUT_MS,
  loopSchritte: LOOP_DEFAULT_STEPS,
  // Gemessen, nicht geschaetzt: 20-30 s je Schritt. Der Test rechnet mit dem
  // oberen Wert, damit die Voreinstellung auch an einem langsamen Tag passt.
  sekundenJeSchritt: 24
});

export function readMausEngineConfig(env = process.env) {
  const workerUrl = String(env.SMEJJ_MAUS_ENGINE_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = String(env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
  const enabled = env.SMEJJ_MAUS_ENGINE_ENABLED === "YES";
  const missing = [
    !enabled && "SMEJJ_MAUS_ENGINE_ENABLED=YES",
    !workerUrl && "SMEJJ_MAUS_ENGINE_WORKER_URL",
    !token && "SMEJJ_MAUS_ENGINE_TOKEN"
  ].filter(Boolean);
  return { configured: missing.length === 0, enabled, workerUrl, token, tokenPresent: Boolean(token), missing };
}


function clampBudget(overrides = {}) {
  const budget = { ...BUDGET_DEFAULTS };
  for (const [key, [min, max]] of Object.entries(BUDGET_LIMITS)) {
    const value = Number.parseInt(overrides?.[key], 10);
    if (Number.isFinite(value)) budget[key] = Math.min(max, Math.max(min, value));
  }
  return budget;
}

function sanitizedFiles(files) {
  if (!files || typeof files !== "object") return undefined;
  const out = {};
  if (files.downloadAllowed === true) out.downloadAllowed = true;
  if (files.uploadAllowed === true) out.uploadAllowed = true;
  if (Array.isArray(files.allowedExtensions)) out.allowedExtensions = files.allowedExtensions.slice(0, 20).map(String);
  if (Number.isFinite(files.maxFileBytes)) out.maxFileBytes = Math.min(1_073_741_824, Math.max(1, Math.floor(files.maxFileBytes)));
  return Object.keys(out).length ? out : undefined;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_zu_gross");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Health-Gate vor jedem Dispatch: Der Worker ist bewusst exit-after-run
// (stateless, Scale-to-zero) und startet nach jedem Lauf neu. Ohne dieses
// Gate treffen Planer-Roundtrips einen toten Worker (Gateway 503).
// Fail-closed: Wird der Worker im Zeitfenster nicht bereit, bricht der
// Lauf mit klarem Grund ab — es wird nie blind gesendet.
export async function waitForWorkerReady({ config, fetchImpl = fetch, maxWaitMs = 240_000, pollMs = 5_000, sleep } = {}) {
  const pause = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + maxWaitMs;
  let attempts = 0;
  while (Date.now() <= deadline) {
    attempts += 1;
    try {
      const response = await fetchImpl(`${config.workerUrl}/health`, { method: "GET" });
      if (response?.ok === true || response?.status === 200) {
        const body = await response.json().catch(() => null);
        if (body?.ok === true) return { ready: true, attempts };
      }
    } catch {
      // Netz-/Gateway-Fehler zaehlen als "noch nicht bereit" — kein Abbruch.
    }
    if (Date.now() + pollMs > deadline) break;
    await pause(pollMs);
  }
  return { ready: false, attempts };
}

// Eine Deutung fuer Plan- und Loop-Pfad: zwei Rechenwege waeren zwei
// Wahrheiten. `error` bleibt maschinenlesbar (z. B. "nicht_autorisiert"),
// `abortReason` traegt den Status zusaetzlich fuer die Anzeige.
// Klartext-Regel: 401/403 heisst Token-Unterschied, nicht "Maus kaputt".
// Gibt den Fehlerstatus zurueck oder 0, wenn kein Fehler BELEGT ist.
// Bewusst vorsichtig: nur ein positiv erkannter Nicht-2xx-Status gilt als
// Fehler. `waitForWorkerReady` akzeptiert oben ebenso `ok` ODER `status` —
// wer hier strenger prueft, erklaert erfolgreiche Laeufe zu Fehlern, sobald
// eine Antwort nur eines von beiden Feldern traegt.
export function workerStatusFehler(response) {
  if (response?.ok === true) return 0;
  const status = Number(response?.status ?? 0);
  if (status >= 200 && status < 300) return 0;
  return status > 0 ? status : 0;
}

export function workerHttpFehler(status, summary) {
  const roh = summary && typeof summary === "object" ? summary.error ?? summary.abortReason : null;
  const error = String(roh || `worker_http_${status}`).slice(0, 160);
  const hinweis = status === 401 || status === 403
    ? " (Token von Control-Server und Maus-Engine stimmen nicht ueberein)"
    : "";
  return { infra: true, aborted: true, error, abortReason: `worker_http_${status}: ${error}${hinweis}` };
}

// Worker-Aufruf: Ausfuehrung ausschliesslich im stateless Salad-Worker.
// 422 (Plan abgelehnt) wird als Abbruch an den Roundtrip zurueckgemeldet.
function buildRunPlan({ config, fetchImpl, saveAsMacro, readiness }) {
  return async (plan) => {
    const gate = await waitForWorkerReady({ config, fetchImpl, ...(readiness || {}) });
    if (!gate.ready) {
      return { ok: false, infra: true, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.workerUrl}/run`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({ plan, ...(saveAsMacro ? { saveAsMacro } : {}) })
      });
      const summary = await response.json().catch(() => null);
      if (!summary || typeof summary !== "object") {
        return { ok: false, infra: true, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}` };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `plan_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}` };
      }
      // HTTP-Status pruefen. Eine 401/403/500 der Engine ist KEIN inhaltlich
      // gescheiterter Lauf: ohne diese Pruefung kam der Fehler-Body als
      // `summary` durch und erzeugte {ok:false} ohne failedStep, ohne aborted,
      // mit leerem actionLog — eine Signatur, die der Interpreter gar nicht
      // erzeugen kann. Der echte Grund (z. B. nicht_autorisiert) fiel weg.
      const fehlerStatus = workerStatusFehler(response);
      if (fehlerStatus) {
        return { ok: false, ...workerHttpFehler(fehlerStatus, summary) };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, infra: true, aborted: true, abortReason: reason };
    } finally {
      clearTimeout(timer);
    }
  };
}

// Interaktiver Loop-Modus (additiv 2026-07-15): der Loop laeuft IM Worker
// (dort lebt der Browser). Der Control Server dispatcht nur den loopTask
// und reicht das haerte Budget durch; der Worker lehnt ohne eigene
// Planer-Konfiguration fail-closed ab.
function buildRunLoop({ config, fetchImpl, readiness }) {
  return async ({ task, policyInput }) => {
    const gate = await waitForWorkerReady({ config, fetchImpl, ...(readiness || {}) });
    if (!gate.ready) {
      return { ok: false, infra: true, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.workerUrl}/run`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({ loopTask: { task, policyInput } })
      });
      const summary = await response.json().catch(() => null);
      if (!summary || typeof summary !== "object") {
        return { ok: false, infra: true, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `loop_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      const fehlerStatusLoop = workerStatusFehler(response);
      if (fehlerStatusLoop) {
        return { ok: false, ...workerHttpFehler(fehlerStatusLoop, summary), loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, infra: true, aborted: true, abortReason: reason, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
    } finally {
      clearTimeout(timer);
    }
  };
}

// Makro-Store fuer Stufe 0 (0 Modell-Aufrufe) und den Loop-Recorder.
// Fail-safe: ohne vollstaendige e2-Konfiguration einfach kein Store —
// Verhalten dann exakt wie vor der Erweiterung.
function buildMacroStore(env) {
  try {
    return createMacroStore({ config: idriveConfigFromEnv(env) });
  } catch {
    return null;
  }
}

// GET /api/maus/run — Statussicht (auth-gated ueber controlAccessPolicy).
// Mit ?runId=... liefert sie den Status/das Ergebnis eines Async-Laufs.
export async function handleMausStatus(req, res, { env = process.env, activeWorkers = 0, runStore = null } = {}) {
  if (!req?.authUser) return json(res, 401, { ok: false, error: "authentication_required" });
  const runId = readRunIdFromRequest(req);
  if (runId) {
    const memory = leseAsyncLauf(runId);
    if (memory && memory.status === "laeuft") {
      // planId wird mitgegeben, SOBALD der Plan steht (onPlan) — nicht erst am
      // Ende. Ohne sie kann die Wiedergabe den Live-Pfad in der Capsule nicht
      // bilden und muesste bis zum Schluss warten; genau das war die Luecke
      // zwischen "Lauf laeuft" und "zuschauen".
      return json(res, 200, {
        ok: true, runId, status: "laeuft",
        capsuleRef: memory.capsuleRef ?? null,
        planId: memory.planId ?? null,
        startedAt: memory.startedAt ?? null
      });
    }
    if (memory && memory.payload) {
      return json(res, 200, { ok: true, runId, status: memory.status, result: memory.payload });
    }
    const stored = await (runStore || defaultRunStore(env)).get(runId);
    if (stored) return json(res, 200, { ok: true, runId, status: stored.status ?? "fertig", result: stored });
    return json(res, 404, { ok: false, runId, status: "unbekannt" });
  }
  const config = readMausEngineConfig(env);
  const budget = evaluateWorkerBudget({ env, activeWorkers: Math.max(activeWorkers, countRunningAsyncRuns()) });
  return json(res, 200, {
    ok: config.configured && budget.ok,
    engine: "smejj.com maus-engine",
    configured: config.configured,
    missing: config.missing,
    budget: { ok: budget.ok, reasons: budget.reasons ?? [] },
    startsCompute: false
  });
}

function readRunIdFromRequest(req) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const value = String(url.searchParams.get("runId") || "").trim();
    return /^[a-z0-9-]{8,80}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

// Worker-Authentifizierung fuer den Planer-Proxy: der stateless Worker hat
// keine Nutzer-Sitzung, aber das gemeinsame Engine-Token (Salad-Secret).
// Konstanter Vergleich ueber timingSafeEqual (fail-closed ohne Token).
/**
 * Traegt diese Anfrage das Engine-Token der Maus?
 *
 * WARUM ES DIESE EXPORTIERTE FASSUNG GIBT (Befund 2026-08-17):
 * Der Planer-Proxy fuer den freien Modus war vollstaendig gebaut, getestet und
 * ausgerollt — und trotzdem von aussen NIE erreichbar. `/api/maus/run` steht in
 * USER_PROTECTED_EXACT_PATHS, also weist der globale Torwaechter in
 * src/server.js jede Anfrage ohne gueltige SITZUNG mit 401 ab, lange bevor
 * `handleMausRun` und damit `isWorkerRequest` ueberhaupt laufen. Die Engine
 * traegt aber keine Sitzung, sondern ein Token.
 *
 * Die Unit-Tests haben es nicht gefunden, weil sie `handleMausRun` direkt
 * aufrufen und den Waechter damit ueberspringen. Genau die Luecke zwischen
 * "getestet" und "erreichbar" — der freie Modus meldete `loop_planner_http_401`
 * und sah wie ein Token-Problem aus, obwohl beide Token nachweislich gleich
 * waren.
 *
 * Der Torwaechter darf diese eine Anfrage deshalb durchlassen. Gefaehrlich ist
 * das nicht: `handleMausRun` erlaubt einer Token-Anfrage AUSSCHLIESSLICH den
 * Planer-Proxy (`plannerPrompt`) und antwortet auf alles andere fail-closed mit
 * 403 — insbesondere darf sie keinen Lauf starten.
 */
export function istMausEngineToken(req, env = process.env) {
  return isWorkerRequest(req, readMausEngineConfig(env));
}

function isWorkerRequest(req, config) {
  const header = String(req?.headers?.authorization || "");
  if (!config.tokenPresent || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.token);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

// Planer-Proxy fuer den interaktiven Loop-Modus (additiv 2026-07-15).
// Warum: Der Loop braucht pro Schritt EINE Modellentscheidung. Wuerde der
// Worker das Modell selbst rufen, muesste ein zweiter API-Key (BYOK) in den
// Worker dupliziert werden und der zentrale Modell-Router waere umgangen —
// beides verstoesst gegen die Router-/BYOK-Policy (Master-Prompt: alle
// Modelle ausschliesslich ueber den zentralen Router). Stattdessen fragt der
// Worker mit dem bestehenden Engine-Token hier an; der Control Server bleibt
// der EINZIGE Ort mit Modell-Zugaengen und entscheidet modellneutral.
// Fail-closed: nur Worker-Token, nur String-Prompt, hartes Laengenlimit.
export async function handleMausPlannerProxy(req, res, prompt, { env, fetchImpl, requestedModel = "", budgetEvaluator = evaluateWorkerBudget, plannerClient = null }) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PLANNER_PROMPT_CHARS) {
    return json(res, 400, { ok: false, error: "planner_prompt_ungueltig_oder_zu_lang" });
  }
  // activeWorkers BEWUSST 0 — und das ist kein Loch im Kostendeckel.
  //
  // Der Nebenläufigkeits-Teil des Gates beantwortet die Frage "darf NOCH ein
  // Arbeiter starten?". Hier startet keiner: der Proxy stellt genau eine
  // Modellfrage FUER einen Arbeiter, der laengst laeuft und beim Start bereits
  // durch dasselbe Gate ging (startsCompute ist hier immer false).
  //
  // Mit der Zaehlung war der freie Modus im Async-Betrieb unbenutzbar: der
  // laufende Auftrag zaehlte als aktiver Arbeiter, SMEJJ_BUDGET_MAX_CONCURRENT_
  // WORKERS steht auf 1, also verweigerte das Gate ausgerechnet die Anfragen
  // DESSELBEN Auftrags — er blockierte sich selbst. Sichtbar als
  // `loop_planner_http_503`, gemessen am 2026-08-17.
  //
  // Alle Kostengrenzen gelten unveraendert weiter: Budget je Auftrag, Laufzeit,
  // die Obergrenzen aus der Umgebung. Nur die Frage nach einem ZUSAETZLICHEN
  // Arbeiter wird nicht gestellt, weil sie hier keinen Sinn ergibt.
  const budgetVerdict = budgetEvaluator({ env, activeWorkers: 0 });
  if (!budgetVerdict.ok) {
    // reasons (Liste) statt reason (Einzahl): evaluateWorkerBudget liefert nie ein
    // Feld "reason". Die Antwort lautete deshalb immer `"reason": null` — der Aufrufer
    // sah, DASS das Gate blockt, nie WARUM (Befund 2026-08-17: zwei fehlende
    // Umgebungswerte kosteten eine halbe Stunde Suche).
    return json(res, 503, { ok: false, error: "budget_gate_blockiert", reasons: budgetVerdict.reasons ?? [] });
  }
  try {
    const client = plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel });
    const content = await client(prompt);
    // Antwortform bewusst OpenAI-kompatibel: der Worker bleibt modellneutral
    // und kennt weiterhin kein Modell, nur JSON.
    return json(res, 200, { ok: true, choices: [{ message: { content } }] });
  } catch (error) {
    return json(res, 502, { ok: false, error: String(error?.message || error).slice(0, 200) });
  }
}

// POST /api/maus/run — Aufgabe -> Plan (AI Router) -> Maus-Engine-Worker.
export async function handleMausRun(req, res, {
  env = process.env,
  fetchImpl = fetch,
  limiter = defaultLimiter,
  activeWorkers = 0,
  plannerClient = null,
  budgetEvaluator = evaluateWorkerBudget,
  runStore = null
} = {}) {
  const config = readMausEngineConfig(env);
  // Planer-Proxy des Loop-Modus (additiv): Anfragen des stateless Workers
  // tragen das Engine-Token statt einer Nutzer-Sitzung. Sie duerfen NUR den
  // Proxy ausloesen, nie einen Lauf starten (kein Task-Dispatch ohne Nutzer).
  // EU-KI-Verordnung Art. 50: Hier bedient ein KI-System eigenstaendig einen
  // Browser. Jede Antwort dieses Endpunkts traegt deshalb die maschinenlesbare
  // Kennzeichnung und den verschaerften Hinweis â auch die Fehlerantworten,
  // damit der Hinweis nicht ausgerechnet dann fehlt, wenn etwas schiefgeht.
  for (const [name, value] of Object.entries(aiTransparencyHeaders("maus-engine-v2"))) res.setHeader?.(name, value);
  const fromWorker = isWorkerRequest(req, config);
  if (!req?.authUser && !fromWorker) return json(res, 401, { ok: false, error: "authentication_required" });
  // Die Bremse gilt fuer NUTZER, die Auftraege starten: 6 Anfragen, dann eine
  // alle 20 Sekunden. Fuer die Schrittfragen EINES LAUFENDEN Auftrags ist sie
  // die falsche Bremse — ein freier Lauf stellt bis zu 16 davon in schneller
  // Folge und war nach der sechsten tot ("Zu viele Maus-Engine-Anfragen",
  // gemessen 2026-08-17). Die Bremse fuer den Loop ist seine Schrittzahl, und
  // die setzt derselbe Server eine Ebene hoeher.
  //
  // Ungebremst ist das nicht: die Anfrage braucht das Engine-Token, darf
  // ausschliesslich den Planer-Proxy ausloesen, und der Lauf, fuer den sie
  // fragt, ist durch maxLoopSteps und das Budget-Gate hart begrenzt.
  const istSchrittfrage = fromWorker && !req?.authUser;
  if (limiter && !istSchrittfrage) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Maus-Engine-Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }
  if (!config.configured) {
    return json(res, 503, { ok: false, error: "maus_engine_nicht_konfiguriert", missing: config.missing });
  }
  // Eine Anfrage mit Engine-Token kann keinen Arbeiter starten — sie darf laut
  // der Weiche unten AUSSCHLIESSLICH den Planer-Proxy ausloesen. Ihr die
  // Nebenlaeufigkeit anzurechnen, beantwortet also eine Frage, die sich hier
  // nicht stellt. Siehe die ausfuehrliche Begruendung in handleMausPlannerProxy.
  const budgetVerdict = budgetEvaluator({
    env,
    activeWorkers: istSchrittfrage ? 0 : Math.max(activeWorkers, countRunningAsyncRuns())
  });
  if (!budgetVerdict.ok) {
    // reasons (Liste) statt reason (Einzahl): evaluateWorkerBudget liefert nie ein
    // Feld "reason". Die Antwort lautete deshalb immer `"reason": null` — der Aufrufer
    // sah, DASS das Gate blockt, nie WARUM (Befund 2026-08-17: zwei fehlende
    // Umgebungswerte kosteten eine halbe Stunde Suche).
    return json(res, 503, { ok: false, error: "budget_gate_blockiert", reasons: budgetVerdict.reasons ?? [] });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { ok: false, error: "kein_gueltiges_json" });
  }

  // Worker-Anfragen: ausschliesslich Planer-Proxy, sonst fail-closed.
  if (fromWorker && !req?.authUser) {
    if (typeof body?.plannerPrompt !== "string") {
      return json(res, 403, { ok: false, error: "worker_token_darf_nur_plannerPrompt (fail-closed)" });
    }
    return handleMausPlannerProxy(req, res, body.plannerPrompt, {
      env,
      fetchImpl,
      budgetEvaluator,
      plannerClient,
      requestedModel: typeof body?.plannerModel === "string" ? body.plannerModel.trim() : ""
    });
  }

  const task = typeof body?.task === "string" ? body.task.trim() : "";
  const capsuleRef = typeof body?.capsuleRef === "string" ? body.capsuleRef.trim() : "";
  const domainAllowlist = Array.isArray(body?.domainAllowlist) ? body.domainAllowlist.slice(0, 20).map(String) : [];
  if (!task || task.length > 4000) return json(res, 400, { ok: false, error: "task_fehlt_oder_zu_lang" });
  if (!capsuleRef) return json(res, 400, { ok: false, error: "capsuleRef_fehlt (Task Capsule First)" });
  if (domainAllowlist.length === 0) return json(res, 400, { ok: false, error: "domainAllowlist_fehlt (fail-closed Pflicht)" });

  const policyInput = {
    capsuleRef,
    domainAllowlist,
    budget: clampBudget(body?.budget),
    files: sanitizedFiles(body?.files),
    // Stufe 3 (Vision) ist bis zur separaten Phase-3-Freigabe hart aus —
    // unabhaengig davon, was der Request behauptet.
    visionAllowed: false
  };
  const requestedModel = typeof body?.plannerModel === "string" ? body.plannerModel.trim() : "";
  const saveAsMacro = typeof body?.saveAsMacro === "string" && body.saveAsMacro.trim() ? body.saveAsMacro.trim() : undefined;
  // Interaktiver Loop-Modus (additiv): NICHT Standard. Nur bei
  // mode:"interaktiv" oder explizitem budget.maxLoopSteps > 0 wird der
  // Loop ueberhaupt verdrahtet; sonst bleibt alles exakt wie bisher.
  const interactive = body?.mode === "interaktiv";
  if (interactive && policyInput.budget.maxLoopSteps === 0) {
    policyInput.budget.maxLoopSteps = LOOP_DEFAULT_STEPS;
  }
  const loopEnabled = interactive || policyInput.budget.maxLoopSteps > 0;
  // Der freie Modus braucht mehr Zeit als ein Plan: jeder Schritt ist eine
  // Modellfrage PLUS eine Browseraktion. Mit den 300 s des Plan-Modus reichte
  // es fuer etwa acht Schritte — die sechzehn, die er nehmen darf, passten nie
  // hinein. Nur der Standard steigt; wer selbst eine Dauer angibt, behaelt sie.
  if (loopEnabled && !Number.isFinite(Number.parseInt(body?.budget?.maxDurationMs, 10))) {
    policyInput.budget.maxDurationMs = LOOP_DEFAULT_DURATION_MS;
  }
  // EINEN SCHRITT ENTSCHEIDEN — der freie Modus im Panel.
  //
  // Der Unterschied zum Plan-Modus ist der ganze Punkt: Statt alles vorab zu
  // planen und an der ersten Ueberraschung zu scheitern, schaut die Maus nach
  // JEDEM Schritt auf die Seite und entscheidet neu. So arbeitet auch Claudes
  // Maus, und der Betreiber hat genau das verlangt.
  //
  // Die Arbeitsteilung bleibt: der Server denkt (Modell + Pruefung), das
  // Panel handelt und zeigt. Der Seitenzustand kommt vom Panel herein und
  // wird als UNTRUSTED behandelt — buildStepPrompt rahmt ihn entsprechend.
  if (body?.naechsterSchritt === true) {
    const beobachtung = body?.beobachtung;
    if (!beobachtung || typeof beobachtung !== "object") {
      return json(res, 400, { ok: false, error: "beobachtung_fehlt", transparenzhinweis: transparencyNotice("maus-engine-v2") });
    }
    // Der Verlauf haelt die Maus davon ab, im Kreis zu laufen: ohne ihn
    // entscheidet sie bei gleichem Seitenzustand jedes Mal dasselbe.
    const verlauf = Array.isArray(body?.verlauf) ? body.verlauf.slice(-12).map(String) : [];
    const restSchritte = Math.max(1, Math.min(25, Number(body?.restSchritte) || LOOP_DEFAULT_STEPS));

    let entscheidung;
    try {
      const prompt = buildStepPrompt({
        task, capsuleRef, domainAllowlist,
        budget: policyInput.budget, files: policyInput.files,
        visionAllowed: false,
        observation: beobachtung,
        history: verlauf,
        remainingSteps: restSchritte
      });
      const roh = await (plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel }))(prompt);
      entscheidung = validateLoopDecision(roh, policyInput);
    } catch (error) {
      return json(res, 502, {
        ok: false, error: String(error?.message || error).slice(0, 200),
        transparenzhinweis: transparencyNotice("maus-engine-v2")
      });
    }
    // Fail-closed wie ueberall: eine Entscheidung, die die Pruefung nicht
    // besteht, wird NICHT ausgefuehrt — auch nicht "so ungefaehr".
    if (!entscheidung.ok) {
      return json(res, 422, {
        ok: false, error: "entscheidung_abgelehnt", gruende: entscheidung.errors?.slice(0, 5) || [],
        transparenzhinweis: transparencyNotice("maus-engine-v2")
      });
    }
    return json(res, 200, {
      ok: true,
      entscheidung: entscheidung.decision,
      transparenzhinweis: transparencyNotice("maus-engine-v2")
    });
  }

  // NUR PLANEN, nicht ausfuehren.
  //
  // Damit der Betreiber der Maus ZUSEHEN kann, faehrt der Plan nicht hier,
  // sondern in seinem Panel: dieses zeichnet nach jeder Aktion ein neues Bild.
  // Der Server bleibt zustaendig fuer das, was nur er kann — Modelle und die
  // fail-closed-Pruefung des Plans. Er gibt den GEPRUEFTEN Plan heraus, und
  // das Panel fuehrt ihn Schritt fuer Schritt gegen seine eigene Sitzung aus.
  //
  // Sicherheit bleibt, wo sie war: der Plan durchlaeuft dieselbe Validierung
  // wie sonst. Herausgegeben wird nur, was sie bestanden hat.
  if (body?.nurPlan === true) {
    let geprueft = null;
    let planerMessung = null;
    // Faellt der Planer aus (Anbieter gedrosselt, Modell weg), soll hier eine
    // LESBARE Meldung stehen. Ohne diesen Fang flog der Fehler als HTTP 500
    // durch — und 500 sagt dem Panel nichts ausser "irgendwas".
    let ergebnis;
    try {
      ergebnis = await planAndExecute({
        task,
        policyInput,
        plannerClient: plannerClient || buildPlannerClient({
          env, fetchImpl, requestedModel,
          melde: (m) => { planerMessung = m; }
        }),
        // Ausfuehrung faellt aus: der Plan soll nur entstehen und geprueft
      // werden. Der VOLLE Plan kommt hier an — `onPlan` liefert bewusst nur
      // eine Kurzmeldung fuer die Fortschrittsanzeige und waere der falsche
      // Griff (erst gemacht, dann gemerkt: der Plan kam ohne Schritte an).
        runPlan: async (plan) => { geprueft = plan; return { ok: true, nurGeplant: true }; }
      });
    } catch (error) {
      return json(res, 502, {
        ok: false,
        error: String(error?.message || error).slice(0, 200),
        hinweis: "Der Planer war nicht erreichbar. Mit plannerModel laesst sich ein Modell ausdruecklich waehlen.",
        transparenzhinweis: transparencyNotice("maus-engine-v2")
      });
    }
    if (!geprueft) {
      return json(res, 502, { ok: false, error: ergebnis?.error || "kein_plan_erzeugt", transparenzhinweis: transparencyNotice("maus-engine-v2") });
    }
    return json(res, 200, {
      ok: true,
      nurPlan: true,
      plan: geprueft,
      planId: geprueft.planId || null,
      plannerCalls: ergebnis?.plannerCalls ?? null,
      // Damit man beim naechsten "das dauert zu lange" MESSEN kann statt zu raten.
      planer: planerMessung,
      // WARUM wurde mehrfach geplant? Der Verlauf nennt die abgelehnten
      // Plaene mit Grund. Ohne ihn sieht man nur "plannerCalls: 2" und weiss
      // nicht, ob das Modell Unsinn liefert oder unsere Pruefung zu streng
      // ist — zwei sehr verschiedene Baustellen.
      verlauf: ergebnis?.history || null,
      transparenzhinweis: transparencyNotice("maus-engine-v2")
    });
  }

  const execute = (onPlan = null) => planAndExecute({
    task: interactive ? { text: task, mode: "interaktiv" } : task,
    policyInput,
    plannerClient: plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel }),
    runPlan: buildRunPlan({ config, fetchImpl, saveAsMacro }),
    ...(onPlan ? { onPlan } : {}),
    ...(loopEnabled ? { runLoop: buildRunLoop({ config, fetchImpl }), macroStore: buildMacroStore(env) } : {})
  });

  // Async-Modus: sofortige 202-Antwort mit runId; Ergebnis wird auf IDrive e2
  // persistiert und ueber GET ?runId= gepollt (umgeht das ~100-s-Antwortlimit
  // des Salad-Gateways; der Lauf selbst bleibt unveraendert fail-closed).
  if (body?.async === true) {
    const runId = `maus-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`;
    const startedAt = new Date().toISOString();
    rememberAsyncRun(runId, { status: "laeuft", capsuleRef, startedAt });
    const store = runStore || defaultRunStore(env);
    void runAsyncInBackground({ runId, capsuleRef, execute, store });
    return json(res, 202, {
      ok: true, async: true, runId, capsuleRef, status: "laeuft", startedAt,
      statusPath: `/api/maus/run?runId=${runId}`,
      transparenzhinweis: transparencyNotice("maus-engine-v2")
    });
  }

  try {
    const outcome = await execute();
    if (outcome.ok) {
      const { artifacts, recordedSteps, ...resultSummary } = outcome.result || {};
      return json(res, 200, {
        ok: true,
        planId: outcome.plan?.planId ?? outcome.result?.planId ?? null,
        capsuleRef,
        plannerCalls: outcome.plannerCalls,
        mode: outcome.mode ?? "plan",
        modelCalls: outcome.modelCalls ?? outcome.plannerCalls ?? null,
        loopSteps: outcome.loopSteps ?? 0,
        ...(outcome.macroSaved ? { macroSaved: outcome.macroSaved } : {}),
        history: outcome.history,
        transparenzhinweis: transparencyNotice("maus-engine-v2"),
        result: resultSummary
      });
    }
    return json(res, 502, {
      ok: false,
      error: outcome.error || "maus_engine_lauf_fehlgeschlagen",
      plannerCalls: outcome.plannerCalls ?? null,
      mode: outcome.mode ?? "plan",
      modelCalls: outcome.modelCalls ?? outcome.plannerCalls ?? null,
      loopSteps: outcome.loopSteps ?? 0,
      history: outcome.history || [],
      lastFailure: outcome.lastFailure
        ? { failedStep: outcome.lastFailure.failedStep ?? null, aborted: outcome.lastFailure.aborted === true, abortReason: outcome.lastFailure.abortReason ?? null, error: outcome.lastFailure.error ?? null, errors: outcome.lastFailure.errors }
        : null
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error).slice(0, 300) });
  }
}


