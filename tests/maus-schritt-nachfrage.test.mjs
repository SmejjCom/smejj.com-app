// smejj.com — der Server fragt bei einer abgelehnten Schritt-Entscheidung EINMAL nach.
//
// LIVE GEMESSEN 2026-09-05 (sechs Anfragen, dieselbe Beobachtung, Live-Server):
// drei "done: Example Domain", drei Ablehnungen mit je anderem Formfehler.
// Vorher ging jede davon als 422 ans Panel — nach zwei Ablehnungen gab der
// Lauf auf, obwohl die Antwort auf der Seite stand.
import test from "node:test";
import assert from "node:assert/strict";
import { handleMausRun } from "../control-server/src/routes/mausEngineRoutes.js";
import { buildStepRetryPrompt } from "../workers/maus-engine/prompt-template.mjs";

const ENV_OK = Object.freeze({
  SMEJJ_MAUS_ENGINE_ENABLED: "YES",
  SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus-worker.test",
  SMEJJ_MAUS_ENGINE_TOKEN: "test-token"
});

function mockRes() {
  const res = { statusCode: null, body: null, headers: {}, setHeader(n, v) { res.headers[n] = v; }, writeHead(s) { res.statusCode = s; }, end(t) { res.body = JSON.parse(t); } };
  return res;
}
function mockReq(body) {
  return {
    method: "POST", headers: { "x-forwarded-for": "203.0.113.7" }, authUser: { email: "smejjcom@gmail.com" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); }
  };
}
function schrittBody() {
  return {
    naechsterSchritt: true,
    task: "Oeffne example.com und sag mir, welche Ueberschrift dort steht.",
    capsuleRef: "nachfrage-test", domainAllowlist: ["example.com"],
    beobachtung: { url: "https://example.com/", title: "Example Domain", elements: [] },
    verlauf: [], restSchritte: 10
  };
}
const GUT = JSON.stringify({ schemaVersion: 1, decision: "done", reason: "steht da", result: "Example Domain" });
// Genau der Live-Fehler: navigate ohne url.
const SCHLECHT = JSON.stringify({ schemaVersion: 1, decision: "act", reason: "oeffnen", step: { id: "s1", action: "navigate" } });
const FREMD = JSON.stringify({ schemaVersion: 1, decision: "act", reason: "weg", step: { id: "s1", action: "navigate", url: "https://boese.example/" } });

async function lauf(antworten) {
  const prompts = [];
  const res = mockRes();
  await handleMausRun(mockReq(schrittBody()), res, {
    env: ENV_OK, limiter: null, budgetEvaluator: () => ({ ok: true }),
    plannerClient: async (p) => { prompts.push(p); return antworten.shift(); },
    fetchImpl: async () => { throw new Error("kein Netz im Test"); }
  });
  return { res, prompts };
}

test("abgelehnte Entscheidung: einmal nachfragen, dann 200 mit dem Ergebnis", async () => {
  const { res, prompts } = await lauf([SCHLECHT, GUT]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.entscheidung.result, "Example Domain");
  assert.equal(res.body.nachgefragt, true);
  assert.equal(prompts.length, 2, "genau eine Nachfrage");
  assert.match(prompts[1], /VORIGE ANTWORT WURDE ABGELEHNT/);
  assert.match(prompts[1], /url/, "der Grund der Ablehnung muss im zweiten Prompt stehen");
  assert.ok(prompts[1].startsWith(prompts[0]), "die Nachfrage traegt den ganzen ersten Prompt");
});

test("zweimal daneben: ehrliche 422, keine Endlosschleife", async () => {
  const { res, prompts } = await lauf([SCHLECHT, SCHLECHT]);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, "entscheidung_abgelehnt");
  assert.equal(res.body.nachgefragt, true);
  assert.equal(prompts.length, 2);
});

test("gute Entscheidung: keine Nachfrage, ein Modellaufruf", async () => {
  const { res, prompts } = await lauf([GUT]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nachgefragt, false);
  assert.equal(prompts.length, 1);
});

test("Allowlist-Verstoss wird NICHT nachverhandelt", async () => {
  const { res, prompts } = await lauf([FREMD, GUT]);
  assert.equal(res.statusCode, 422, JSON.stringify(res.body));
  assert.equal(prompts.length, 1, "kein zweiter Anlauf fuer eine fremde Domain");
});

test("der Nachfrage-Prompt traegt Basis, Gruende und den Vertrag in Kurzform", () => {
  const p = buildStepRetryPrompt({ stepPrompt: "BASIS", errors: ["$.steps[0]: Pflichtfeld fehlt: url"], vorigeAntwort: "{\"x\":1}" });
  assert.ok(p.startsWith("BASIS\n"));
  assert.match(p, /Pflichtfeld fehlt: url/);
  assert.match(p, /kein Plan, keine Felder capsuleRef, planner, policy oder steps/);
  assert.match(p, /step\.id ist ein STRING/);
  assert.match(p, /\{"x":1\}/);
  assert.throws(() => buildStepRetryPrompt({}), /step_retry_parameter_unvollstaendig/);
});
