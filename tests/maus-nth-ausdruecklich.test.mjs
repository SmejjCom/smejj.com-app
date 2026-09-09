// smejj.com — Mehrdeutige Treffer: die Maus benennt ihre Wahl mit "nth".
//
// LIVE 2026-09-09 (ferner Browser, de.wikipedia.org): Suchvorschlag UND
// Trefferliste trugen denselben Link a[href='/wiki/Ada_Lovelace']. Der
// Browser lehnte ab (selector_mehrdeutig, bewusst kein .first()), das Panel
// kuerzte den Rat auf "enger fassen (Rolle+Name aus dem Bedie", das Modell
// versuchte role+name — ebenfalls zwei Treffer — und der Lauf endete ohne
// Antwort. Drei Stellen muessen zusammenspielen, damit "nth" ankommt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSessionAction } from "../workers/remote-browser/session-engine.js";
import { MehrdeutigError } from "../workers/maus-engine/selector.mjs";
import { buildStepPrompt } from "../workers/maus-engine/prompt-template.mjs";

test("der ferne Browser nimmt nth an — und nur als ganze Zahl im Rahmen", () => {
  const ok = validateSessionAction({ type: "selectorClick", strategy: "css", value: "a[href='/wiki/Ada_Lovelace']", nth: 0 });
  assert.equal(ok.ok, true);
  assert.equal(ok.action.nth, 0, "nth fiel weg — genau der Live-Befund");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: "0" }).action.nth, undefined, "Text ist keine Auswahl");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: -1 }).action.nth, undefined);
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: 1.5 }).action.nth, undefined);
});

test("die Mehrdeutig-Meldung nennt nth VORN — sie ueberlebt die Kuerzung des Panels", () => {
  const fehler = new MehrdeutigError(2, { strategy: "css", value: "a[href='/wiki/Ada_Lovelace']" });
  const gekuerzt = fehler.message.slice(0, 120);
  assert.match(gekuerzt, /"nth":0/, `in den ersten 120 Zeichen fehlt der Rat: ${gekuerzt}`);
  assert.match(fehler.message, /enger fassen/);
});

test("der Schritt-Vertrag erklaert nth — sonst kann das Modell die Wahl nicht benennen", () => {
  const prompt = buildStepPrompt({
    task: "t", capsuleRef: "c", domainAllowlist: ["de.wikipedia.org"], budget: { maxActions: 10 }, files: [],
    visionAllowed: false, observation: { url: "https://de.wikipedia.org/", title: "W", elements: [] }, remainingSteps: 5
  });
  assert.match(prompt, /selector_mehrdeutig/);
  assert.match(prompt, /"nth":0/);
  assert.match(prompt, /Nie denselben/);
});

// --- Mehrdeutig → benannt (Live 09.09., dreimal derselbe Selektor ohne nth) ---
import { handleMausRun } from "../control-server/src/routes/mausEngineRoutes.js";
import { repariereEntscheidung, benenneMehrdeutigeWahl } from "../workers/maus-engine/interactive-loop.mjs";

const MEHRDEUTIG_ZEILE = `FEHLGESCHLAGEN: Klicken: a[href='/wiki/Ada_Lovelace'] (selector_mehrdeutig: 2 Treffer fuer css="a[href='/wiki/Ada_Lovelace']" — "nth":0 waehlt ausdruecklich den ersten (0-basiert) oder Selektor enger fassen (Rolle+Name aus dem Bedienbaum)) — bitte anders vorgehen`;
const KLICK = (value, extra = {}) => ({ ok: true, decision: { decision: "act", step: { id: "s4", action: "click", target: { selector: { strategy: "css", value, ...extra } } } }, repariert: [] });

test("derselbe Selektor nach selector_mehrdeutig bekommt nth 0 — sichtbar in repariert", () => {
  const e = benenneMehrdeutigeWahl(KLICK("a[href='/wiki/Ada_Lovelace']"), ["Schritt 1 ok", MEHRDEUTIG_ZEILE]);
  assert.equal(e.decision.step.target.selector.nth, 0);
  assert.ok(e.repariert.includes("nth_0_nach_mehrdeutig"));
});

test("ein ANDERER Selektor, ein schon gesetztes nth oder kein Mehrdeutig-Eintrag bleiben unangetastet", () => {
  assert.equal(benenneMehrdeutigeWahl(KLICK("a.anders"), [MEHRDEUTIG_ZEILE]).decision.step.target.selector.nth, undefined, "fremder Selektor");
  assert.equal(benenneMehrdeutigeWahl(KLICK("a[href='/wiki/Ada_Lovelace']", { nth: 1 }), [MEHRDEUTIG_ZEILE]).decision.step.target.selector.nth, 1, "eigene Wahl bleibt");
  assert.equal(benenneMehrdeutigeWahl(KLICK("a[href='/wiki/Ada_Lovelace']"), ["alles gut"]).decision.step.target.selector.nth, undefined, "ohne Ablehnung kein nth");
});

test("Anfuehrungszeichen um den Selektor-Wert gehoeren zur Huelle, nicht zum Selektor", () => {
  const { decision } = repariereEntscheidung({ schemaVersion: 1, decision: "act", reason: "r", step: { id: "s1", action: "click", target: { selector: { strategy: "xpath", value: "\"//a[@href='/wiki/Ada_Lovelace'][1]\"" } } } });
  assert.equal(decision.step.target.selector.value, "//a[@href='/wiki/Ada_Lovelace'][1]");
});

test("Route: die benannte Wahl kommt in der Antwort an", async () => {
  const res = { statusCode: null, body: null, headers: {}, setHeader(n, v) { res.headers[n] = v; }, writeHead(s) { res.statusCode = s; }, end(t) { res.body = JSON.parse(t); } };
  const body = {
    naechsterSchritt: true, task: "Oeffne den Artikel Ada Lovelace.", capsuleRef: "nth-test", domainAllowlist: ["de.wikipedia.org"],
    beobachtung: { url: "https://de.wikipedia.org/wiki/Spezial:Suche", title: "Suche", elements: [] },
    verlauf: [MEHRDEUTIG_ZEILE], restSchritte: 10
  };
  await handleMausRun({ method: "POST", headers: {}, authUser: { email: "smejjcom@gmail.com" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, res, {
    env: { SMEJJ_MAUS_ENGINE_ENABLED: "YES", SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus-worker.test", SMEJJ_MAUS_ENGINE_TOKEN: "t" },
    limiter: null, budgetEvaluator: () => ({ ok: true }),
    plannerClient: async () => JSON.stringify({ schemaVersion: 1, decision: "act", reason: "erster Treffer", step: { id: "s4", action: "click", target: { selector: { strategy: "css", value: "a[href='/wiki/Ada_Lovelace']" } } } }),
    fetchImpl: async () => { throw new Error("kein Netz"); }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.entscheidung.step.target.selector.nth, 0);
  assert.ok(res.body.repariert.includes("nth_0_nach_mehrdeutig"));
});
