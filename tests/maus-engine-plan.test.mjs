// smejj.com Maus-Engine — Tests fuer Plan-/Schema-Validierung, Allowlist,
// Retry und Stufe-1-Optimierer. Laufen ohne Playwright und ohne Netz.
import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../workers/maus-engine/plan-validator.mjs";
import { isHostAllowed, checkUrlAllowed } from "../workers/maus-engine/allowlist.mjs";
import { withRetries, withTimeout } from "../workers/maus-engine/retry.mjs";
import { isHttpOnlyPlan, runHttpOnlyPlan } from "../workers/maus-engine/http-stage.mjs";

function basePlan(overrides = {}) {
  return {
    schemaVersion: 1,
    planId: "test-plan-1",
    createdAt: "2026-07-14T00:00:00Z",
    capsuleRef: "maus-engine-test-2026-07-14",
    planner: { modelId: "glm-5-2", promptTemplateVersion: "v1" },
    policy: {
      domainAllowlist: ["example.com", "*.example.org"],
      budget: {
        maxActions: 20,
        maxLocalRetries: 2,
        maxPlannerRoundtrips: 1,
        maxDurationMs: 60000,
        defaultActionTimeoutMs: 1000
      }
    },
    steps: [
      { id: "s1", action: "openBrowser" },
      { id: "s2", action: "navigate", url: "https://example.com/start" }
    ],
    ...overrides
  };
}

test("gueltiger Plan wird akzeptiert", () => {
  const result = validatePlan(basePlan());
  assert.equal(result.ok, true, result.errors.join(" | "));
});

test("leere Domain-Allowlist wird abgelehnt (fail-closed)", () => {
  const plan = basePlan();
  plan.policy.domainAllowlist = [];
  assert.equal(validatePlan(plan).ok, false);
});

test("unbekannte Aktion wird abgelehnt", () => {
  const plan = basePlan({ steps: [{ id: "x", action: "teleport" }] });
  assert.equal(validatePlan(plan).ok, false);
});

test("fremdes Top-Level-Feld wird abgelehnt", () => {
  const plan = basePlan();
  plan.injected = "boese";
  assert.equal(validatePlan(plan).ok, false);
});

test("fremdes Feld im Schritt wird abgelehnt (unevaluatedProperties)", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "openBrowser", extra: 1 }];
  assert.equal(validatePlan(plan).ok, false);
});

test("type mit text UND secretRef gleichzeitig wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{
    id: "s1", action: "type",
    target: { strategy: "css", value: "#feld" },
    text: "a", secretRef: "login"
  }];
  assert.equal(validatePlan(plan).ok, false);
});

test("Klartext im Plan: type ohne text/secretRef wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "type", target: { strategy: "css", value: "#feld" } }];
  assert.equal(validatePlan(plan).ok, false);
});

test("Koordinaten-Klick ohne visionAllowed wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "click", target: { coordinates: { x: 10, y: 20 } } }];
  const result = validatePlan(plan);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /visionAllowed/);
});

test("download ohne policy.files.downloadAllowed wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "download", url: "https://example.com/f.pdf", saveAs: "f.pdf" }];
  assert.equal(validatePlan(plan).ok, false);
});

test("doppelte Schritt-IDs werden abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [
    { id: "s1", action: "openBrowser" },
    { id: "s1", action: "closeBrowser" }
  ];
  assert.equal(validatePlan(plan).ok, false);
});

test("mehr Schritte als budget.maxActions wird abgelehnt", () => {
  const plan = basePlan();
  plan.policy.budget.maxActions = 1;
  assert.equal(validatePlan(plan).ok, false);
});

test("statische URL ausserhalb der Allowlist wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "navigate", url: "https://boese.tld/pfad" }];
  const result = validatePlan(plan);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Allowlist/);
});

test("step.retries oberhalb budget.maxLocalRetries wird abgelehnt", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "openBrowser", retries: 5 }];
  assert.equal(validatePlan(plan).ok, false);
});

test("runMacro ist schema-gueltig (Sperre greift zur Laufzeit)", () => {
  const plan = basePlan();
  plan.steps = [{ id: "s1", action: "runMacro", macroRef: "makros/login.json" }];
  assert.equal(validatePlan(plan).ok, true);
});

test("Allowlist: exakter Host und Wildcard-Subdomain", () => {
  assert.equal(isHostAllowed("example.com", ["example.com"]), true);
  assert.equal(isHostAllowed("sub.example.com", ["example.com"]), false);
  assert.equal(isHostAllowed("sub.example.org", ["*.example.org"]), true);
  assert.equal(isHostAllowed("example.org", ["*.example.org"]), true);
  assert.equal(isHostAllowed("boese.tld", ["example.com"]), false);
});

test("Allowlist: private Hosts bleiben blockiert (SSRF)", () => {
  for (const host of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.1/", "http://intern.local/"]) {
    const result = checkUrlAllowed(host, ["localhost", "127.0.0.1", "10.0.0.1", "192.168.1.1", "intern.local"]);
    assert.equal(result.ok, false, host);
  }
});

test("Allowlist: nur http(s), ungueltige URL fail-closed", () => {
  assert.equal(checkUrlAllowed("ftp://example.com/x", ["example.com"]).ok, false);
  assert.equal(checkUrlAllowed("nicht-eine-url", ["example.com"]).ok, false);
  assert.equal(checkUrlAllowed("https://example.com/x", ["example.com"]).ok, true);
});

test("withRetries: Erfolg nach Fehlversuch, Versuchszaehler stimmt", async () => {
  let calls = 0;
  const result = await withRetries(async (attempt) => {
    calls += 1;
    if (attempt < 1) throw new Error("noch nicht");
    return "ok";
  }, { retries: 2, delayFn: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.value, "ok");
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("withRetries: endgueltiger Fehler nach N Versuchen (fail-closed)", async () => {
  const result = await withRetries(async () => { throw new Error("immer"); }, { retries: 1, delayFn: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
});

test("withTimeout: haengende Aktion wird abgebrochen", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20, "test"),
    /timeout_test_20ms/
  );
});

test("Stufe 1: reiner httpRequest-Plan wird erkannt, Browser-Plan nicht", () => {
  const httpPlan = basePlan({
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api" }]
  });
  assert.equal(isHttpOnlyPlan(httpPlan), true);
  assert.equal(isHttpOnlyPlan(basePlan()), false);
});

test("Stufe 1: Ausfuehrung ohne Browser, expectStatus fail-closed", async () => {
  const plan = basePlan({
    steps: [
      { id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api", expectStatus: 200, saveAs: "antwort.json" },
      { id: "h2", action: "assert", condition: "downloadExists", fileName: "antwort.json" }
    ]
  });
  const fetchImpl = async () => ({
    ok: true, status: 200,
    arrayBuffer: async () => new TextEncoder().encode("{\"a\":1}").buffer,
    headers: { get: () => "application/json" }
  });
  const result = await runHttpOnlyPlan(plan, { fetchImpl });
  assert.equal(result.ok, true, JSON.stringify(result.actionLog));
  assert.equal(result.stage, 1);
  assert.equal(result.artifacts.length, 1);

  const planFalscherStatus = basePlan({
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api", expectStatus: 200 }]
  });
  const fetch500 = async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } });
  const failed = await runHttpOnlyPlan(planFalscherStatus, { fetchImpl: fetch500 });
  assert.equal(failed.ok, false);
});

test("Stufe 1: URL ausserhalb Allowlist bricht sofort ab", async () => {
  const plan = basePlan({
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api" }]
  });
  plan.steps[0].url = "https://example.com.boese.tld/api";
  // Schema/Statik wuerde das bereits ablehnen; Stufe 1 prueft zusaetzlich zur Laufzeit.
  const result = await runHttpOnlyPlan(plan, { fetchImpl: async () => { throw new Error("darf nie aufgerufen werden"); } });
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.match(String(result.abortReason), /Allowlist/);
});
