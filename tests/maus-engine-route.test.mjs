// smejj.com — Tests fuer die Control-Server-Bridge /api/maus/run.
// Beweist: Auth-Pflicht, fail-closed Konfiguration, Budget-Gate,
// Eingabevalidierung, modellneutraler Planer-Aufruf und Worker-Dispatch.
// Ohne Netz, ohne Playwright, ohne echtes Modell.
import test from "node:test";
import assert from "node:assert/strict";
import {
  handleMausRun,
  handleMausStatus,
  readMausEngineConfig,
  buildPlannerClient,
  ZEITGRENZEN
} from "../control-server/src/routes/mausEngineRoutes.js";
import { PROMPT_TEMPLATE_VERSION } from "../workers/maus-engine/prompt-template.mjs";

const ENV_OK = Object.freeze({
  SMEJJ_MAUS_ENGINE_ENABLED: "YES",
  SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus-worker.test",
  SMEJJ_MAUS_ENGINE_TOKEN: "test-token"
});

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { res.headers[name] = value; },
    writeHead(status) { res.statusCode = status; },
    end(text) { res.body = JSON.parse(text); }
  };
  return res;
}

function mockReq({ body, authUser = { email: "smejjcom@gmail.com" } } = {}) {
  return {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    authUser,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    }
  };
}

function requestBody(overrides = {}) {
  return {
    task: "Oeffne die Startseite und extrahiere die Ueberschrift.",
    capsuleRef: "maus-e2e-test-2026-07-14",
    domainAllowlist: ["example.com"],
    ...overrides
  };
}

function validPlanFor(body) {
  return {
    schemaVersion: 1,
    planId: "route-plan-1",
    createdAt: "2026-07-14T00:00:00Z",
    capsuleRef: body.capsuleRef,
    planner: { modelId: "glm-5-2", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: {
      domainAllowlist: body.domainAllowlist,
      budget: {
        maxActions: 60, maxLocalRetries: 2, maxPlannerRoundtrips: 2,
        maxDurationMs: 300000, defaultActionTimeoutMs: 30000
      }
    },
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/" }]
  };
}

test("Konfiguration: fail-closed ohne Env, vollstaendig mit Env", () => {
  assert.equal(readMausEngineConfig({}).configured, false);
  assert.equal(readMausEngineConfig({}).missing.length, 3);
  assert.equal(readMausEngineConfig(ENV_OK).configured, true);
});

test("401 ohne authentifizierte Sitzung (POST und GET)", async () => {
  const res1 = mockRes();
  await handleMausRun(mockReq({ authUser: null, body: requestBody() }), res1, { env: ENV_OK, limiter: null });
  assert.equal(res1.statusCode, 401);
  const res2 = mockRes();
  handleMausStatus({ authUser: null }, res2, { env: ENV_OK });
  assert.equal(res2.statusCode, 401);
});

test("503 wenn Engine nicht konfiguriert (fail-closed)", async () => {
  const res = mockRes();
  await handleMausRun(mockReq({ body: requestBody() }), res, { env: {}, limiter: null });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "maus_engine_nicht_konfiguriert");
  assert.equal(res.body.missing.length, 3);
});

// Die Begruendung MUSS durchkommen. Bis 2026-08-17 las die Route
// `budgetVerdict.reason` (Einzahl) — ein Feld, das evaluateWorkerBudget nie
// liefert; die Antwort lautete immer `"reason": null`. Der alte Test benutzte
// eine Attrappe mit ebenjenem erfundenen Feld und war deshalb blind. Hier steht
// jetzt die ECHTE Form des Gates (reasons als Liste).
test("503 wenn Budget-Gate blockiert — mit Begruendung", async () => {
  const res = mockRes();
  await handleMausRun(mockReq({ body: requestBody() }), res, {
    env: ENV_OK, limiter: null,
    budgetEvaluator: () => ({ ok: false, reasons: ["positive_worker_budget_required:SMEJJ_WORKER_BUDGET_USD"] })
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "budget_gate_blockiert");
  assert.deepEqual(res.body.reasons, ["positive_worker_budget_required:SMEJJ_WORKER_BUDGET_USD"]);
});

test("400 bei fehlender Allowlist, fehlender Capsule oder fehlender Aufgabe", async () => {
  for (const bad of [
    requestBody({ domainAllowlist: [] }),
    requestBody({ capsuleRef: "" }),
    requestBody({ task: "" })
  ]) {
    const res = mockRes();
    await handleMausRun(mockReq({ body: bad }), res, {
      env: ENV_OK, limiter: null, budgetEvaluator: () => ({ ok: true })
    });
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
  }
});

test("Happy Path: Planer-Plan -> Worker-Dispatch mit Bearer-Token -> 200", async () => {
  const body = requestBody({ saveAsMacro: "startseite" });
  const workerCalls = [];
  const res = mockRes();
  await handleMausRun(mockReq({ body }), res, {
    env: ENV_OK,
    limiter: null,
    budgetEvaluator: () => ({ ok: true }),
    plannerClient: async (prompt) => {
      assert.match(prompt, /AUFGABE:/);
      assert.match(prompt, /example\.com/);
      return JSON.stringify(validPlanFor(body));
    },
    fetchImpl: async (url, init) => {
      // Health-Gate (Fix 2026-07-15): /health-Aufrufe beantworten, /run protokollieren.
      if (String(url).endsWith("/health")) return { ok: true, json: async () => ({ ok: true }) };
      workerCalls.push({ url, init });
      return { status: 200, json: async () => ({ ok: true, planId: "route-plan-1", uploaded: true }) };
    }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plannerCalls, 1);
  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].url, "https://maus-worker.test/run");
  assert.equal(workerCalls[0].init.headers.authorization, "Bearer test-token");
  const sent = JSON.parse(workerCalls[0].init.body);
  assert.equal(sent.saveAsMacro, "startseite");
  assert.equal(sent.plan.planId, "route-plan-1");
});

test("Vision bleibt hart aus, Budget-Overrides werden geklemmt", async () => {
  const body = requestBody({
    visionAllowed: true,
    budget: { maxActions: 99999, maxPlannerRoundtrips: 99, maxDurationMs: 1 }
  });
  let seenPrompt = "";
  const res = mockRes();
  await handleMausRun(mockReq({ body }), res, {
    env: ENV_OK,
    limiter: null,
    budgetEvaluator: () => ({ ok: true }),
    plannerClient: async (prompt) => { seenPrompt = prompt; return JSON.stringify(validPlanFor(body)); },
    fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true }) })
  });
  assert.equal(res.statusCode, 200);
  assert.match(seenPrompt, /visionAllowed: false/);
  assert.match(seenPrompt, /"maxActions":500/);
  assert.match(seenPrompt, /"maxPlannerRoundtrips":3/);
  assert.match(seenPrompt, /"maxDurationMs":1000/);
});

test("Worker lehnt Plan ab (422) -> Roundtrips -> 502 budget erschoepft", async () => {
  const body = requestBody();
  let plannerCalls = 0;
  const res = mockRes();
  await handleMausRun(mockReq({ body }), res, {
    env: ENV_OK,
    limiter: null,
    budgetEvaluator: () => ({ ok: true }),
    plannerClient: async () => { plannerCalls += 1; return JSON.stringify(validPlanFor(body)); },
    fetchImpl: async (url) => String(url).endsWith("/health")
      ? { ok: true, json: async () => ({ ok: true }) }
      : { status: 422, json: async () => ({ ok: false, rejected: true, errors: ["kaputt"] }) }
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "planner_budget_erschoepft");
  // Default maxPlannerRoundtrips=2 -> 3 Planer-Aufrufe, dann fail-closed.
  assert.equal(plannerCalls, 3);
  assert.match(String(res.body.lastFailure.abortReason), /plan_abgelehnt/);
});

test("Rate-Limit: 429 mit Retry-After", async () => {
  const res = mockRes();
  await handleMausRun(mockReq({ body: requestBody() }), res, {
    env: ENV_OK,
    limiter: { take: () => ({ allowed: false, retryAfterSec: 7 }) },
    budgetEvaluator: () => ({ ok: true })
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "7");
});

test("buildPlannerClient: leere Backend-Kette -> fail-closed", async () => {
  const client = buildPlannerClient({ env: {}, fetchImpl: async () => { throw new Error("nie"); } });
  await assert.rejects(client("egal"), /kein_planer_backend_konfiguriert/);
});

test("Async-Modus: 202 mit runId, Ergebnis persistiert, Status-Polling liefert es", async () => {
  const body = requestBody({ async: true });
  const stored = new Map();
  const runStore = {
    async put(runId, payload) { stored.set(runId, payload); },
    async get(runId) { return stored.get(runId) ?? null; }
  };
  const res = mockRes();
  await handleMausRun(mockReq({ body }), res, {
    env: ENV_OK,
    limiter: null,
    budgetEvaluator: () => ({ ok: true }),
    runStore,
    plannerClient: async () => JSON.stringify(validPlanFor(body)),
    fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, planId: "route-plan-1", uploaded: true, manifest: { objects: [] } }) })
  });
  assert.equal(res.statusCode, 202, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.status, "laeuft");
  assert.match(res.body.runId, /^maus-[a-z0-9-]+$/);
  assert.match(res.body.statusPath, /runId=/);

  // Hintergrundlauf abschliessen lassen, dann Status pollen.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(stored.size, 1, "Ergebnis muss als Objekt persistiert sein");
  const statusRes = mockRes();
  await handleMausStatus({ authUser: { email: "smejjcom@gmail.com" }, url: `/api/maus/run?runId=${res.body.runId}` }, statusRes, { env: ENV_OK, runStore });
  assert.equal(statusRes.statusCode, 200, JSON.stringify(statusRes.body));
  assert.equal(statusRes.body.status, "fertig");
  assert.equal(statusRes.body.result.ok, true);
  assert.equal(statusRes.body.result.planId, "route-plan-1");
});

test("Async-Modus: fehlgeschlagener Lauf wird als fehlgeschlagen persistiert", async () => {
  const body = requestBody({ async: true, budget: { maxPlannerRoundtrips: 0 } });
  const stored = new Map();
  const runStore = {
    async put(runId, payload) { stored.set(runId, payload); },
    async get(runId) { return stored.get(runId) ?? null; }
  };
  const res = mockRes();
  await handleMausRun(mockReq({ body }), res, {
    env: ENV_OK,
    limiter: null,
    budgetEvaluator: () => ({ ok: true }),
    runStore,
    plannerClient: async () => "kein json",
    fetchImpl: async () => { throw new Error("darf nicht aufgerufen werden"); }
  });
  assert.equal(res.statusCode, 202);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const payload = [...stored.values()][0];
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "fehlgeschlagen");
  assert.equal(payload.error, "planner_budget_erschoepft");
});

test("Status-Polling: unbekannte runId -> 404 unbekannt", async () => {
  const statusRes = mockRes();
  await handleMausStatus(
    { authUser: { email: "smejjcom@gmail.com" }, url: "/api/maus/run?runId=maus-gibt-es-nicht-123" },
    statusRes,
    { env: ENV_OK, runStore: { async get() { return null; }, async put() {} } }
  );
  assert.equal(statusRes.statusCode, 404);
  assert.equal(statusRes.body.status, "unbekannt");
});

// ── Planer-Proxy fuer den Loop-Modus (additiv 2026-07-15) ──────────────────
// Der stateless Worker hat keine Nutzer-Sitzung. Er darf sich mit dem
// Engine-Token NUR eine Modell-Entscheidung holen — niemals einen Lauf
// starten. Damit bleibt der Control Server die einzige Stelle mit
// Modell-Zugaengen (Router-/BYOK-Policy) und es liegt kein zweiter API-Key
// im Worker.
function workerReq(body) {
  return {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${ENV_OK.SMEJJ_MAUS_ENGINE_TOKEN}` },
    authUser: null,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    }
  };
}

test("Planer-Proxy: Worker-Token + plannerPrompt liefert Modellantwort", async () => {
  const res = mockRes();
  let gesehenerPrompt = "";
  await handleMausRun(workerReq({ plannerPrompt: "entscheide den naechsten Schritt" }), res, {
    env: ENV_OK,
    limiter: null,
    plannerClient: async (prompt) => { gesehenerPrompt = prompt; return "{\"decision\":\"done\"}"; },
    budgetEvaluator: () => ({ ok: true })
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.choices[0].message.content, "{\"decision\":\"done\"}");
  assert.equal(gesehenerPrompt, "entscheide den naechsten Schritt");
});

// Der freie Modus war im Async-Betrieb unbenutzbar: der laufende Auftrag zaehlte
// als aktiver Arbeiter, die Obergrenze steht auf 1, also verweigerte das Gate
// ausgerechnet die Modellfragen DESSELBEN Auftrags. Er blockierte sich selbst.
test("Planer-Proxy: ein laufender Auftrag blockiert nicht seine eigenen Fragen", async () => {
  const res = mockRes();
  let gesehen = null;
  await handleMausRun(workerReq({ plannerPrompt: "Was nun?" }), res, {
    env: ENV_OK,
    limiter: null,
    // Der Aufrufer behauptet, es liefen bereits Arbeiter — fuer die Frage
    // EINES LAUFENDEN Auftrags darf das nicht gegen ihn verwendet werden.
    activeWorkers: 5,
    budgetEvaluator: (eingabe) => { gesehen = eingabe.activeWorkers; return { ok: true }; },
    plannerClient: async () => "{\"decision\":\"done\"}"
  });
  assert.equal(gesehen, 0, "der Proxy darf keine Nebenlaeufigkeit anrechnen");
  assert.equal(res.statusCode, 200);
});

// Die drei Fristen muessen gestaffelt bleiben. Bis 2026-08-17 waren sie es
// nicht: LOOP_DEFAULT_STEPS stieg von 8 auf 16, die Fristen blieben stehen.
// Ein Lauf, der seine Schritte wirklich nutzt, riss dann die Verbindung, statt
// sich selbst zu beenden — Ergebnis war `worker_fehler: fetch failed` und man
// wusste nicht einmal, wie weit er kam. Ein Kommentar haelt keine Zahl fest,
// ein Test schon.
test("Zeitgrenzen: Lauf-Frist < Verbindungs-Frist < Hintergrund-Frist", () => {
  const z = ZEITGRENZEN;
  assert.ok(z.planLaufFrist < z.workerAntwort, "der Plan-Lauf muss sich vor der Verbindung beenden");
  assert.ok(z.loopLaufFrist < z.workerAntwort, "der freie Lauf muss sich vor der Verbindung beenden");
  assert.ok(z.workerAntwort < z.hintergrundLauf, "der Hintergrund-Auftrag muss die Verbindung ueberleben");
  // Und die Frist muss zur Schrittzahl passen: ein Schritt ist eine
  // Modellfrage plus eine Browseraktion, realistisch 20 s. Weniger Zeit als
  // Schritte x 20 s heisst, dass die erhoehte Schrittzahl nie ankommt.
  assert.ok(
    z.loopLaufFrist >= z.loopSchritte * 20_000,
    `${z.loopSchritte} Schritte brauchen mindestens ${z.loopSchritte * 20} s, erlaubt sind ${z.loopLaufFrist / 1000} s`
  );
});

// Dieselbe Verwechslung an der zweiten Bremse: 6 Anfragen, dann eine alle
// 20 Sekunden — ein freier Lauf mit 16 Schritten war nach der sechsten tot.
test("Ratenbremse: die Schrittfragen eines Laufs werden nicht gebremst", async () => {
  const nie = { take: () => ({ allowed: false, retryAfterSec: 20 }) };
  const res = mockRes();
  await handleMausRun(workerReq({ plannerPrompt: "Schritt 7 von 16" }), res, {
    env: ENV_OK,
    limiter: nie,
    budgetEvaluator: () => ({ ok: true }),
    plannerClient: async () => "{\"decision\":\"done\"}"
  });
  assert.equal(res.statusCode, 200, "eine Schrittfrage darf nicht an der Nutzerbremse scheitern");
});

test("Ratenbremse: fuer Nutzer bremst sie unveraendert", async () => {
  const nie = { take: () => ({ allowed: false, retryAfterSec: 20 }) };
  const res = mockRes();
  await handleMausRun(mockReq({ body: requestBody() }), res, { env: ENV_OK, limiter: nie });
  assert.equal(res.statusCode, 429);
});

// Die Gegenprobe: fuer einen NUTZER, der einen neuen Lauf startet, gilt die
// Nebenlaeufigkeits-Grenze unveraendert. Sonst waere die Ausnahme oben ein Loch
// im Kostendeckel statt einer Praezisierung.
test("Budget-Gate: fuer einen echten Lauf zaehlt die Nebenlaeufigkeit weiter", async () => {
  const res = mockRes();
  let gesehen = null;
  await handleMausRun(mockReq({ body: requestBody() }), res, {
    env: ENV_OK,
    limiter: null,
    activeWorkers: 5,
    budgetEvaluator: (eingabe) => { gesehen = eingabe.activeWorkers; return { ok: false, reasons: ["max_concurrent_workers_reached"] }; }
  });
  assert.equal(gesehen, 5);
  assert.equal(res.statusCode, 503);
});

test("Planer-Proxy: Worker-Token darf KEINEN Lauf starten (fail-closed 403)", async () => {
  const res = mockRes();
  await handleMausRun(workerReq(requestBody()), res, {
    env: ENV_OK,
    limiter: null,
    plannerClient: async () => { throw new Error("Planer darf hier nie laufen"); },
    budgetEvaluator: () => ({ ok: true })
  });
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body.error), /nur_plannerPrompt|nur plannerPrompt/);
});

test("Planer-Proxy: falsches Token bleibt 401 (keine Umgehung der Nutzer-Auth)", async () => {
  const res = mockRes();
  const req = workerReq({ plannerPrompt: "x" });
  req.headers.authorization = "Bearer falsches-token";
  await handleMausRun(req, res, { env: ENV_OK, limiter: null, budgetEvaluator: () => ({ ok: true }) });
  assert.equal(res.statusCode, 401);
});

test("Planer-Proxy: ueberlanger Prompt wird fail-closed abgelehnt", async () => {
  const res = mockRes();
  await handleMausRun(workerReq({ plannerPrompt: "x".repeat(24_001) }), res, {
    env: ENV_OK,
    limiter: null,
    plannerClient: async () => { throw new Error("darf nie laufen"); },
    budgetEvaluator: () => ({ ok: true })
  });
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body.error), /planner_prompt_ungueltig_oder_zu_lang/);
});
