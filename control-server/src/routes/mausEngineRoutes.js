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
import { resolveModelRequest, executeWithFallback } from "../llm/modelRouter.js";
import { planAndExecute } from "../../../workers/maus-engine/planner-roundtrip.mjs";
import { createMacroStore } from "../../../workers/maus-engine/macro-store.mjs";
import { idriveConfigFromEnv } from "../../../workers/maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../../../workers/glm-salad/s3.js";

const MAX_BODY_BYTES = 128_000;
const MAX_PLANNER_PROMPT_CHARS = 24_000;
const WORKER_TIMEOUT_MS = 330_000;
const RATE_CAPACITY = 6;
const RATE_REFILL_PER_SEC = 0.05;
const ASYNC_RUN_TIMEOUT_MS = 900_000;
const ASYNC_RUN_MEMORY_LIMIT = 50;
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });

// Async-Laeufe (Salad-Gateway/Cloudflare kappt lange Antworten nach ~100 s):
// POST mit async:true antwortet sofort mit runId; das Ergebnis wird als
// e2-Objekt persistiert (Task Capsule First) und ueber GET ?runId= gepollt.
// In-Memory nur als schneller Status-Spiegel (Control laeuft mit 1 Replica);
// die einzige dauerhafte Wahrheit ist das e2-Objekt — fail-closed.
const asyncRuns = new Map();

function asyncRunKey(runId) {
  return `capsules/maus-engine/runs/${runId}.json`;
}

function rememberAsyncRun(runId, entry) {
  asyncRuns.set(runId, { ...asyncRuns.get(runId), ...entry, updatedAt: new Date().toISOString() });
  while (asyncRuns.size > ASYNC_RUN_MEMORY_LIMIT) {
    asyncRuns.delete(asyncRuns.keys().next().value);
  }
}

function countRunningAsyncRuns() {
  let running = 0;
  for (const entry of asyncRuns.values()) if (entry.status === "laeuft") running += 1;
  return running;
}

function defaultRunStore(env) {
  return {
    async put(runId, payload) {
      const config = idriveConfigFromEnv(env);
      await signedS3Request(config, "PUT", asyncRunKey(runId), JSON.stringify(payload, null, 2), "application/json");
    },
    async get(runId) {
      const config = idriveConfigFromEnv(env);
      try {
        return JSON.parse(await signedS3Request(config, "GET", asyncRunKey(runId)));
      } catch {
        return null;
      }
    }
  };
}

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
const LOOP_DEFAULT_STEPS = 8;

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

// Der EINE modellneutrale Planer-Zugang: AI Router entscheidet das Modell
// (Default-Kette beginnt bei GLM-5.2); die Engine sieht nur Plan-JSON.
export function buildPlannerClient({ env = process.env, fetchImpl = fetch, requestedModel = "" } = {}) {
  return async (prompt) => {
    const { chain } = resolveModelRequest("coding", requestedModel, env);
    if (!chain.length) throw new Error("kein_planer_backend_konfiguriert");
    // Modellneutral: KEINE feste temperature. Provider wie Moonshot/Kimi-Coding
    // erzwingen modellabhaengige Werte und lehnen andere mit HTTP 400 ab
    // (Live-Befund 2026-07-14); der Provider-Default gilt fuer jedes Modell.
    const result = await executeWithFallback(chain, [{ role: "user", content: prompt }], {
      fetchImpl,
      stream: false
    });
    if (!result.ok) throw new Error("planer_nicht_erreichbar");
    const payload = await result.response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("planer_leere_antwort");
    return content;
  };
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

// Worker-Aufruf: Ausfuehrung ausschliesslich im stateless Salad-Worker.
// 422 (Plan abgelehnt) wird als Abbruch an den Roundtrip zurueckgemeldet.
function buildRunPlan({ config, fetchImpl, saveAsMacro, readiness }) {
  return async (plan) => {
    const gate = await waitForWorkerReady({ config, fetchImpl, ...(readiness || {}) });
    if (!gate.ready) {
      return { ok: false, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen` };
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
        return { ok: false, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}` };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `plan_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}` };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, aborted: true, abortReason: reason };
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
      return { ok: false, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
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
        return { ok: false, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `loop_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, aborted: true, abortReason: reason, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
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
    const memory = asyncRuns.get(runId);
    if (memory && memory.status === "laeuft") {
      return json(res, 200, { ok: true, runId, status: "laeuft", capsuleRef: memory.capsuleRef ?? null, startedAt: memory.startedAt ?? null });
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
    budget: { ok: budget.ok, reason: budget.reason ?? null },
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
  const budgetVerdict = budgetEvaluator({ env, activeWorkers: countRunningAsyncRuns() });
  if (!budgetVerdict.ok) {
    return json(res, 503, { ok: false, error: "budget_gate_blockiert", reason: budgetVerdict.reason ?? null });
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
  const fromWorker = isWorkerRequest(req, config);
  if (!req?.authUser && !fromWorker) return json(res, 401, { ok: false, error: "authentication_required" });
  if (limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Maus-Engine-Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }
  if (!config.configured) {
    return json(res, 503, { ok: false, error: "maus_engine_nicht_konfiguriert", missing: config.missing });
  }
  const budgetVerdict = budgetEvaluator({ env, activeWorkers: Math.max(activeWorkers, countRunningAsyncRuns()) });
  if (!budgetVerdict.ok) {
    return json(res, 503, { ok: false, error: "budget_gate_blockiert", reason: budgetVerdict.reason ?? null });
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
  const execute = () => planAndExecute({
    task: interactive ? { text: task, mode: "interaktiv" } : task,
    policyInput,
    plannerClient: plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel }),
    runPlan: buildRunPlan({ config, fetchImpl, saveAsMacro }),
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
    return json(res, 202, { ok: true, async: true, runId, capsuleRef, status: "laeuft", startedAt, statusPath: `/api/maus/run?runId=${runId}` });
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
        ? { failedStep: outcome.lastFailure.failedStep ?? null, aborted: outcome.lastFailure.aborted === true, abortReason: outcome.lastFailure.abortReason ?? null, errors: outcome.lastFailure.errors }
        : null
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: String(error?.message || error).slice(0, 300) });
  }
}

// Hintergrund-Ausfuehrung eines Async-Laufs: Ergebnis-Payload bauen, als
// e2-Objekt persistieren (dauerhafte Wahrheit) und den In-Memory-Spiegel
// aktualisieren. Harte Zeitobergrenze, damit kein Lauf ewig "laeuft".
async function runAsyncInBackground({ runId, capsuleRef, execute, store }) {
  let payload;
  try {
    const outcome = await Promise.race([execute(), asyncTimeoutMarker()]);
    if (outcome && outcome.ok) {
      const { artifacts, ...resultSummary } = outcome.result || {};
      payload = {
        ok: true,
        status: "fertig",
        runId,
        capsuleRef,
        planId: outcome.plan?.planId ?? null,
        plannerCalls: outcome.plannerCalls ?? null,
        history: outcome.history || [],
        result: resultSummary,
        finishedAt: new Date().toISOString()
      };
    } else {
      payload = {
        ok: false,
        status: "fehlgeschlagen",
        runId,
        capsuleRef,
        error: outcome?.error || "maus_engine_lauf_fehlgeschlagen",
        plannerCalls: outcome?.plannerCalls ?? null,
        history: outcome?.history || [],
        lastFailure: outcome?.lastFailure
          ? { failedStep: outcome.lastFailure.failedStep ?? null, aborted: outcome.lastFailure.aborted === true, abortReason: outcome.lastFailure.abortReason ?? null, errors: outcome.lastFailure.errors }
          : null,
        finishedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    payload = {
      ok: false,
      status: "fehlgeschlagen",
      runId,
      capsuleRef,
      error: String(error?.message || error).slice(0, 300),
      finishedAt: new Date().toISOString()
    };
  }
  try {
    await store.put(runId, payload);
  } catch (error) {
    payload.persistError = String(error?.message || error).slice(0, 200);
  }
  rememberAsyncRun(runId, { status: payload.status, capsuleRef, payload });
}

function asyncTimeoutMarker() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "async_zeitueberschreitung" }), ASYNC_RUN_TIMEOUT_MS);
    timer.unref?.();
  });
}
