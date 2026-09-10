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

test("die Mehrdeutig-Meldung ueberlebt die Kuerzung des Panels auf 220 Zeichen — mit Trefferliste UND Rat", () => {
  const fehler = new MehrdeutigError(3, { strategy: "role", value: "button", name: "Suchen" }, ['"Suchen"', '"Erweiterte Suche"', '"Suche starten"']);
  const gekuerzt = fehler.message.slice(0, 220);
  assert.match(gekuerzt, /nth 0: "Suchen"/, `die Trefferliste faellt weg: ${gekuerzt}`);
  assert.match(gekuerzt, /"nth":N/, `der Rat faellt weg: ${gekuerzt}`);
  assert.match(gekuerzt, /NICHT denselben wiederholen/, `die Warnung faellt weg: ${gekuerzt}`);
  assert.ok(fehler.message.length <= 220, `Meldung ist ${fehler.message.length} Zeichen lang`);
  assert.match(fehler.message, /enger fassen/);
  // Ohne lesbare Treffer bleibt die Meldung trotzdem vollstaendig.
  assert.match(new MehrdeutigError(2, { strategy: "css", value: "a.x" }).message.slice(0, 220), /"nth":N/);
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

test("nth IM Wert (Groq live 09.09.: \"…\";nth:0) wird zum Feld nth — der Selektor bleibt heil", () => {
  const { decision } = repariereEntscheidung({ schemaVersion: 1, decision: "act", reason: "r", step: { id: "s1", action: "click", target: { selector: { strategy: "css", value: "\"a[href='/wiki/Ada_Lovelace']\";nth:0" } } } });
  assert.equal(decision.step.target.selector.value, "a[href='/wiki/Ada_Lovelace']");
  assert.equal(decision.step.target.selector.nth, 0);
  const zwei = repariereEntscheidung({ schemaVersion: 1, decision: "act", reason: "r", step: { id: "s1", action: "click", target: { selector: { strategy: "css", value: "a.x, nth=1" } } } });
  assert.equal(zwei.decision.step.target.selector.value, "a.x");
  assert.equal(zwei.decision.step.target.selector.nth, 1);
});

// --- E2E 10.09. ueber die Schnittstelle: nth kam bis zur Validierung, nicht bis
// zum Locator; und 15 s Wartezeit waren bei 8.000 Tokens je Minute zu kurz.
import { selektorDefinition } from "../workers/remote-browser/session-engine.js";
import { retryAfterMsAus } from "../control-server/src/llm/modelRouter.js";

test("selektorDefinition traegt nth in den Locator — sonst bleibt 'Treffer 1' ein leeres Versprechen", () => {
  assert.deepEqual(selektorDefinition({ type: "selectorClick", strategy: "role", value: "button", name: "Suchen", nth: 0 }), { strategy: "role", value: "button", name: "Suchen", nth: 0 });
  assert.deepEqual(selektorDefinition({ type: "selectorClick", strategy: "css", value: "a" }), { strategy: "css", value: "a" });
});

test("Wartezeit nach 429 kommt aus den Kopfzeilen des Anbieters", async () => {
  const kopf = (o) => new Map(Object.entries(o));
  assert.equal(retryAfterMsAus(kopf({ "retry-after": "7" })), 7000);
  assert.equal(retryAfterMsAus(kopf({ "x-ratelimit-reset-tokens": "12.097s" })), 12097);
  assert.equal(retryAfterMsAus(kopf({ "x-ratelimit-reset-tokens": "1m2.5s" })), 62500);
  assert.equal(retryAfterMsAus(kopf({})), undefined);
  const pfad = (await import("node:fs")).existsSync("control-server/src/routes/mausPlannerClient.js") ? "../control-server/src/routes/mausPlannerClient.js" : "../control-server/src/routes/mausPlanerClient.js";
  const { wartezeitAus } = await import(pfad);
  assert.equal(wartezeitAus([{ error: "http_429", retryAfterMs: 12097 }]), 15000, "nie unter dem Standard");
  assert.equal(wartezeitAus([{ error: "http_429", retryAfterMs: 38000 }]), 39000, "die Zahl des Anbieters plus eine Sekunde");
  assert.equal(wartezeitAus([{ error: "http_429", retryAfterMs: 90000 }]), 45000, "Deckel");
  assert.equal(wartezeitAus([{ error: "http_429" }]), 15000);
});

// --- Ein misslungenes Foto darf die Aktion nicht zu Fall bringen -----------
// Live 10.09. (de.wikipedia.org): Der Klick traf, die neue Seite stand da, und
// der Aufrufer bekam "502 page.screenshot: Timeout 15000ms exceeded, waiting
// for fonts to load". Die Maus schrieb FEHLGESCHLAGEN in ihren Verlauf und
// klickte auf einer Seite weiter, die es nicht mehr gab.
import { SESSION_DEFAULTS } from "../workers/remote-browser/session-engine.js";
import { readFileSync } from "node:fs";

test("das Foto hat eine eigene, kurze Zeitgrenze — kuerzer als Playwrights 15 s", () => {
  assert.equal(SESSION_DEFAULTS.screenshotTimeoutMs, 6000);
  assert.ok(SESSION_DEFAULTS.screenshotTimeoutMs < 15000, "sonst haengt die Aktion laenger als der Klick dauert");
});

test("misslingt das Foto, gilt das letzte Bild weiter und die Aktion bleibt erfolgreich", () => {
  const quelle = readFileSync("workers/remote-browser/session-engine.js", "utf8");
  const stelle = quelle.slice(quelle.indexOf("let bild = session.letztesBild"), quelle.indexOf("const title = await page.title()"));
  assert.match(stelle, /try \{/, "der Foto-Aufruf steht in einem try");
  assert.match(stelle, /timeout: cfg\.screenshotTimeoutMs/, "mit eigener Zeitgrenze");
  assert.match(stelle, /catch \(error\) \{\s*session\.bildFehler/, "der Fehler wird gemerkt, nicht geworfen");
  assert.match(quelle, /bildVeraltet: true/, "der Aufrufer erfaehrt, dass das Bild von vorhin ist");
});

// --- Klick-Frist und Klartext (live 10.09., de.wikipedia.org) --------------
test("Klick und Tippen haben eine eigene, groessere Frist als das Abwarten einer Seite", () => {
  assert.equal(SESSION_DEFAULTS.aktionTimeoutMs, 10000);
  assert.ok(SESSION_DEFAULTS.aktionTimeoutMs > SESSION_DEFAULTS.settleTimeoutMs, "sonst ist der Klick abgelaufen, bevor die Seite steht");
  const quelle = readFileSync("workers/remote-browser/session-engine.js", "utf8");
  assert.match(quelle, /locator\.click\(\{ timeout: cfg\.aktionTimeoutMs \}\)/);
  assert.match(quelle, /locator\.fill\(action\.text, \{ timeout: cfg\.aktionTimeoutMs \}\)/);
});

test("eine abgelaufene Klick-Frist wird zur deutschen Handlungsanweisung, nicht zu Playwright-Englisch", () => {
  const quelle = readFileSync("workers/remote-browser/session-engine.js", "utf8");
  const stelle = quelle.slice(quelle.indexOf("function klartext(error)"), quelle.indexOf("function fail(status, error)"));
  assert.match(stelle, /element_nicht_bedienbar/, "der Grund steht vorn");
  assert.match(stelle, /ANDERES Ziel/, "und der Rat auch");
  assert.match(stelle, /NICHT dasselbe wiederholen/);
  // Das Original bleibt lesbar dahinter — sonst ist die Fehlersuche blind.
  assert.match(stelle, /roh\.slice\(0, 80\)/);
});

// --- Mehrdeutig: die Treffer beim Namen nennen (live 10.09.) --------------
// "3 Treffer" allein half dem Modell nicht: es riet einen anderen, ebenfalls
// mehrdeutigen Selektor und verbrannte je Runde eine halbe Minute Denkzeit.
import { beschreibeTreffer } from "../workers/maus-engine/selector.mjs";

test("die Mehrdeutig-Meldung nennt die ersten Treffer mit Text und Adresse", async () => {
  const { MehrdeutigError } = await import("../workers/maus-engine/selector.mjs");
  const fehler = new MehrdeutigError(3, { strategy: "text", value: "Ada Lovelace" }, ['"Ada Lovelace" (/wiki/Ada_Lovelace)', '"Ada Lovelace (Begriffsklärung)" (/wiki/Ada_Lovelace_(BKL))']);
  assert.match(fehler.message, /nth 0: "Ada Lovelace" \(\/wiki\/Ada_Lovelace\)/);
  // Der zweite Treffer passt nur, wenn die 220 Zeichen reichen — der Rat geht vor.
  assert.ok(fehler.message.length <= 220, `Meldung ist ${fehler.message.length} Zeichen`);
  assert.match(fehler.message, /NICHT denselben wiederholen/);
  assert.equal(fehler.kandidaten.length, 2, "gemerkt werden beide, gezeigt so viele wie passen");
});

test("beschreibeTreffer liest hoechstens vier Treffer und faellt nie um", async () => {
  const bau = (n) => ({ nth: (i) => ({ innerText: async () => `Treffer ${i}`, getAttribute: async () => `/w/${i}` }), _n: n });
  assert.deepEqual(await beschreibeTreffer(bau(9), 9), ['"Treffer 0" (/w/0)', '"Treffer 1" (/w/1)', '"Treffer 2" (/w/2)', '"Treffer 3" (/w/3)']);
  const kaputt = { nth: () => ({ innerText: async () => { throw new Error("weg"); }, getAttribute: async () => null }) };
  assert.deepEqual(await beschreibeTreffer(kaputt, 2), ["nicht lesbar", "nicht lesbar"]);
  assert.deepEqual(await beschreibeTreffer({}, 2), [], "ohne nth-Faehigkeit keine Liste, kein Absturz");
});

// --- CSS mit Leerzeichen (live 10.09., zweimal hintereinander) -------------
// "#searchform button[type=\"submit\"]" wurde als TEXT gesucht und fand nie
// etwas. Die Form des Modells war richtig, die Deutung war falsch.
test("zusammengesetzte CSS-Selektoren bleiben CSS, echte Beschriftungen bleiben Text", () => {
  const alsZiel = (wert) => repariereEntscheidung({ schemaVersion: 1, decision: "act", reason: "r", step: { id: "s1", action: "click", target: wert } }).decision.step.target.selector;
  assert.deepEqual(alsZiel('#searchform button[type="submit"]'), { strategy: "css", value: '#searchform button[type="submit"]' });
  assert.deepEqual(alsZiel("form#searchform button[type='submit']"), { strategy: "css", value: "form#searchform button[type='submit']" });
  assert.deepEqual(alsZiel("div.treffer > a"), { strategy: "css", value: "div.treffer > a" });
  assert.deepEqual(alsZiel("#searchInput"), { strategy: "css", value: "#searchInput" });
  assert.deepEqual(alsZiel("h1"), { strategy: "css", value: "h1" });
  // Und die Gegenprobe: Beschriftungen mit Leerzeichen bleiben Text.
  assert.deepEqual(alsZiel("Impressum und Datenschutz"), { strategy: "text", value: "Impressum und Datenschutz" });
  assert.deepEqual(alsZiel("Ada Lovelace"), { strategy: "text", value: "Ada Lovelace" });
  assert.deepEqual(alsZiel("Weiter"), { strategy: "text", value: "Weiter" });
});

test("lange Treffer-Texte kuerzen die Liste, nie den Rat", async () => {
  const { mehrdeutigText } = await import("../workers/maus-engine/selector.mjs");
  const lang = mehrdeutigText(4, { strategy: "css", value: "a.treffer" }, ['"Ada Lovelace, britische Mathematikerin" (/wiki/Ada_Lovelace)', '"Ada Lovelace (Begriffsklaerung)" (/wiki/BKL)', '"Ada Lovelace Day" (/wiki/Day)']);
  assert.ok(lang.length <= 220, `Meldung ist ${lang.length} Zeichen: ${lang}`);
  assert.match(lang, /NICHT denselben wiederholen/, "der Rat bleibt immer");
  assert.match(lang, /nth 0: "Ada Lovelace, britische/, "wenigstens der erste Treffer bleibt, notfalls gekuerzt");
  assert.match(lang, /…/, "und die Kuerzung ist sichtbar");
  // Ohne Treffer bleibt die Meldung die alte, kurze.
  const ohne = mehrdeutigText(2, { strategy: "css", value: "a.x" }, []);
  assert.ok(ohne.length <= 220 && /"nth":N/.test(ohne) && !/nth 0:/.test(ohne));
});

// --- Welcher Treffer, wenn das Modell keinen nennt (gemessen 10.09.) -------
// Die Liste lautete `nth 0: ohne Text | nth 1: "Suchen"`; die blinde Null traf
// einen unbeschrifteten Symbolknopf, und der Lauf lief im Kreis.
test("die Ersatzwahl nimmt den ersten Treffer MIT Beschriftung, nicht blind die Null", async () => {
  const { besterTreffer } = await import("../workers/maus-engine/interactive-loop.mjs");
  assert.equal(besterTreffer('selector_mehrdeutig: 8 Treffer fuer role="button" — nth 0: ohne Text | nth 1: "Suchen" | nth 2: ohne Text — "nth":N …'), 1);
  assert.equal(besterTreffer('… — nth 0: "Verbergen" | nth 1: "Verbergen" — …'), 0, "sind alle beschriftet, gilt die Reihenfolge der Seite");
  assert.equal(besterTreffer('… — nth 0: "" | nth 1: "Treffer" — …'), 1, "leerer Text zaehlt nicht als Beschriftung");
  assert.equal(besterTreffer("selector_mehrdeutig: 2 Treffer fuer css=\"a.x\" — \"nth\":N …"), 0, "ohne Liste bleibt es bei der Null");
});

test("die getroffene Wahl steht im Feld repariert — mit ihrer Nummer", () => {
  const zeile = 'FEHLGESCHLAGEN: Klicken: button (selector_mehrdeutig: 8 Treffer fuer role="button" — nth 0: ohne Text | nth 1: "Suchen" — "nth":N (0-basiert) waehlen)';
  const e = benenneMehrdeutigeWahl({ ok: true, decision: { decision: "act", step: { id: "s2", action: "click", target: { selector: { strategy: "role", value: "button" } } } }, repariert: [] }, [zeile]);
  assert.equal(e.decision.step.target.selector.nth, 1);
  assert.ok(e.repariert.includes("nth_1_nach_mehrdeutig"), `repariert: ${e.repariert.join(",")}`);
});

// --- Zweiter Versuch mit Nachdruck (live 10.09., de.wikipedia.org) --------
// Wikipedias Suchknopf ist ein <button type="submit">, das die Seite
// absichtlich unsichtbar macht. Playwright wartete auf Bedienbarkeit, die nie
// eintrat — fuenf Schritte hintereinander "element_nicht_bedienbar".
test("ein nicht bedienbares, aber EINDEUTIGES Ziel bekommt genau einen erzwungenen Klick", () => {
  const quelle = readFileSync("workers/remote-browser/session-engine.js", "utf8");
  const stelle = quelle.slice(quelle.indexOf("let erzwungen = false;"), quelle.indexOf("waitForLoadState(\"domcontentloaded\"", quelle.indexOf("let erzwungen = false;")));
  assert.match(stelle, /catch \(fehler\)/, "der erste Versuch bleibt der normale");
  assert.match(stelle, /Timeout .\*exceeded/, "erzwungen wird NUR nach einer abgelaufenen Frist");
  assert.match(stelle, /force: true/);
  assert.match(quelle, /erzwungen \? \{ erzwungen: true \} : \{\}/, "die Antwort sagt, dass nachgedrueckt wurde");
  // Und es bleibt bei EINEM: kein zweiter force-Klick, keine Schleife.
  assert.equal((quelle.match(/force: true/g) || []).length, 1);
});

test("ein anderer Klick-Fehler wird NICHT erzwungen, sondern weitergereicht", () => {
  const quelle = readFileSync("workers/remote-browser/session-engine.js", "utf8");
  const stelle = quelle.slice(quelle.indexOf("let erzwungen = false;"), quelle.indexOf("erzwungen = true;"));
  assert.match(stelle, /if \(!\/Timeout \.\*exceeded\/i\.test\(String\(fehler\?\.message \|\| fehler\)\)\) throw fehler;/);
});
