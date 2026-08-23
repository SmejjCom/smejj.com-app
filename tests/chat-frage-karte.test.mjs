// smejj.com — Tests fuer die Frage-Karte (Betreiber 2026-08-23, Vorbild
// Antigravity). Ausgelagert aus chat-schritte.test.mjs (800-Zeilen-Regel);
// der DOM-Stub und der Strom-Aufbau werden von dort uebernommen.

import test from "node:test";
import assert from "node:assert/strict";

function knoten(tag = "div") {
  let eigenerText = "";
  const self = {
    tagName: tag, className: "", dataset: {}, children: [], parentElement: null, attribute: {},
    get textContent() { return eigenerText + self.children.map((k) => k.textContent).join(""); },
    set textContent(wert) { eigenerText = String(wert ?? ""); self.children.splice(0); },
    setAttribute(name, wert) { self.attribute[name] = wert; },
    getAttribute(name) { return Object.hasOwn(self.attribute, name) ? self.attribute[name] : null; },
    remove() { const e = self.parentElement; if (!e) return; const i = e.children.indexOf(self); if (i >= 0) e.children.splice(i, 1); self.parentElement = null; },
    append(...kinder) { for (const k of kinder) { if (!self.children.includes(k)) self.children.push(k); k.parentElement = self; } },
    insertBefore(neu, vor) { const i = self.children.indexOf(vor); self.children.splice(i < 0 ? self.children.length : i, 0, neu); neu.parentElement = self; return neu; },
    get previousElementSibling() { const e = self.parentElement; if (!e) return null; const i = e.children.indexOf(self); return i > 0 ? e.children[i - 1] : null; },
    querySelector: () => null,
    scrollIntoView() {}
  };
  return self;
}

function stromAus(ereignisse) {
  const encoder = new TextEncoder();
  let i = 0;
  return { ok: true, body: { getReader: () => ({ read: async () => (i < ereignisse.length
    ? { value: encoder.encode(`data: ${ereignisse[i++]}\n\n`), done: false } : { value: undefined, done: true }) }) } };
}
const textEreignis = (inhalt) => JSON.stringify({ choices: [{ delta: { content: inhalt } }] });

async function laufeStrom(ereignisse) {
  const log = knoten("section"); const antwort = knoten("article"); log.append(antwort);
  globalThis.document = { createElement: (tag) => knoten(tag) };
  const alterFetch = globalThis.fetch;
  globalThis.fetch = async () => stromAus(ereignisse);
  try { await streamChatAnswer("https://beispiel.test/api/chat", {}, antwort, {}); }
  finally { globalThis.fetch = alterFetch; }
  return antwort;
}

const { streamChatAnswer } = await import("../public/ai/chat-stream.js");
// ---------------------------------------------------------------------------
// Frage-Karte (Betreiber 2026-08-23, Vorbild Antigravity): `smejj_frage` wird
// zur Karte HINTER der Antwort — nie in die Antwort. Ein Klick schickt die
// Option als Nutzernachricht, danach ist die Karte beantwortet.

const { zeigeFrage } = await import("../public/ai/chat-stream.js");

// Der Stub oben kennt weder Klick noch Klassenliste — hier das Noetigste.
function knopfKnoten(tag) {
  const k = knoten(tag);
  const hoerer = {};
  k.classList = { add: (c) => { k.className += ` ${c}`; }, contains: (c) => k.className.split(" ").includes(c) };
  k.addEventListener = (art, fn) => { hoerer[art] = fn; };
  k.click = () => hoerer.click?.();
  Object.defineProperty(k, "nextElementSibling", { get() {
    const e = k.parentElement; if (!e) return null;
    const i = e.children.indexOf(k); return i >= 0 && i + 1 < e.children.length ? e.children[i + 1] : null;
  } });
  return k;
}

function frageBuehne() {
  const log = knopfKnoten("section");
  const antwort = knopfKnoten("article");
  const danach = knopfKnoten("div"); // z. B. Aktionsknoepfe hinter der Antwort
  log.append(antwort, danach);
  globalThis.document = { createElement: (tag) => knopfKnoten(tag) };
  return { log, antwort, danach };
}

test("die Frage-Karte steht HINTER der Antwort, nicht darin", () => {
  const { log, antwort, danach } = frageBuehne();
  const karte = zeigeFrage(antwort, { frage: "Für welchen Markt?", optionen: ["USA", "Deutschland"] }, { senden: () => true });
  assert.ok(karte);
  assert.equal(antwort.children.length, 0, "die Antwort bleibt leer");
  assert.equal(log.children[1], karte, "direkt hinter der Antwort");
  assert.equal(log.children[2], danach);
  assert.equal(karte.dataset.smejjFrage, "true");
  const knoepfe = karte.children[1].children;
  assert.equal(knoepfe.length, 3, "zwei Optionen + Überspringen");
  assert.equal(knoepfe[0].textContent, "USA (Empfehlung)", "die erste Option ist die Empfehlung");
  assert.equal(knoepfe[0].dataset.option, "USA", "gesendet wird die nackte Option");
  assert.equal(knoepfe[2].textContent, "Überspringen");
});

test("ein Klick schickt die Option als Nutzernachricht und schliesst die Karte", () => {
  const { antwort } = frageBuehne();
  const gesendet = [];
  const karte = zeigeFrage(antwort, { frage: "Welche Stadt?", optionen: ["Berlin", "Hamburg", "Beide"] }, { senden: (t) => { gesendet.push(t); return true; } });
  const knoepfe = karte.children[1].children;
  knoepfe[1].click();
  assert.deepEqual(gesendet, ["Hamburg"]);
  assert.equal(karte.dataset.beantwortet, "true");
  assert.ok(knoepfe.every((k) => k.disabled === true), "danach sind alle Knoepfe aus");
  assert.ok(knoepfe[1].classList.contains("gewaehlt"));
  assert.equal(karte.children[2].textContent, "Gewählt: Hamburg");
  knoepfe[0].click();
  assert.equal(gesendet.length, 1, "eine Karte antwortet nur einmal");
});

test("Überspringen schickt eine Weiter-Anweisung und markiert 'Übersprungen'", () => {
  const { antwort } = frageBuehne();
  const gesendet = [];
  const karte = zeigeFrage(antwort, { frage: "Welche Stadt?", optionen: ["Berlin", "Hamburg"] }, { senden: (t) => { gesendet.push(t); return true; } });
  karte.children[1].children[2].click();
  assert.match(gesendet[0], /^Übersprungen/);
  assert.equal(karte.children[2].textContent, "Übersprungen");
});

test("kaputte Fragen ergeben keine Karte", () => {
  const { log, antwort } = frageBuehne();
  assert.equal(zeigeFrage(antwort, { frage: "", optionen: ["a", "b"] }), null);
  assert.equal(zeigeFrage(antwort, { frage: "x?", optionen: ["nur eine"] }), null);
  assert.equal(zeigeFrage(antwort, null), null);
  assert.equal(log.children.length, 2, "nichts eingefuegt");
});

async function laufeStromMitKnoepfen(ereignisse) {
  const { antwort } = frageBuehne();
  const alterFetch = globalThis.fetch;
  globalThis.fetch = async () => stromAus(ereignisse);
  try { await streamChatAnswer("https://beispiel.test/api/chat", {}, antwort, {}); }
  finally { globalThis.fetch = alterFetch; }
  return antwort;
}

test("im Strom wird smejj_frage zur Karte und nie zu Antworttext", async () => {
  const antwort = await laufeStromMitKnoepfen([
    textEreignis("Dazu brauche ich eine Angabe."),
    JSON.stringify({ smejj_frage: { frage: "Für welchen Markt?", optionen: ["USA", "Deutschland"] } })
  ]);
  assert.equal(antwort.textContent, "Dazu brauche ich eine Angabe.");
  const karte = antwort.parentElement.children.find((k) => k.dataset.smejjFrage === "true");
  assert.ok(karte, "die Karte haengt im Log");
  assert.ok(!antwort.textContent.includes("USA"));
});

test("faellt die Karte, landet ihr JSON trotzdem NIE in der Antwort", async () => {
  // Der einfache Stub kennt keine Klick-Hoerer: zeigeFrage wirft. Der Fang
  // muss eigenstaendig sein — sonst schreibt der allgemeine catch das rohe
  // Ereignis als Text in die Blase (so gesehen beim Bau, 2026-08-23).
  const antwort = await laufeStrom([
    textEreignis("Dazu brauche ich eine Angabe."),
    JSON.stringify({ smejj_frage: { frage: "Für welchen Markt?", optionen: ["USA", "Deutschland"] } })
  ]);
  assert.equal(antwort.textContent, "Dazu brauche ich eine Angabe.");
});

// Die Bruecke laesst nur Erlaubtes durch (chat-bridge-strom.js) — die Karte
// muss dort ausdruecklich stehen, sonst kommt sie nie beim Nutzer an
// (live gemessen 2026-08-23: Control sendete sie, der Filter warf sie fort).
const { frageDurchreichen } = await import("../public/chat-bridge-strom.js");

test("die Bruecke reicht smejj_frage gepruef t durch, alles andere nicht", () => {
  assert.deepEqual(
    frageDurchreichen(JSON.stringify({ smejj_frage: { frage: "Welche Stadt?", optionen: ["Berlin", "Hamburg", "x".repeat(200), "d", "e"], fremd: "weg" } })),
    { frage: "Welche Stadt?", optionen: ["Berlin", "Hamburg", "x".repeat(80), "d"] }
  );
  assert.equal(frageDurchreichen(JSON.stringify({ smejj_frage: { frage: "x?", optionen: ["nur eine"] } })), null);
  assert.equal(frageDurchreichen(JSON.stringify({ choices: [{ delta: { content: "Text" } }] })), null);
  assert.equal(frageDurchreichen("{kaputt"), null);
});

// Schnellspur der Bruecke (Groq, eigener Modellaufruf): frage_stellen kommt dort
// als tool_calls-Bruchstuecke — pipeVisibleStream sammelt sie und schickt am
// Ende EINE Karte, nie Werkzeug-Rohtext.
const { pipeVisibleStream, FRAGE_WERKZEUG } = await import("../public/chat-bridge-strom.js");

function bridgeStrom(events) {
  return { async *[Symbol.asyncIterator]() { const enc = new TextEncoder(); for (const e of events) yield enc.encode(`data: ${e}\n\n`); } };
}
const toolTeil = (index, teil) => JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, ...teil }] } }] });

test("Schnellspur: frage_stellen-Bruchstuecke werden zur Karte, Text bleibt Text", async () => {
  const stuecke = [];
  const res = { write: (t) => stuecke.push(t) };
  const sichtbar = await pipeVisibleStream(bridgeStrom([
    JSON.stringify({ choices: [{ delta: { content: "Kurz eine Frage." } }] }),
    toolTeil(0, { id: "c1", function: { name: "frage_stellen", arguments: '{"frage":"Welche Sta' } }),
    toolTeil(0, { function: { arguments: 'dt?","optionen":["Berlin","Hamburg"]}' } }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    "[DONE]"
  ]), res);
  const gesendet = stuecke.join("");
  assert.equal(sichtbar, "Kurz eine Frage.");
  const karten = stuecke.filter((s) => s.includes("smejj_frage")).map((s) => JSON.parse(s.replace(/^data: /, "").trim()).smejj_frage);
  assert.deepEqual(karten, [{ frage: "Welche Stadt?", optionen: ["Berlin", "Hamburg"] }]);
  assert.ok(!gesendet.includes("tool_calls"), "Werkzeug-Rohtext geht nie raus");
  assert.ok(gesendet.indexOf("smejj_frage") < gesendet.indexOf("[DONE]"), "Karte vor dem Abschluss");
  assert.equal(FRAGE_WERKZEUG.function.name, "frage_stellen");
});

test("Schnellspur ohne Werkzeugaufruf: keine Karte", async () => {
  const stuecke = [];
  await pipeVisibleStream(bridgeStrom([JSON.stringify({ choices: [{ delta: { content: "Nur Text." } }] }), "[DONE]"]), { write: (t) => stuecke.push(t) });
  assert.ok(!stuecke.join("").includes("smejj_frage"));
});

// Das Browser-Modell (Gemini Nano) kann keine Karte stellen: antwortet es mit
// Rueckfragen, muss der Server ran (live 23.08.: "Wo wohnst du? Was magst du?").
const { istRueckfrage } = await import("../public/ai/lokalesModell.js");

test("istRueckfrage erkennt Fragenlisten und 'brauche ich ein paar Infos'", () => {
  assert.equal(istRueckfrage("Gerne! Wo wohnst du? Was interessiert dich?"), true);
  assert.equal(istRueckfrage("Um dir zu helfen, brauche ich noch ein paar Infos: Region, Budget."), true);
  assert.equal(istRueckfrage("Die Hauptstadt von Frankreich ist Paris."), false);
  assert.equal(istRueckfrage("Meinst du das ernst? Dann: ja."), false, "eine einzelne Rueckfrage im Fluss ist keine Fragenliste");
  assert.equal(istRueckfrage(""), false);
});
