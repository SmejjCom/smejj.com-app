// smejj.com — Tests fuer "Panel haengt sich automatisch live an" (Teil 2).
// Geprueft wird die Kette ohne Browser und ohne Netz:
//   Auftrag starten -> runId -> planId abwarten -> live.
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeAuftrag, starteMausAuftrag } from "../public/maus-auftrag.js";
import { warteAufLaufKennung } from "../public/maus-replay.js";
import { planAndExecute } from "../workers/maus-engine/planner-roundtrip.mjs";

// --- Eingabepruefung (fail-closed, bevor irgendetwas gesendet wird) ----------

test("pruefeAuftrag: Pflichtfelder werden vor dem Senden erzwungen", () => {
  assert.equal(pruefeAuftrag({}).error, "Aufgabe fehlt.");
  assert.equal(pruefeAuftrag({ task: "x" }).error, "capsuleRef fehlt (Task Capsule First).");
  assert.equal(
    pruefeAuftrag({ task: "x", capsuleRef: "c" }).error,
    "domainAllowlist fehlt (fail-closed Pflicht)."
  );
  assert.equal(pruefeAuftrag({ task: "x".repeat(4001), capsuleRef: "c", domainAllowlist: ["smejj.com"] }).ok, false);
  assert.equal(pruefeAuftrag({ task: "x", capsuleRef: "c", domainAllowlist: ["smejj.com"] }).ok, true);
});

test("starteMausAuftrag sendet nichts, wenn die Eingabe unvollstaendig ist", async () => {
  let gesendet = 0;
  const ergebnis = await starteMausAuftrag({ task: "", capsuleRef: "c", domainAllowlist: ["smejj.com"] }, {
    fetchImpl: async () => { gesendet += 1; return { ok: true, status: 200, json: async () => ({}) }; }
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(gesendet, 0, "fail-closed heisst: gar nicht erst senden");
});

test("starteMausAuftrag meldet den Start ans Panel", async () => {
  const gemeldet = [];
  const ergebnis = await starteMausAuftrag(
    { task: "Startseite pruefen", capsuleRef: "c1", domainAllowlist: ["smejj.com"] },
    {
      fetchImpl: async (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.equal(body.async, true, "die Anzeige braucht die sofortige runId");
        assert.equal(body.capsuleRef, "c1");
        return { ok: true, status: 202, json: async () => ({ ok: true, runId: "maus-abc-1", capsuleRef: "c1" }) };
      },
      melde: (detail) => gemeldet.push(detail)
    }
  );
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.runId, "maus-abc-1");
  assert.deepEqual(gemeldet, [{ runId: "maus-abc-1", capsuleRef: "c1" }]);
});

test("starteMausAuftrag reicht den echten Serverfehler durch, statt ihn zu ersetzen", async () => {
  const ergebnis = await starteMausAuftrag(
    { task: "t", capsuleRef: "c", domainAllowlist: ["smejj.com"] },
    {
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: "maus_engine_nicht_konfiguriert" }) }),
      melde: () => {}
    }
  );
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "maus_engine_nicht_konfiguriert");
});

test("401 wird als Anmeldehinweis gemeldet, nicht als Serverfehler", async () => {
  const ergebnis = await starteMausAuftrag(
    { task: "t", capsuleRef: "c", domainAllowlist: ["smejj.com"] },
    { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }), melde: () => {} }
  );
  assert.match(ergebnis.error, /anmelden/i);
});

// --- Warten auf die planId --------------------------------------------------

test("warteAufLaufKennung: liefert capsuleRef+planId, sobald der Plan steht", async () => {
  const antworten = [
    { ok: true, runId: "r1", status: "laeuft", capsuleRef: "c1", planId: null },
    { ok: true, runId: "r1", status: "laeuft", capsuleRef: "c1", planId: null },
    { ok: true, runId: "r1", status: "laeuft", capsuleRef: "c1", planId: "plan-7" }
  ];
  let i = 0;
  const kennung = await warteAufLaufKennung("r1", {
    holeStatus: async () => antworten[Math.min(i++, antworten.length - 1)],
    sleepImpl: async () => {},
    jetzt: () => 0,
    maxWaitMs: 10_000
  });
  assert.deepEqual(kennung, { capsuleRef: "c1", planId: "plan-7", fertig: false });
  assert.equal(i, 3, "es wird gepollt, bis die planId da ist");
});

test("warteAufLaufKennung: erkennt einen bereits fertigen Lauf", async () => {
  const kennung = await warteAufLaufKennung("r1", {
    holeStatus: async () => ({ ok: true, runId: "r1", status: "fertig", result: { capsuleRef: "c1", planId: "plan-9" } }),
    sleepImpl: async () => {},
    jetzt: () => 0
  });
  assert.deepEqual(kennung, { capsuleRef: "c1", planId: "plan-9", fertig: true });
});

test("warteAufLaufKennung: 401 bricht sofort ab, statt zwei Minuten zu pollen", async () => {
  let versuche = 0;
  await assert.rejects(
    warteAufLaufKennung("r1", {
      holeStatus: async () => { versuche += 1; throw new Error("Bitte zuerst auf smejj.com anmelden."); },
      sleepImpl: async () => {},
      jetzt: () => 0
    }),
    /anmelden/i
  );
  assert.equal(versuche, 1);
});

// --- planId wird VOR der Ausfuehrung veroeffentlicht -------------------------

const testPolicy = {
  capsuleRef: "maus-live-test",
  domainAllowlist: ["example.com"],
  budget: {
    maxActions: 20, maxLocalRetries: 1, maxPlannerRoundtrips: 1,
    maxDurationMs: 60_000, defaultActionTimeoutMs: 1000
  }
};

function testPlan(planId) {
  return {
    schemaVersion: 1,
    planId,
    createdAt: "2026-07-31T00:00:00Z",
    capsuleRef: testPolicy.capsuleRef,
    planner: { modelId: "beliebig", promptTemplateVersion: "v1" },
    policy: { domainAllowlist: testPolicy.domainAllowlist, budget: testPolicy.budget },
    steps: [{ id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api" }]
  };
}

test("onPlan meldet die planId VOR dem Lauf — sonst kann niemand live zuschauen", async () => {
  const reihenfolge = [];
  const ergebnis = await planAndExecute({
    task: "irgendwas",
    policyInput: testPolicy,
    plannerClient: async () => JSON.stringify(testPlan("plan-live-1")),
    runPlan: async (plan) => { reihenfolge.push(`lauf:${plan.planId}`); return { ok: true, actionLog: [] }; },
    onPlan: async ({ planId, capsuleRef }) => {
      reihenfolge.push(`plan:${planId}`);
      assert.equal(capsuleRef, "maus-live-test");
    }
  });
  assert.equal(ergebnis.ok, true);
  assert.deepEqual(reihenfolge, ["plan:plan-live-1", "lauf:plan-live-1"], "erst melden, dann laufen");
});

test("ein Fehler in onPlan darf den Lauf niemals stoeren (fail-safe)", async () => {
  const ergebnis = await planAndExecute({
    task: "irgendwas",
    policyInput: testPolicy,
    plannerClient: async () => JSON.stringify(testPlan("plan-live-2")),
    runPlan: async () => ({ ok: true, actionLog: [] }),
    onPlan: async () => { throw new Error("Anzeige kaputt"); }
  });
  assert.equal(ergebnis.ok, true, "die Anzeige ist Beiwerk, der Lauf ist die Wahrheit");
});

test("Non-Regression: ohne onPlan verhaelt sich planAndExecute unveraendert", async () => {
  const ergebnis = await planAndExecute({
    task: "irgendwas",
    policyInput: testPolicy,
    plannerClient: async () => JSON.stringify(testPlan("plan-live-3")),
    runPlan: async () => ({ ok: true, actionLog: [] })
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.plan.planId, "plan-live-3");
});

test("warteAufLaufKennung: gibt nach Ablauf der Frist ehrlich auf", async () => {
  let uhr = 0;
  await assert.rejects(
    warteAufLaufKennung("r1", {
      holeStatus: async () => ({ ok: true, status: "laeuft", capsuleRef: "c1" }),
      sleepImpl: async () => { uhr += 1500; },
      jetzt: () => uhr,
      maxWaitMs: 5000
    }),
    /keine planId/
  );
});
