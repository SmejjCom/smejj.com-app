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
import { createSessionRegistry } from "./session-registry.mjs";
import { createLeaseStore } from "./session-lease.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.SMEJJ_HOST || "0.0.0.0";
const TOKEN = String(process.env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
const MAX_BODY_BYTES = 512_000;
const EXIT_AFTER_RUN = process.env.SMEJJ_MAUS_EXIT_AFTER_RUN !== "NO";
let running = false;

// Lebende Sitzungen dieses Prozesses. Lazy, damit ein Lauf ohne sessionId
// weiterhin ohne jede Sitzungslogik durchlaeuft (Non-Regression) und Tests
// ohne e2-Zugangsdaten nicht am Lease-Store scheitern.
let registry = null;

export function getSessionRegistry({ browserFactory = defaultBrowserFactory, leaseStore } = {}) {
  if (registry) return registry;
  let store = leaseStore;
  let storageStore = null;
  if (store === undefined) {
    try {
      const config = idriveConfigFromEnv();
      store = createLeaseStore({ config });
      // Cookie-Krug der Sitzungen: derselbe e2-Store wie die Plan-Aktionen
      // saveSession/restoreSession, nur unter einem eigenen Capsule-Namen.
      storageStore = createSessionStore("sitzungen", { config });
    } catch {
      // Ohne e2-Konfiguration gibt es weder Lease noch Cookie-Krug. Die Sitzung
      // lebt dann nur im Prozess — das ist ehrlicher als eine Zustandslosigkeit
      // vorzutaeuschen, die es nicht gibt.
      store = null;
    }
  }
  registry = createSessionRegistry({ browserFactory, leaseStore: store, storageStore });
  return registry;
}

// Nur fuer Tests: Registry zuruecksetzen, damit jeder Test frisch startet.
export function resetSessionRegistry(next = null) {
  registry = next;
}

async function loadPlaywright() {
  return import("playwright");
}

export async function defaultBrowserFactory({ viewport, storageState } = {}) {
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({
    viewport: viewport || { width: 1365, height: 900 },
    acceptDownloads: true,
    // Teil 4: gespeicherter Cookie-Krug einer Sitzung. Kommt ausschliesslich
    // aus dem Sitzungs-Store auf IDrive e2 (session-store.mjs) — nie aus einem
    // Plan, nie aus einem Prompt.
    ...(storageState ? { storageState } : {})
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
      // Sitzungs-Modus (additiv 2026-07-31): lebender Browser-Zustand aus der
      // Registry. Ohne beides ist der Ablauf unveraendert.
      sessionState: deps.sessionState || null,
      keepAlive: deps.keepAlive === true,
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

/**
 * Lauf INNERHALB einer lebenden Sitzung. Der Browser bleibt danach offen, die
 * Seite bleibt stehen — der naechste Auftrag mit derselben sessionId findet
 * sie vor. Fail-closed: ohne gueltigen Lease oder bei fremdem Halter wird
 * nicht gestartet, statt still einen zweiten Browser zu oeffnen.
 * @param {object} plan validierter Aktionsplan
 * @param {{sessionId:string}} auftrag
 * @returns {Promise<object>} Lauf-Ergebnis plus sitzung-Beschreibung
 */
export async function executeRunInSession(plan, { sessionId, ...deps } = {}) {
  const reg = deps.registry || getSessionRegistry();
  const uebernahme = await reg.acquire({
    sessionId,
    capsuleRef: plan?.capsuleRef ?? null,
    viewport: deps.viewport ?? null
  });
  if (!uebernahme.ok) {
    return { ok: false, rejected: true, sessionId, status: uebernahme.status, errors: [uebernahme.error] };
  }
  const { session, neu } = uebernahme;
  try {
    const result = await executeRun(plan, {
      ...deps,
      registry: undefined,
      browserFactory: deps.browserFactory || reg.browserFactoryFuer(sessionId),
      sessionState: session.state,
      keepAlive: true
    });
    return { ...result, sessionId, sitzungNeu: neu, sitzung: reg.status(sessionId) };
  } finally {
    await reg.release({ sessionId });
  }
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

/**
 * POST /session — Sitzungen ansehen und beenden. Bewusst klein: Sitzungen
 * entstehen ausschliesslich durch einen Auftrag mit sessionId, nie durch einen
 * eigenen "oeffne Browser"-Aufruf. Ein Browser ohne Auftrag waere Leerlauf,
 * der Geld kostet und nichts beweist.
 * @param {{op?:string, sessionId?:string}} auftrag
 */
export async function handleSessionOp(auftrag = {}) {
  const reg = getSessionRegistry();
  const op = String(auftrag.op || "list");
  const sessionId = typeof auftrag.sessionId === "string" ? auftrag.sessionId.trim() : "";
  await reg.aufraeumen();
  if (op === "list") return { ok: true, holder: reg.holder, sitzungen: reg.list() };
  if (!sessionId) return { ok: false, error: "sessionId_fehlt" };
  if (op === "status") {
    const status = reg.status(sessionId);
    return status ? { ok: true, sitzung: status } : { ok: false, error: "sitzung_unbekannt" };
  }
  if (op === "close") return { ok: true, ...(await reg.close(sessionId)) };
  return { ok: false, error: `op_unbekannt: ${op.slice(0, 40)}` };
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      respondJson(res, 200, {
        ok: true,
        engine: "smejj.com maus-engine",
        running,
        sitzungen: registry ? registry.count() : 0
      });
      return;
    }
    const sessionEndpunkt = req.method === "POST" && req.url === "/session";
    if (!sessionEndpunkt && (req.method !== "POST" || req.url !== "/run")) {
      respondJson(res, 404, { ok: false, error: "unbekannter_endpunkt" });
      return;
    }
    if (!isAuthorized(req)) {
      respondJson(res, 401, { ok: false, error: "nicht_autorisiert" });
      return;
    }
    // Sitzungs-Verwaltung (status/list/close) laeuft NICHT durch das
    // single-run-Schloss: sie startet keinen Browser und muss auch waehrend
    // eines laufenden Auftrags Auskunft geben koennen.
    if (sessionEndpunkt) {
      try {
        const parsed = JSON.parse(await readBody(req));
        respondJson(res, 200, await handleSessionOp(parsed));
      } catch (error) {
        respondJson(res, 400, { ok: false, error: String(error.message || error).slice(0, 200) });
      }
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
      let sessionId;
      try {
        const parsed = JSON.parse(body);
        plan = parsed.plan;
        loopTask = parsed.loopTask && typeof parsed.loopTask === "object" ? parsed.loopTask : undefined;
        saveAsMacro = typeof parsed.saveAsMacro === "string" ? parsed.saveAsMacro : undefined;
        sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId.trim() : undefined;
      } catch {
        respondJson(res, 400, { ok: false, error: "kein_gueltiges_json" });
        return;
      }
      let result;
      if (loopTask) result = await executeLoopRun(loopTask);
      else if (sessionId) result = await executeRunInSession(plan, { sessionId, saveAsMacro });
      else result = await executeRun(plan, { saveAsMacro });
      // Keine Artefakt-Rohdaten in der HTTP-Antwort — Beweise liegen auf e2.
      const { artifacts, ...summary } = result;
      const status = result.rejected ? (result.status || 422) : 200;
      respondJson(res, status, summary);
    } catch (error) {
      respondJson(res, 500, { ok: false, error: String(error.message || error).slice(0, 300) });
    } finally {
      running = false;
      // Solange eine Sitzung lebt, waere ein Sofort-Ende genau der Kaltstart,
      // den der Sitzungs-Modus abschafft. Die Registry baut die Sitzung nach
      // Leerlauf bzw. Hartlimit selbst ab — danach greift exit-after-run wieder.
      if (EXIT_AFTER_RUN && !(registry && registry.hasLiveSessions())) {
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
