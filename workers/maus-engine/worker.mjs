// smejj.com Maus-Engine — stateless Worker-Huelle (Salad, hinter Budget-Gate).
// Single Responsibility: HTTP-Vertrag (health/run), Token-Auth, Auswahl
// Stufe 1 vs. Stufe 2, Artefakt-Upload, sofortiges Beenden nach der
// Aufgabe. Playwright wird lazy geladen (Stufe 1 braucht keinen Browser).
import http from "node:http";
import { validatePlan } from "./plan-validator.mjs";
import { createInterpreter } from "./interpreter.mjs";
import { isHttpOnlyPlan, runHttpOnlyPlan } from "./http-stage.mjs";
import { uploadRunArtifacts, idriveConfigFromEnv } from "./artifact-uploader.mjs";
import { createLivePublisher } from "./live-publisher.mjs";
import { createSessionStore } from "./session-store.mjs";
import { createMacroStore } from "./macro-store.mjs";
import { runLoopTask, buildEnvPlannerClient } from "./loop-runner.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.SMEJJ_HOST || "0.0.0.0";
const TOKEN = String(process.env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
const MAX_BODY_BYTES = 512_000;
const EXIT_AFTER_RUN = process.env.SMEJJ_MAUS_EXIT_AFTER_RUN !== "NO";
let running = false;

async function loadPlaywright() {
  return import("playwright");
}

export async function defaultBrowserFactory({ viewport } = {}) {
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({
    viewport: viewport || { width: 1365, height: 900 },
    acceptDownloads: true
  });
  return { browser, context };
}

export function isAuthorized(req, token = TOKEN) {
  if (!token) return false;
  return String(req.headers.authorization || "") === `Bearer ${token}`;
}

// Kernablauf: validieren -> Stufe 1 wenn moeglich, sonst Stufe 2 -> Beweise
// nach IDrive e2. Injektionspunkte nur fuer Tests.
export async function executeRun(plan, deps = {}) {
  const validation = validatePlan(plan);
  if (!validation.ok) {
    return { ok: false, rejected: true, errors: validation.errors.slice(0, 20) };
  }
  const config = deps.idriveConfig || (deps.skipUpload ? null : idriveConfigFromEnv());
  const macroStore = deps.macroStore || (config ? createMacroStore({ config }) : null);
  // saveAsMacro ist ein Auftrag: ohne Store fail-closed VOR der Ausfuehrung.
  if (deps.saveAsMacro && !macroStore) {
    return { ok: false, rejected: true, errors: ["saveAsMacro ohne konfigurierten Makro-Store (fail-closed)"] };
  }
  // Stufe B (freigegeben 2026-07-15): Live-Fortschritt pro Schritt in die
  // Capsule schreiben, damit die Replay-Ansicht quasi-live mitlaufen kann.
  // Rein additiv und fail-safe: ohne Config (z. B. Tests) ist der Publisher
  // stumm, Fehler beim Veroeffentlichen beeinflussen den Lauf nie.
  const livePublisher = deps.livePublisher !== undefined
    ? deps.livePublisher
    : (config
        ? createLivePublisher({
            capsuleRef: plan.capsuleRef,
            planId: plan.planId,
            total: plan.steps.length,
            config,
            putObject: deps.putObject
          })
        : null);

  let result;
  if (isHttpOnlyPlan(plan)) {
    result = await runHttpOnlyPlan(plan, { fetchImpl: deps.fetchImpl });
  } else {
    const interpreter = createInterpreter(plan, {
      browserFactory: deps.browserFactory || defaultBrowserFactory,
      fetchImpl: deps.fetchImpl,
      sessionStore: deps.sessionStore || (config ? createSessionStore(plan.capsuleRef, { config }) : undefined),
      macroStore,
      vaultOptions: deps.vaultOptions,
      onStep: livePublisher ? (event) => livePublisher.onStep(event) : null
    });
    result = await interpreter.run();
  }
  if (livePublisher) {
    // Endzustand einmal schreiben; auch das darf den Lauf nie stoeren.
    try {
      await livePublisher.finish({
        ok: result.ok,
        abortReason: result.abortReason ?? null,
        lastIndex: Array.isArray(result.actionLog) ? result.actionLog.length - 1 : null
      });
    } catch {
      // absichtlich still (fail-safe)
    }
  }
  // Makro-Recorder: NUR erfolgreiche, vollstaendig verifizierte Laeufe
  // werden als Makro gespeichert (kein Lernen aus Fehlern).
  if (deps.saveAsMacro && result.ok) {
    const saved = await macroStore.save(deps.saveAsMacro, plan);
    result = { ...result, macroSaved: saved };
  }
  if (deps.skipUpload === true) return { ...result, uploaded: false };
  const manifest = await uploadRunArtifacts(result, { config: deps.idriveConfig, putObject: deps.putObject });
  return { ...result, uploaded: true, manifest };
}

// Interaktiver Loop-Modus (additiv, 2026-07-15): POST /run mit
// { loopTask: { task, policyInput } } statt { plan }. Fail-closed:
// unvollstaendige Eingaben oder fehlende Planer-Konfiguration werden
// abgelehnt, bevor ein Browser startet. Der bestehende {plan}-Pfad ist
// unveraendert (Non-Regression).
export async function executeLoopRun(loopTask, deps = {}) {
  const task = loopTask?.task;
  const policyInput = loopTask?.policyInput;
  const taskText = typeof task === "object" && task !== null ? task.text : task;
  if (!taskText || !policyInput?.capsuleRef || !Array.isArray(policyInput?.domainAllowlist) || policyInput.domainAllowlist.length === 0 || !policyInput?.budget) {
    return { ok: false, rejected: true, errors: ["loopTask unvollstaendig (task, capsuleRef, domainAllowlist, budget sind Pflicht)"] };
  }
  let plannerClient;
  try {
    plannerClient = deps.plannerClient || buildEnvPlannerClient();
  } catch (error) {
    return { ok: false, rejected: true, errors: [String(error.message || error)] };
  }
  const result = await runLoopTask({
    task,
    policyInput,
    plannerClient,
    browserFactory: deps.browserFactory || defaultBrowserFactory,
    observer: deps.observer,
    vaultOptions: deps.vaultOptions,
    retryDelayFn: deps.retryDelayFn
  });
  if (deps.skipUpload === true) return { ...result, uploaded: false };
  const config = deps.idriveConfig || idriveConfigFromEnv();
  const manifest = await uploadRunArtifacts(result, { config, putObject: deps.putObject });
  return { ...result, uploaded: true, manifest };
}

function respondJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body_zu_gross"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      respondJson(res, 200, { ok: true, engine: "smejj.com maus-engine", running });
      return;
    }
    if (req.method !== "POST" || req.url !== "/run") {
      respondJson(res, 404, { ok: false, error: "unbekannter_endpunkt" });
      return;
    }
    if (!isAuthorized(req)) {
      respondJson(res, 401, { ok: false, error: "nicht_autorisiert" });
      return;
    }
    if (running) {
      respondJson(res, 429, { ok: false, error: "bereits_aktiv (Worker ist single-run)" });
      return;
    }
    running = true;
    try {
      const body = await readBody(req);
      let plan;
      let saveAsMacro;
      let loopTask;
      try {
        const parsed = JSON.parse(body);
        plan = parsed.plan;
        loopTask = parsed.loopTask && typeof parsed.loopTask === "object" ? parsed.loopTask : undefined;
        saveAsMacro = typeof parsed.saveAsMacro === "string" ? parsed.saveAsMacro : undefined;
      } catch {
        respondJson(res, 400, { ok: false, error: "kein_gueltiges_json" });
        return;
      }
      const result = loopTask
        ? await executeLoopRun(loopTask)
        : await executeRun(plan, { saveAsMacro });
      // Keine Artefakt-Rohdaten in der HTTP-Antwort — Beweise liegen auf e2.
      const { artifacts, ...summary } = result;
      respondJson(res, result.rejected ? 422 : 200, summary);
    } catch (error) {
      respondJson(res, 500, { ok: false, error: String(error.message || error).slice(0, 300) });
    } finally {
      running = false;
      if (EXIT_AFTER_RUN) {
        // Stateless: Worker beendet sich nach der Aufgabe sofort
        // (Scale-to-zero, keine laufenden Fixkosten).
        setTimeout(() => process.exit(0), 250).unref();
      }
    }
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  createServer().listen(PORT, HOST, () => {
    console.log(`smejj.com maus-engine bereit auf ${HOST}:${PORT}`);
  });
}
