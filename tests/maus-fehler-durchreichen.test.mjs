// smejj.com Maus-Engine — der echte Fehlergrund muss sichtbar bleiben.
// Vorgeschichte (job_maus_sichtbarkeit_20260728): eine HTTP 401 der Engine
// ("nicht_autorisiert") kam als inhaltlich gescheiterter Lauf durch und wurde
// am Ende als "planner_budget_erschoepft" gemeldet. Das hat die Fehlersuche
// mehrere Runden lang ans falsche Ende geschickt. Diese Tests halten beide
// Haelften des Fixes fest. Ohne Netz, ohne Playwright.
import test from "node:test";
import assert from "node:assert/strict";
import { workerHttpFehler, workerStatusFehler } from "../control-server/src/routes/mausEngineRoutes.js";
import { infrastrukturFehler, planAndExecute } from "../workers/maus-engine/planner-roundtrip.mjs";
import { PROMPT_TEMPLATE_VERSION } from "../workers/maus-engine/prompt-template.mjs";

const policyInput = {
  capsuleRef: "maus-fehler-durchreichen-test",
  domainAllowlist: ["example.com"],
  budget: {
    maxActions: 20, maxLocalRetries: 1, maxPlannerRoundtrips: 1,
    maxDurationMs: 60000, defaultActionTimeoutMs: 1000
  }
};

function validPlan(planId = "planer-1") {
  return {
    schemaVersion: 1,
    planId,
    createdAt: "2026-07-14T00:00:00Z",
    capsuleRef: policyInput.capsuleRef,
    planner: { modelId: "beliebig", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: { domainAllowlist: policyInput.domainAllowlist, budget: policyInput.budget },
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api" }]
  };
}

test("401 der Engine: Grund bleibt maschinenlesbar, Hinweis nennt den Token", () => {
  const fehler = workerHttpFehler(401, { ok: false, error: "nicht_autorisiert" });
  assert.equal(fehler.aborted, true);
  assert.equal(fehler.infra, true, "als Infrastruktur-Fehler markiert");
  assert.equal(fehler.error, "nicht_autorisiert");
  assert.match(fehler.abortReason, /worker_http_401/);
  assert.match(fehler.abortReason, /Token/);
});

test("500 der Engine: echter Grund durch, aber kein falscher Token-Hinweis", () => {
  const fehler = workerHttpFehler(500, { ok: false, error: "upload_fehlgeschlagen" });
  assert.equal(fehler.error, "upload_fehlgeschlagen");
  assert.doesNotMatch(fehler.abortReason, /Token/);
});

test("Antwort ohne verwertbaren Grund: Status bleibt als Rueckfall stehen", () => {
  assert.equal(workerHttpFehler(502, null).error, "worker_http_502");
  assert.equal(workerHttpFehler(503, {}).error, "worker_http_503");
});

test("Infrastruktur-Erkennung: markierter Abbruch nennt seinen Grund", () => {
  assert.equal(infrastrukturFehler({ infra: true, aborted: true, error: "nicht_autorisiert" }), "nicht_autorisiert");
  assert.equal(
    infrastrukturFehler({ infra: true, aborted: true, error: null, abortReason: "worker_nicht_bereit_nach_46_versuchen" }),
    "worker_nicht_bereit_nach_46_versuchen"
  );
});

test("Infrastruktur-Erkennung: ein abgelehnter Plan bleibt ein Planungsfehler", () => {
  // Ohne Markierung ist es KEINE Infrastruktur — sonst haette der Planer
  // fail-closed abgelehnt und wir wuerden den Betreiber zum Portal schicken.
  assert.equal(infrastrukturFehler({ aborted: true, abortReason: "plan_abgelehnt: kaputt" }), null);
  assert.equal(infrastrukturFehler({ aborted: false, error: "x" }), null);
  assert.equal(infrastrukturFehler(null), null);
});

test("Statuspruefung belegt Fehler positiv — sonst gilt die Antwort als Erfolg", () => {
  assert.equal(workerStatusFehler({ status: 401 }), 401);
  assert.equal(workerStatusFehler({ ok: false, status: 500 }), 500);
  // Antworten, die nur eines der beiden Felder tragen, duerfen nicht kippen.
  assert.equal(workerStatusFehler({ status: 200 }), 0);
  assert.equal(workerStatusFehler({ ok: true }), 0);
  assert.equal(workerStatusFehler({}), 0);
});

test("Ende zu Ende: 401 wird gemeldet als 401 — nicht als erschoepftes Budget", async () => {
  const outcome = await planAndExecute({
    task: "Oeffne example.com",
    policyInput,
    plannerClient: async () => JSON.stringify(validPlan()),
    // Genau das, was buildRunPlan bei einer 401 der Engine zurueckgibt.
    runPlan: async () => ({ ok: false, ...workerHttpFehler(401, { ok: false, error: "nicht_autorisiert" }) })
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, "nicht_autorisiert");
  assert.notEqual(outcome.error, "planner_budget_erschoepft");
  assert.equal(outcome.lastFailure.error, "nicht_autorisiert");
});

test("Nicht-Regression: ein echt gescheiterter Lauf meldet weiter das Budget", async () => {
  const outcome = await planAndExecute({
    task: "Oeffne example.com",
    policyInput,
    plannerClient: async () => JSON.stringify(validPlan()),
    runPlan: async () => ({
      ok: false, aborted: false, failedStep: "h1",
      abortReason: null, actionLog: [{ id: "h1", ok: false }]
    })
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, "planner_budget_erschoepft");
});
