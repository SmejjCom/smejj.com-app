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
    getAttribute(name) { return Object.hasOwn(self.attribute, name) ? self.attribute[name] : null; },
    remove() {
      const eltern = self.parentElement;
      if (!eltern) return;
      const i = eltern.children.indexOf(self);
      if (i >= 0) eltern.children.splice(i, 1);
      self.parentElement = null;
    },
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

const { zeigeSchritt, starteWartesignal } = await import("../public/ai/chat-stream.js");

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

// --- Bruecke: Arbeitsschritte muessen durch -------------------------------
// Befund 2026-08-04: Der Control Server sendete die Schritte, live kamen sie
// trotzdem nicht an. Ursache: pipeVisibleStream baut JEDEN Event neu und behaelt
// nur choices[0].delta.content — alles andere fiel weg.

// Ohne diese Umgebungsvariable startet der Import einen echten HTTP-Server
// und der Testlauf haengt (dieselbe Zeile steht in tests/chat-bridge.test.mjs).
// Direkt aus dem Strom-Modul: chat-bridge.js darf keine Re-Export-Liste tragen
// (der Buendler fuer Zeabur lehnt sie ab — sie verstecken die Namensherkunft).
const { schrittDurchreichen, pipeVisibleStream } = await import("../public/chat-bridge-strom.js");

test("die Bruecke erkennt einen Arbeitsschritt und nur diesen", () => {
  const gut = schrittDurchreichen(JSON.stringify({ smejj_schritt: { art: "suche", text: "x", markt: "us", zustand: "laeuft" } }));
  assert.deepEqual(gut, { art: "suche", zustand: "laeuft", text: "x", markt: "us" });
  assert.equal(schrittDurchreichen(JSON.stringify({ choices: [{ delta: { content: "Text" } }] })), null);
  assert.equal(schrittDurchreichen("kein json"), null);
  assert.equal(schrittDurchreichen(JSON.stringify({ smejj_schritt: "kein objekt" })), null);
  assert.equal(schrittDurchreichen(JSON.stringify({ smejj_schritt: { text: "ohne art" } })), null);
});

test("die Bruecke reicht NUR geprueftes weiter, nie fremde Nutzlast", () => {
  const geschmuggelt = schrittDurchreichen(JSON.stringify({
    smejj_schritt: { art: "suche", zustand: "fertig", text: "y", markt: "de", treffer: 5, boeses: "<script>", tief: { a: 1 } }
  }));
  assert.deepEqual(geschmuggelt, { art: "suche", zustand: "fertig", text: "y", markt: "de", treffer: 5 });
  assert.equal("boeses" in geschmuggelt, false);
  assert.equal("tief" in geschmuggelt, false);
});

test("Laengen und Zahlen werden begrenzt", () => {
  const lang = schrittDurchreichen(JSON.stringify({
    smejj_schritt: { art: "suche", zustand: "laeuft", text: "z".repeat(500), markt: "m".repeat(50), treffer: 99999 }
  }));
  assert.equal(lang.text.length, 200);
  assert.equal(lang.markt.length, 8);
  const viele = schrittDurchreichen(JSON.stringify({ smejj_schritt: { art: "suche", zustand: "fertig", treffer: 99999 } }));
  assert.equal(viele.treffer, 999);
});

test("im Strom kommen Schritt UND Antworttext an", async () => {
  const gesendet = [];
  const res = { write: (t) => gesendet.push(t) };
  const encoder = new TextEncoder();
  const quelle = {
    async *[Symbol.asyncIterator]() {
      yield encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Ich suche." } }] })}\n\n`);
      yield encoder.encode(`data: ${JSON.stringify({ smejj_schritt: { art: "suche", text: "berlin", markt: "de", zustand: "laeuft" } })}\n\n`);
      yield encoder.encode(`data: ${JSON.stringify({ smejj_schritt: { art: "suche", text: "berlin", zustand: "fertig", treffer: 8 } })}\n\n`);
      yield encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hier ist die Antwort." } }] })}\n\n`);
    }
  };
  await pipeVisibleStream(quelle, res);
  const alles = gesendet.join("");
  assert.match(alles, /Ich suche\./);
  assert.match(alles, /Hier ist die Antwort\./);
  assert.equal((alles.match(/smejj_schritt/g) || []).length, 2, "beide Schritte muessen durchkommen");
  // Reihenfolge bleibt erhalten: erst Text, dann laeuft, dann fertig, dann Text.
  assert.ok(alles.indexOf("Ich suche") < alles.indexOf("laeuft"));
  assert.ok(alles.indexOf("laeuft") < alles.indexOf("fertig"));
  assert.ok(alles.indexOf("fertig") < alles.indexOf("Hier ist die Antwort"));
});

// --- Das erste Lebenszeichen -------------------------------------------------
//
// GEMESSEN 2026-08-05 an einer echten Werkzeug-Frage: der erste Server-Schritt
// kam nach 5750 ms, der erste Antworttext nach 19 061 ms. Davor sah der Nutzer
// 5,75 s lang nur "smejj denkt nach ..." — der vom Betreiber gemeldete blinde
// Fleck. Diese Tests halten fest, dass das Signal kommt, wieder verschwindet
// und bei schnellen Antworten gar nicht erst erscheint.
//
// Die Zeitgeber werden eingespeist: ein Test, der echte Sekunden abwartet, ist
// langsam UND unzuverlaessig.

function zeitgeber() {
  const wecker = new Map();
  const takte = new Map();
  let naechste = 1;
  let uhr = 0;
  return {
    uhr: () => uhr,
    vorspulen(ms) { uhr += ms; },
    ausloesen() { for (const fn of [...wecker.values()]) fn(); },
    ticken() { for (const fn of [...takte.values()]) fn(); },
    offeneTakte: () => takte.size,
    deps: {
      verzoegern: (fn) => { const id = naechste++; wecker.set(id, fn); return id; },
      abbrechen: (id) => wecker.delete(id),
      takten: (fn) => { const id = naechste++; takte.set(id, fn); return id; },
      stoppen: (id) => takte.delete(id),
      jetzt: () => uhr,
      abMs: 1200
    }
  };
}

test("nach kurzer Stille erscheint ein Lebenszeichen in der Schrittliste", () => {
  const { log, antwort } = buehne();
  const z = zeitgeber();
  starteWartesignal(antwort, z.deps);
  assert.equal(log.children.length, 1, "vor Ablauf der Stille darf nichts erscheinen");

  z.ausloesen();
  assert.equal(log.children.length, 2, "die Liste steht jetzt VOR der Antwort");
  const zeile = log.children[0].children[0];
  assert.match(zeile.textContent, /Anfrage laeuft/);
  assert.equal(zeile.dataset.zustand, "laeuft");
});

test("der Sekundenzaehler laeuft — bleibt aber fuer Screenreader stumm", () => {
  const { log, antwort } = buehne();
  const z = zeitgeber();
  starteWartesignal(antwort, z.deps);
  z.ausloesen();
  const zeile = log.children[0].children[0];
  const stand = zeile.children.find((k) => k.dataset.stand === "true");

  // Die Liste traegt aria-live "polite". Ein tickender Zaehler wuerde sonst
  // jede Sekunde vorgelesen — deshalb ist genau dieser Teil aria-hidden.
  assert.equal(stand.getAttribute("aria-hidden"), "true");

  z.vorspulen(3000);
  z.ticken();
  assert.match(stand.textContent, /3 s/);
});

test("das Signal verschwindet restlos, sobald der Server sich meldet", () => {
  const { log, antwort } = buehne();
  const z = zeitgeber();
  const stopp = starteWartesignal(antwort, z.deps);
  z.ausloesen();
  assert.equal(log.children[0].children.length, 1);

  stopp();
  assert.equal(log.children[0].children.length, 0, "die Wartezeile muss weg sein");
  assert.equal(z.offeneTakte(), 0, "der Sekundentakt darf nicht weiterlaufen");
});

test("eine schnelle Antwort sieht das Signal nie", () => {
  // Die Schnellspur antwortet in rund 850 ms. Wer sofort ein Wartesymbol zeigt,
  // blinkt bei jeder kurzen Frage unnoetig.
  const { log, antwort } = buehne();
  const z = zeitgeber();
  const stopp = starteWartesignal(antwort, z.deps);
  stopp();
  z.ausloesen();
  assert.equal(log.children.length, 1, "keine Schrittliste, keine Zeile");
});

test("zweimal stoppen ist harmlos", () => {
  const { antwort } = buehne();
  const z = zeitgeber();
  const stopp = starteWartesignal(antwort, z.deps);
  z.ausloesen();
  stopp();
  stopp();
});

test("ohne Antwort-Knoten passiert nichts", () => {
  const stopp = starteWartesignal(null);
  assert.equal(typeof stopp, "function");
  stopp();
});

// --- Nach der Arbeit: falten und ehrlich abschliessen ------------------------
//
// Betreiber-Befund 2026-08-13 an einer echten Buero-Suche (Castro Valley):
// achtzehn Schrittzeilen standen nach dem Ende offen im Verlauf, und die
// Antwort selbst war ein einziger Ankuendigungssatz — alle sechs Portale
// hatten "nichts gefunden" gemeldet. Zwei getrennte Zusagen:
//   5. Nach dem Ende ist das Protokoll EINE aufklappbare Zeile.
//   6. Liefert keine Quelle etwas, sagt die Antwort das — statt zu schweigen.

const { falteSchritte, quellenHinweis, QUELLEN_LEER_HINWEIS } = await import("../public/ai/chat-stream.js");

function fertigerLauf(antwort, schritte) {
  for (const s of schritte) {
    zeigeSchritt(antwort, { ...s, zustand: "laeuft" });
    zeigeSchritt(antwort, { ...s, zustand: "fertig" });
  }
}

test("nach dem Ende ist das Protokoll EINE aufklappbare Zeile", () => {
  const { log, antwort } = buehne();
  fertigerLauf(antwort, [
    { art: "suche", text: "office castro valley", treffer: 6 },
    { art: "suche", text: "office san lorenzo", treffer: 6 },
    { art: "seite", text: "https://www.loopnet.com/x", treffer: 0 }
  ]);
  const liste = log.children[0];
  assert.equal(liste.children.length, 3, "waehrend der Arbeit stehen alle Zeilen offen");

  falteSchritte(antwort, 1);
  assert.equal(liste.children.length, 1, "danach haengt nur noch der Falter drin");
  const falter = liste.children[0];
  assert.equal(falter.tagName, "details");
  assert.equal(falter.children[0].tagName, "summary", "die Zusammenfassung ist die erste Zeile");
  assert.equal(falter.children.length, 4, "summary + die drei Schrittzeilen");
  // Aufklappbar heisst: die Zeilen sind nicht weg, nur eingeklappt.
  assert.match(falter.children[1].textContent, /office castro valley/);
});

test("die zugeklappte Zeile sagt, was getan wurde", () => {
  const { log, antwort } = buehne();
  fertigerLauf(antwort, [
    { art: "suche", text: "eins", treffer: 6 },
    { art: "suche", text: "zwei", treffer: 6 },
    { art: "seite", text: "https://a.example/", treffer: 3 }
  ]);
  falteSchritte(antwort, 0);
  const titel = log.children[0].children[0].children[0].textContent;
  assert.match(titel, /2 Suchen/);
  assert.match(titel, /1 Seite gelesen/);
  assert.ok(!titel.includes("ohne Fund"), "es gab Funde — das darf nicht dranstehen");
});

test("ging alles leer aus, steht das SCHON in der zugeklappten Zeile", () => {
  // Sonst versteckt das Falten genau die Information, dass nichts gefunden wurde.
  const { log, antwort } = buehne();
  fertigerLauf(antwort, [{ art: "suche", text: "xyz", treffer: 0 }, { art: "seite", text: "https://b.example/", treffer: 0 }]);
  falteSchritte(antwort, 2);
  assert.match(log.children[0].children[0].children[0].textContent, /ohne Fund/);
});

test("falten ist mehrfach aufrufbar und ohne Schritte wirkungslos", () => {
  const { log, antwort } = buehne();
  fertigerLauf(antwort, [{ art: "suche", text: "eins", treffer: 1 }]);
  assert.ok(falteSchritte(antwort, 0));
  assert.equal(falteSchritte(antwort, 0), null, "zweimal falten legt keinen zweiten Falter an");
  assert.equal(log.children[0].children.length, 1);

  const leer = buehne();
  assert.equal(falteSchritte(leer.antwort, 0), null, "ohne Schrittliste passiert nichts");
  assert.equal(leer.log.children.length, 1, "und es entsteht auch keine");
});

test("das Wartesignal zaehlt nicht als Arbeitsschritt", () => {
  const { log, antwort } = buehne();
  const z = zeitgeber();
  starteWartesignal(antwort, z.deps);
  z.ausloesen();
  assert.equal(falteSchritte(antwort, 0), null, "eine reine Wartezeile ist nichts zum Falten");
  assert.equal(log.children[0].children.length, 1, "die Wartezeile bleibt unangetastet");
});

test("liefert keine Quelle etwas, bekommt die Antwort einen ehrlichen Schluss", () => {
  // Genau die Lage aus dem Screenshot: sechs Schritte, alle leer, und als
  // Antwort nur die Ankuendigung.
  const hinweis = quellenHinweis({
    gesamt: 6, ohneFund: 6,
    antwort: "Ich suche direkt nach konkreten Angeboten auf den gaengigen US-Plattformen."
  });
  assert.equal(hinweis, QUELLEN_LEER_HINWEIS);
  assert.match(hinweis, /Keine der abgefragten Quellen/);
  assert.match(hinweis, /sperren maschinelle Zugriffe/, "der Grund gehoert dazu, nicht nur die Absage");
});

test("ein einziger Fund genuegt — dann schweigt der Hinweis", () => {
  assert.equal(quellenHinweis({ gesamt: 6, ohneFund: 5, antwort: "Kurz." }), "");
  assert.equal(quellenHinweis({ gesamt: 0, ohneFund: 0, antwort: "" }), "", "ohne Werkzeuglauf gar nichts");
  assert.equal(quellenHinweis(), "");
});

test("eine ausfuehrliche Antwort wird nicht belehrt", () => {
  // Das Modell kann aus eigenem Wissen geantwortet haben, obwohl die Suche
  // leer ausging. Dann waere der Hinweis schlicht falsch.
  const lang = "A".repeat(401);
  assert.equal(quellenHinweis({ gesamt: 3, ohneFund: 3, antwort: lang }), "");
  assert.equal(quellenHinweis({ gesamt: 3, ohneFund: 3, antwort: "A".repeat(399) }), QUELLEN_LEER_HINWEIS);
});
