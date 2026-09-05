// smejj.com — offensichtliche Formfehler des Modells werden repariert, nicht bestraft.
//
// LIVE GEMESSEN 2026-09-05: navigate ohne url (Adresse stand in target), step.id
// als Zahl, ein Plan statt einer Entscheidung — drei Ablehnungen, inhaltlich
// dreimal richtig. Und: das Panel kann nicht jede Schema-Aktion ausfuehren.
import test from "node:test";
import assert from "node:assert/strict";
import { repariereEntscheidung, validateLoopDecision } from "../workers/maus-engine/interactive-loop.mjs";
import { buildStepPrompt } from "../workers/maus-engine/prompt-template.mjs";
import { handleMausRun, PANEL_AKTIONEN } from "../control-server/src/routes/mausEngineRoutes.js";

const POLICY = {
  capsuleRef: "reparatur-test",
  domainAllowlist: ["example.com"],
  budget: { maxActions: 10, maxLocalRetries: 2, maxPlannerRoundtrips: 2, maxDurationMs: 300000, defaultActionTimeoutMs: 30000 },
  visionAllowed: false
};
const act = (step, extra = {}) => JSON.stringify({ schemaVersion: 1, decision: "act", reason: "weil", step, ...extra });

test("navigate: die Adresse wandert aus target nach url, id wird String", () => {
  const v = validateLoopDecision(act({ id: 1, action: "navigate", target: "https://example.com/x" }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.decision.step.url, "https://example.com/x");
  assert.equal(v.decision.step.id, "1");
  assert.equal(v.decision.step.target, undefined);
  assert.ok(v.repariert.includes("url_aus_target") && v.repariert.includes("id_zu_string"));
});

test("ein Plan statt einer Entscheidung: der erste Schritt zaehlt", () => {
  const plan = JSON.stringify({ schemaVersion: 1, planId: "p", createdAt: "x", capsuleRef: "c", planner: {}, policy: {}, steps: [{ id: "s1", action: "navigate", url: "https://example.com/" }] });
  const v = validateLoopDecision(plan, POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.decision.decision, "act");
  assert.equal(v.decision.step.url, "https://example.com/");
  assert.ok(v.repariert.includes("plan_zu_entscheidung"));
});

test("Plan-Felder neben einer gueltigen Entscheidung werden entfernt", () => {
  const v = validateLoopDecision(JSON.stringify({ schemaVersion: 1, decision: "done", reason: "da", result: "Example Domain", capsuleRef: "c", planner: {} }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.decision.result, "Example Domain");
  assert.ok(v.repariert.includes("feld_entfernt:capsuleRef"));
});

test("ein nackter Selektor-String wird zum Selektor; value wird zu text", () => {
  const v = validateLoopDecision(act({ id: "s2", action: "type", target: "#searchInput", value: "Berlin" }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.deepEqual(v.decision.step.target, { strategy: "css", value: "#searchInput" });
  assert.equal(v.decision.step.text, "Berlin");
});

test("type mit eingehuelltem Selektor wird ausgepackt", () => {
  const v = validateLoopDecision(act({ id: "s1", action: "type", target: { selector: { strategy: "css", value: "#q" } }, text: "Berlin" }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.deepEqual(v.decision.step.target, { strategy: "css", value: "#q" });
  assert.ok(v.repariert.includes("target_ausgepackt"));
});

test("fehlende Begruendung wird NICHT erfunden — der alte Waechter behaelt recht", () => {
  const v = validateLoopDecision(JSON.stringify({ schemaVersion: 1, decision: "act", step: { id: "s1", action: "navigate", url: "https://example.com/" } }), POLICY);
  assert.equal(v.ok, false);
});

test("done mit Zahl als Ergebnis wird zum String", () => {
  const { decision, repariert } = repariereEntscheidung({ schemaVersion: 1, decision: "done", reason: "r", result: 3769495 });
  assert.equal(decision.result, "3769495");
  assert.ok(repariert.includes("result_zu_string"));
});

test("Reparatur ist keine Aufweichung: Allowlist gilt auch fuer die reparierte Adresse", () => {
  const v = validateLoopDecision(act({ id: "s1", action: "navigate", target: "https://boese.example/" }), POLICY);
  assert.equal(v.ok, false);
  assert.equal(v.allowlistViolation, true);
});

test("was nach der Reparatur nicht passt, bleibt abgelehnt; eine saubere Antwort bleibt unangetastet", () => {
  assert.equal(validateLoopDecision(act({ id: "s1", action: "navigate" }), POLICY).ok, false, "navigate ohne jede Adresse");
  const sauber = validateLoopDecision(act({ id: "s1", action: "navigate", url: "https://example.com/" }), POLICY);
  assert.equal(sauber.ok, true);
  assert.deepEqual(sauber.repariert, []);
});

test("der Vertrag nennt nur die Aktionen, die der Aufrufer ausfuehren kann", () => {
  const basis = { task: "t", capsuleRef: "c", domainAllowlist: ["example.com"], budget: { maxSteps: 3 }, files: [], visionAllowed: false, observation: { url: "https://example.com/" }, history: [], remainingSteps: 3 };
  const alle = buildStepPrompt(basis);
  const panel = buildStepPrompt({ ...basis, erlaubteAktionen: PANEL_AKTIONEN });
  assert.match(alle, /Erlaubte Aktionen im Loop: [^\n]*hotkey/);
  assert.doesNotMatch(panel, /Erlaubte Aktionen im Loop: [^\n]*hotkey/);
  assert.match(panel, /Erlaubte Aktionen im Loop: [^\n]*click/);
  assert.match(panel, /NUR diese Aktionen kann der Browser hier ausfuehren/);
  assert.doesNotMatch(panel, /- [^\n]*hotkey: keys/, "auch die Pflichtfeld-Zeile kennt nur die erlaubten");
});

// --- Route: unausfuehrbare Aktion loest die Nachfrage aus ---------------------
const ENV_OK = Object.freeze({ SMEJJ_MAUS_ENGINE_ENABLED: "YES", SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus-worker.test", SMEJJ_MAUS_ENGINE_TOKEN: "test-token" });
function mockRes() { const res = { statusCode: null, body: null, headers: {}, setHeader(n, v) { res.headers[n] = v; }, writeHead(s) { res.statusCode = s; }, end(t) { res.body = JSON.parse(t); } }; return res; }
function mockReq(body) { return { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" }, authUser: { email: "smejjcom@gmail.com" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }; }
async function lauf(antworten) {
  const prompts = []; const res = mockRes();
  await handleMausRun(mockReq({ naechsterSchritt: true, task: "suche Berlin", capsuleRef: "c", domainAllowlist: ["example.com"], beobachtung: { url: "https://example.com/" }, verlauf: [], restSchritte: 5 }), res, {
    env: ENV_OK, limiter: null, budgetEvaluator: () => ({ ok: true }),
    plannerClient: async (p) => { prompts.push(p); return antworten.shift(); },
    fetchImpl: async () => { throw new Error("kein Netz im Test"); }
  });
  return { res, prompts };
}

test("Route: hotkey ist schemagueltig, im Panel aber unausfuehrbar -> Nachfrage -> click kommt durch", async () => {
  const { res, prompts } = await lauf([
    act({ id: "s1", action: "hotkey", keys: ["Enter"] }),
    act({ id: "s2", action: "click", target: { strategy: "role", value: "button", name: "Suchen" } })
  ]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.nachgefragt, true);
  assert.equal(res.body.entscheidung.step.action, "click");
  assert.deepEqual(res.body.entscheidung.step.target, { selector: { strategy: "role", value: "button", name: "Suchen" } }, "flacher Selektor wird fuer click eingehuellt");
  assert.ok(res.body.repariert.includes("target_eingehuellt"));
  assert.match(prompts[1], /aktion_im_browser_nicht_ausfuehrbar: hotkey/);
});

test("Route: reparierte Entscheidung kommt im ersten Anlauf durch und meldet, was repariert wurde", async () => {
  const { res, prompts } = await lauf([act({ id: 7, action: "navigate", target: "https://example.com/suche" })]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.nachgefragt, false);
  assert.equal(prompts.length, 1);
  assert.equal(res.body.entscheidung.step.url, "https://example.com/suche");
  assert.ok(res.body.repariert.includes("url_aus_target"));
  assert.match(prompts[0], /NUR diese Aktionen kann der Browser hier ausfuehren/);
});

// LIVE 2026-09-05: "Klicken: https://de.wikipedia.org/wiki/Ada_Lovelace" ging ins Leere.
test("ein Klick auf eine Web-Adresse wird zum navigate — die Allowlist gilt weiter", () => {
  const v = validateLoopDecision(act({ id: "s1", action: "click", target: "https://example.com/wiki/Ada" }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.decision.step.action, "navigate");
  assert.equal(v.decision.step.url, "https://example.com/wiki/Ada");
  assert.ok(v.repariert.includes("klick_auf_adresse_zu_navigate"));
  const fremd = validateLoopDecision(act({ id: "s1", action: "openLink", target: { value: "https://boese.example/" } }), POLICY);
  assert.equal(fremd.ok, false);
  assert.equal(fremd.allowlistViolation, true);
  const echt = validateLoopDecision(act({ id: "s1", action: "click", target: { strategy: "text", value: "Ada Lovelace" } }), POLICY);
  assert.equal(echt.decision.step.action, "click", "ein normales Klickziel bleibt ein Klick");
});

// LIVE 05.09. abends: "gmail.com registrieren" — navigate mit "gmail.com" ohne https://.
test("eine Adresse ohne Schema wird erkannt — Text ohne Punkt bleibt Text", () => {
  const v = validateLoopDecision(act({ id: "s1", action: "navigate", target: "example.com/konto" }), POLICY);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.decision.step.url, "https://example.com/konto");
  const text = validateLoopDecision(act({ id: "s1", action: "click", target: "Weiter" }), POLICY);
  assert.equal(text.decision?.step?.action ?? "click", "click", "'Weiter' ist keine Adresse");
  const domainFeld = validateLoopDecision(act({ id: "s1", action: "navigate", domain: "example.com" }), POLICY);
  assert.equal(domainFeld.ok, true, JSON.stringify(domainFeld));
  assert.equal(domainFeld.decision.step.url, "https://example.com");
});

test("eine Ablehnung nennt den Vorschlag des Modells (Aktion und Felder)", async () => {
  const v = validateLoopDecision(act({ id: "s1", action: "navigate", ziel: "irgendwas ohne Adresse" }), POLICY);
  assert.equal(v.ok, false);
  assert.equal(v.vorschlag.action, "navigate");
  assert.deepEqual(v.vorschlag.felder, ["id", "action", "ziel"]);
  const { res } = await lauf([act({ id: "s1", action: "navigate", ziel: "x" }), act({ id: "s1", action: "navigate", ziel: "x" })]);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.vorschlag.action, "navigate");
  assert.ok(Array.isArray(res.body.repariert));
});

// LIVE-MITSCHNITT 06.09.: extract mit id/action/target/name abgelehnt, Meldung sprach von url.
test("Selektor-Kurzformen werden zur Schema-Form: selector-String, css/text/role-Kurzform", () => {
  const a = validateLoopDecision(act({ id: "s1", action: "extract", name: "titel", target: { selector: "h1" } }), POLICY);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual(a.decision.step.target, { strategy: "css", value: "h1" });
  const b = validateLoopDecision(act({ id: "s1", action: "extract", name: "titel", target: { css: "h1" } }), POLICY);
  assert.equal(b.ok, true, JSON.stringify(b));
  const c = validateLoopDecision(act({ id: "s1", action: "extract", name: "titel", target: { role: "heading", name: "Example Domain" } }), POLICY);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(c.decision.step.target, { strategy: "role", value: "heading", name: "Example Domain" });
  const d = validateLoopDecision(act({ id: "s1", action: "click", target: { selector: "Weiter" } }), POLICY);
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.deepEqual(d.decision.step.target, { selector: { strategy: "text", value: "Weiter" } });
  const e = validateLoopDecision(act({ id: "s1", action: "extract", name: "titel", target: "h1" }), POLICY);
  assert.equal(e.ok, true, JSON.stringify(e));
});

test("die Ablehnung nennt zuerst den praezisen Grund fuer die vorgeschlagene Aktion", () => {
  const ohneName = validateLoopDecision(act({ id: "s1", action: "extract", target: { strategy: "css", value: "h1" } }), POLICY);
  assert.equal(ohneName.ok, false);
  assert.match(ohneName.errors[0], /^Pflichtfeld fehlt fuer extract: name$/);
  const kaputt = validateLoopDecision(act({ id: "s1", action: "extract", name: "t", target: { irgendwas: 1 } }), POLICY);
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.errors[0], /target unbrauchbar fuer extract: erwartet \{strategy,value\}, erhalten Felder irgendwas/);
  assert.deepEqual(kaputt.vorschlag.target, { felder: ["irgendwas"], selector: "undefined" });
});
