// smejj.com — Tests fuer den sichtbaren Arbeitsfortschritt.
//
// Betreiber-Befund 2026-08-04, woertlich: "Dann sucht, merkt man nicht, ob es
// funktioniert" und "dann denkt man, es hat aufgehoert, aber im Hintergrund
// arbeitet es weiter". Beides ist derselbe blinde Fleck.
//
// Die vier Zusagen:
//   1. Jeder Werkzeugschritt wird VOR und NACH der Ausfuehrung gemeldet.
//   2. Ein Schritt landet NIE im Antworttext.
//   3. Ein aelterer Client, der das Ereignis nicht kennt, bleibt unbeschaedigt.
//   4. Die Schrittliste steht NEBEN der Antwort, nicht darin — sonst frisst sie
//      der Markdown-Renderer.

import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS, beschreibeWerkzeug, sendeSchritt, streamWithTools, zaehleTreffer } from "../control-server/src/llm/toolLoop.js";

function stream(events) {
  return {
    async *[Symbol.asyncIterator]() {
      const encoder = new TextEncoder();
      for (const event of events) yield encoder.encode(`${event}\n\n`);
    }
  };
}

function sammelAntwort() {
  const stuecke = [];
  return {
    write: (text) => stuecke.push(text),
    gesendet: () => stuecke.join(""),
    schritte: () => stuecke
      .filter((s) => s.includes("smejj_schritt"))
      .map((s) => JSON.parse(s.replace(/^data: /, "").trim()).smejj_schritt)
  };
}

const textEvent = (inhalt) => `data: ${JSON.stringify({ choices: [{ delta: { content: inhalt } }] })}`;
const toolEvent = (index, teil) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, ...teil }] } }] })}`;

test("beschreibeWerkzeug liest Suchbegriff und Markt, ohne auszufuehren", () => {
  assert.deepEqual(
    beschreibeWerkzeug({ function: { name: "web_suche", arguments: '{"anfrage":"office for sale San Jose","region":"us"}' } }),
    { art: "suche", text: "office for sale San Jose", markt: "us" }
  );
  assert.deepEqual(
    beschreibeWerkzeug({ function: { name: "seite_lesen", arguments: '{"url":"https://imild.com/"}' } }),
    { art: "seite", text: "https://imild.com/", markt: "" }
  );
  // Eine unbekannte Region wird verworfen, nicht durchgereicht.
  assert.equal(beschreibeWerkzeug({ function: { name: "web_suche", arguments: '{"anfrage":"x","region":"mars"}' } }).markt, "");
});

test("beschreibeWerkzeug ist fail-safe bei kaputten Argumenten", () => {
  assert.deepEqual(beschreibeWerkzeug({ function: { name: "web_suche", arguments: "{kein json" } }), { art: "suche", text: "", markt: "" });
  assert.deepEqual(beschreibeWerkzeug(null), { art: "werkzeug", text: "", markt: "" });
  assert.deepEqual(beschreibeWerkzeug({}), { art: "werkzeug", text: "", markt: "" });
});

test("zaehleTreffer zaehlt das eigene Ausgabeformat, nicht fremden Text", () => {
  assert.equal(zaehleTreffer("Suchergebnisse:\n1. Eins\n   https://a.example/\n2. Zwei\n   https://b.example/"), 2);
  assert.equal(zaehleTreffer("Keine Treffer fuer \"xyz\"."), 0);
  assert.equal(zaehleTreffer(""), 0);
  assert.equal(zaehleTreffer(null), 0);
});

test("sendeSchritt reisst einen abgebrochenen Strom nicht mit", () => {
  const kaputt = { write: () => { throw new Error("Strom zu"); } };
  assert.doesNotThrow(() => sendeSchritt(kaputt, { art: "suche", text: "x", zustand: "laeuft" }));
});

// Der eigentliche Befund: waehrend des Werkzeuglaufs passiert sichtbar nichts.
test("jeder Werkzeuglauf meldet sich vorher UND nachher", async () => {
  const res = sammelAntwort();
  await streamWithTools({
    result: { response: { body: stream([
      textEvent("Ich suche für Sie."),
      toolEvent(0, { id: "c1", function: { name: "web_suche", arguments: '{"anfrage":"office for sale San Jose","region":"us"}' } }),
      "data: [DONE]"
    ]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async () => ({ ok: true, response: { body: stream([textEvent("Hier sind die Treffer."), "data: [DONE]"]) } }),
    runTool: async () => "Suchergebnisse:\n1. LoopNet\n   https://www.loopnet.com/x\n2. Crexi\n   https://www.crexi.com/y"
  });

  const schritte = res.schritte();
  assert.equal(schritte.length, 2, "genau ein laeuft und ein fertig");
  assert.deepEqual(schritte[0], { art: "suche", text: "office for sale San Jose", markt: "us", zustand: "laeuft" });
  assert.equal(schritte[1].zustand, "fertig");
  assert.equal(schritte[1].treffer, 2);
  // Reihenfolge: der laufende Schritt muss VOR dem Ergebnis beim Nutzer sein.
  const gesendet = res.gesendet();
  assert.ok(gesendet.indexOf("laeuft") < gesendet.indexOf("Hier sind die Treffer"));
});

test("ein Schritt landet niemals im Antworttext", async () => {
  const res = sammelAntwort();
  await streamWithTools({
    result: { response: { body: stream([
      toolEvent(0, { id: "c1", function: { name: "web_suche", arguments: '{"anfrage":"geheim","region":"de"}' } }),
      "data: [DONE]"
    ]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async () => ({ ok: true, response: { body: stream([textEvent("Antwort."), "data: [DONE]"]) } }),
    runTool: async () => "Keine Treffer"
  });
  // So liest ein Client den Antworttext zusammen: nur choices[].delta.content.
  const antwortText = res.gesendet().split("\n\n")
    .map((z) => z.replace(/^data: /, "").trim())
    .filter((z) => z && z !== "[DONE]")
    .map((z) => { try { return JSON.parse(z).choices?.[0]?.delta?.content || ""; } catch { return ""; } })
    .join("");
  assert.equal(antwortText, "Antwort.");
  assert.ok(!antwortText.includes("geheim"), "der Suchbegriff darf nicht in der Antwort stehen");
});

// Rueckwaertskompatibilitaet: Ein Client, der das Ereignis nicht kennt, liest
// choices[0].delta.content -> undefined -> haengt "" an. Nichts geht kaputt.
test("ein aelterer Client bleibt unbeschaedigt", () => {
  const res = sammelAntwort();
  sendeSchritt(res, { art: "suche", text: "test", zustand: "laeuft" });
  const nutzlast = JSON.parse(res.gesendet().replace(/^data: /, "").trim());
  assert.equal(nutzlast.choices, undefined, "kein choices-Feld: ein alter Client haengt nichts an");
  assert.ok(nutzlast.smejj_schritt, "die Nutzlast steht in einem eigenen Feld");
});

test("Werkzeuge ohne Fortschritt bleiben unveraendert nutzbar", async () => {
  const res = sammelAntwort();
  await streamWithTools({
    result: { response: { body: stream([textEvent("Direkt geantwortet."), "data: [DONE]"]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async () => { throw new Error("darf nicht aufgerufen werden"); }
  });
  assert.equal(res.schritte().length, 0, "ohne Werkzeug kein Schritt");
  assert.match(res.gesendet(), /Direkt geantwortet/);
});

test("die Werkzeugliste bleibt unveraendert (Non-Regression)", () => {
  assert.deepEqual(AGENT_TOOLS.map((e) => e.function.name), ["seite_lesen", "web_suche"]);
});

// --- Anzeigeseite -----------------------------------------------------------
// Minimales Dokument statt jsdom: das Projekt haelt sich abhaengigkeitsfrei.

function knoten(tag = "div") {
  const self = {
    tagName: tag, className: "", textContent: "", dataset: {}, children: [], parentElement: null,
    attribute: {},
    setAttribute(name, wert) { self.attribute[name] = wert; },
    append(...kinder) { for (const k of kinder) { if (!self.children.includes(k)) self.children.push(k); k.parentElement = self; } },
    insertBefore(neu, vor) {
      const i = self.children.indexOf(vor);
      self.children.splice(i < 0 ? self.children.length : i, 0, neu);
      neu.parentElement = self;
      return neu;
    },
    get previousElementSibling() {
      const eltern = self.parentElement;
      if (!eltern) return null;
      const i = eltern.children.indexOf(self);
      return i > 0 ? eltern.children[i - 1] : null;
    }
  };
  return self;
}

function buehne() {
  const log = knoten("section");
  const antwort = knoten("article");
  log.append(antwort);
  globalThis.document = { createElement: (tag) => knoten(tag) };
  return { log, antwort };
}

const { zeigeSchritt } = await import("../public/ai/chat-stream.js");

test("die Schrittliste steht NEBEN der Antwort, nicht darin", () => {
  const { log, antwort } = buehne();
  zeigeSchritt(antwort, { art: "suche", text: "office san jose", markt: "us", zustand: "laeuft" });
  assert.equal(antwort.children.length, 0, "die Antwort darf keine Schritte enthalten — der Markdown-Renderer wuerde sie fressen");
  assert.equal(log.children.length, 2);
  assert.equal(log.children[0].dataset.smejjSchritte, "true", "die Liste steht VOR der Antwort");
  assert.equal(log.children[1], antwort);
});

test("laeuft und fertig sind DIESELBE Zeile, nicht zwei", () => {
  const { log, antwort } = buehne();
  const schritt = { art: "suche", text: "office san jose", markt: "us" };
  zeigeSchritt(antwort, { ...schritt, zustand: "laeuft" });
  zeigeSchritt(antwort, { ...schritt, zustand: "fertig", treffer: 8 });
  const liste = log.children[0];
  assert.equal(liste.children.length, 1, "ein Schritt ist eine Zeile");
  const zeile = liste.children[0];
  assert.equal(zeile.dataset.zustand, "fertig");
  assert.equal(zeile.children.filter((k) => k.dataset.stand === "true").length, 1, "nur EIN Stand-Anhang");
  assert.match(zeile.children[0].textContent, /8 Treffer/);
});

test("zwei verschiedene Schritte ergeben zwei Zeilen", () => {
  const { log, antwort } = buehne();
  zeigeSchritt(antwort, { art: "suche", text: "eins", zustand: "laeuft" });
  zeigeSchritt(antwort, { art: "suche", text: "zwei", zustand: "laeuft" });
  zeigeSchritt(antwort, { art: "seite", text: "https://x.example/", zustand: "laeuft" });
  assert.equal(log.children[0].children.length, 3);
});

test("null Treffer wird ehrlich benannt", () => {
  const { log, antwort } = buehne();
  zeigeSchritt(antwort, { art: "suche", text: "xyz", zustand: "fertig", treffer: 0 });
  assert.match(log.children[0].children[0].children[0].textContent, /nichts gefunden/);
});

test("Modelltext landet als Text, nie als Markup", () => {
  const { log, antwort } = buehne();
  zeigeSchritt(antwort, { art: "suche", text: "<img src=x onerror=alert(1)>", zustand: "laeuft" });
  const zeile = log.children[0].children[0];
  assert.ok(zeile.textContent.includes("<img"), "der Text bleibt Text");
  assert.equal(zeile.innerHTML, undefined, "es wird nie innerHTML gesetzt");
});

test("ohne Elternknoten passiert nichts (fail-safe)", () => {
  globalThis.document = { createElement: (tag) => knoten(tag) };
  const einzeln = knoten("article");
  assert.doesNotThrow(() => zeigeSchritt(einzeln, { art: "suche", text: "x", zustand: "laeuft" }));
  assert.doesNotThrow(() => zeigeSchritt(null, { art: "suche", text: "x", zustand: "laeuft" }));
  assert.doesNotThrow(() => zeigeSchritt(einzeln, null));
});
