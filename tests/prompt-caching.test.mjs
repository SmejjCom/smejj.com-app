// Waechter fuer die Cache-Tauglichkeit der Anfragen.
//
// Anbieter geben 90 bis 98 % Rabatt auf den laengsten uebereinstimmenden ANFANG
// einer Anfrage. Zwei Dinge zerstoerten ihn bis 2026-08-18 zuverlaessig:
//   1. Ein wechselnder Wissensblock stand ganz VORN — damit war jede Anfrage ab
//      dem ersten Byte neu.
//   2. Der Verlauf wurde als GLEITENDES Fenster gekuerzt: jede Runde fiel die
//      aelteste Nachricht weg, jede Runde begann die Anfrage anders.
//
// Diese Tests messen die Eigenschaft, auf die es ankommt — "der Anfang bleibt
// ueber mehrere Runden Byte fuer Byte gleich" — und nicht die Umsetzung.
// Jede Zusage hat ein Gegenstueck: ein Test, der zeigt, dass NICHT einfach
// alles eingefroren wurde.
import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_MAX_MESSAGES,
  HISTORY_MAX_TOTAL_CHARS,
  HISTORY_TRIM_BLOCK,
  buildChatMessages,
  sanitizeHistory
} from "../src/agent/conversationHistory.js";
import { vorLetzterNutzerNachricht, withRagBlock } from "../public/chat-bridge-rag.js";

process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const bruecke = await import("../public/chat-bridge.js");

/** Der Teil, den ein Anbieter cachen kann: alles vor der aktuellen Frage. */
function anfang(messages) {
  return JSON.stringify(messages.slice(0, -1));
}

/** Baut einen Gespraechsverlauf mit `runden` Frage-Antwort-Paaren. */
function verlauf(runden, laenge = 300) {
  const messages = [];
  for (let index = 0; index < runden; index += 1) {
    messages.push({ role: "user", content: `Frage ${index} ${"f".repeat(laenge)}` });
    messages.push({ role: "assistant", content: `Antwort ${index} ${"a".repeat(laenge)}` });
  }
  return messages;
}

/**
 * Zaehlt, wie oft sich der Anfang ueber eine Reihe wachsender Verlaeufe
 * AENDERT. Genau diese Zahl ist die Cache-Fehlschlagquote: jede Aenderung
 * kostet eine Anfrage zum vollen Preis, jede Wiederholung liest aus dem Cache.
 */
function anfangsWechsel(kuerzen, laengen, lang) {
  let wechsel = 0;
  let letzter = null;
  for (const laenge of laengen) {
    const jetzt = JSON.stringify(kuerzen(lang.slice(0, laenge))[0] || null);
    if (letzter !== null && jetzt !== letzter) wechsel += 1;
    letzter = jetzt;
  }
  return wechsel;
}

// So kuerzte der Server bis zum 2026-08-18: gleitend, Nachricht fuer Nachricht.
function gleitendKuerzen(nachrichten) {
  return nachrichten.slice(-HISTORY_MAX_MESSAGES);
}

test("der Anfang wandert nur noch bruchteilhaft so oft wie vorher", () => {
  const lang = verlauf(24);
  // 20 aufeinanderfolgende Runden, alle weit ueber der Kuerzungsgrenze.
  const laengen = Array.from({ length: 20 }, (_, index) => lang.length - 20 + index);

  const neu = anfangsWechsel(sanitizeHistory, laengen, lang);
  const alt = anfangsWechsel(gleitendKuerzen, laengen, lang);

  assert.ok(alt >= 15, `das gleitende Fenster muss fast jede Runde wechseln, war ${alt}`);
  assert.ok(
    neu <= Math.ceil(laengen.length / HISTORY_TRIM_BLOCK) + 1,
    `zu viele Wechsel: ${neu} bei Blockgroesse ${HISTORY_TRIM_BLOCK}`
  );
  assert.ok(neu * 2 < alt, `die Kuerzung muss den Anfang deutlich seltener bewegen: neu ${neu}, alt ${alt}`);
});

test("Gegenstueck: nach einem ganzen Block wandert die Schnittstelle sehr wohl", () => {
  // Sonst waere der Test oben auch dann gruen, wenn wir den Verlauf einfach
  // eingefroren haetten — und alte Nachrichten nie mehr verschwaenden.
  const kurz = sanitizeHistory(verlauf(6));
  const lang = sanitizeHistory(verlauf(20));
  assert.notEqual(JSON.stringify(kurz[0]), JSON.stringify(lang[0]));
});

test("die Obergrenzen gelten unveraendert weiter", () => {
  for (const runden of [1, 5, 12, 40]) {
    const gekuerzt = sanitizeHistory(verlauf(runden));
    assert.ok(gekuerzt.length <= HISTORY_MAX_MESSAGES, `zu viele Nachrichten bei ${runden} Runden`);
    const zeichen = gekuerzt.reduce((summe, eintrag) => summe + eintrag.content.length, 0);
    assert.ok(zeichen <= HISTORY_MAX_TOTAL_CHARS, `zu viele Zeichen bei ${runden} Runden`);
  }
});

test("eine einzelne riesige Nachricht sprengt das Budget nicht", () => {
  const gekuerzt = sanitizeHistory([
    { role: "user", content: "x".repeat(50_000) },
    { role: "assistant", content: "y".repeat(50_000) },
    { role: "user", content: "kurz" }
  ]);
  const zeichen = gekuerzt.reduce((summe, eintrag) => summe + eintrag.content.length, 0);
  assert.ok(zeichen <= HISTORY_MAX_TOTAL_CHARS);
});

test("der Verlauf beginnt weiterhin mit einer Frage, nie mit einer Antwort", () => {
  for (const runden of [3, 7, 15, 31]) {
    const gekuerzt = sanitizeHistory(verlauf(runden));
    if (gekuerzt.length > 0) assert.equal(gekuerzt[0].role, "user", `Bruch bei ${runden} Runden`);
  }
});

test("der wechselnde Wissensblock steht vor der letzten Frage, nicht davor", () => {
  const messages = [
    { role: "system", content: "Systemregeln" },
    { role: "user", content: "erste Frage" },
    { role: "assistant", content: "erste Antwort" },
    { role: "user", content: "aktuelle Frage" }
  ];
  const mitBlock = withRagBlock(messages, "PROJEKTWISSEN", vorLetzterNutzerNachricht(messages));
  assert.equal(mitBlock[0].content, "Systemregeln", "die Systemregeln muessen der Anfang bleiben");
  assert.equal(mitBlock[mitBlock.length - 1].content, "aktuelle Frage", "die Anweisung gilt zuletzt");
  assert.equal(mitBlock[mitBlock.length - 2].content, "PROJEKTWISSEN", "der Block steht direkt davor");
});

test("zwei Fragen mit VERSCHIEDENEM Wissensblock teilen denselben Anfang", () => {
  const basis = [
    { role: "system", content: "Systemregeln" },
    { role: "user", content: "erste Frage" },
    { role: "assistant", content: "erste Antwort" }
  ];
  const eins = [...basis, { role: "user", content: "Frage A" }];
  const zwei = [...basis, { role: "user", content: "Frage B" }];
  const a = withRagBlock(eins, "WISSEN ZU A", vorLetzterNutzerNachricht(eins));
  const b = withRagBlock(zwei, "WISSEN ZU B", vorLetzterNutzerNachricht(zwei));
  // Alles bis zum Wissensblock ist identisch — genau das kann der Anbieter cachen.
  assert.equal(JSON.stringify(a.slice(0, 3)), JSON.stringify(b.slice(0, 3)));
});

test("Gegenstueck: an der alten Stelle 0 waere schon das erste Byte verschieden", () => {
  const messages = [
    { role: "system", content: "Systemregeln" },
    { role: "user", content: "Frage" }
  ];
  const alt = withRagBlock(messages, "WISSEN ZU A", 0);
  const altAnders = withRagBlock(messages, "WISSEN ZU B", 0);
  assert.notEqual(alt[0].content, altAnders[0].content, "genau das war der Fehler");
  assert.equal(alt[0].content, "WISSEN ZU A");
});

test("ohne Nutzernachricht landet der Block am Ende statt irgendwo", () => {
  const nurSystem = [{ role: "system", content: "Systemregeln" }];
  assert.equal(vorLetzterNutzerNachricht(nurSystem), 1);
  assert.equal(vorLetzterNutzerNachricht([]), 0);
  assert.equal(vorLetzterNutzerNachricht(null), 0);
});

test("die Bruecke kuerzt ebenfalls in Bloecken und behaelt ihre Schutzzeile", () => {
  const lang = verlauf(24);
  const laengen = Array.from({ length: 20 }, (_, index) => lang.length - 20 + index);

  // Nach der Schutzzeile beginnt der cachebare Teil — dort wird gemessen.
  const neu = anfangsWechsel((teil) => bruecke.hardenMessages(teil).slice(1), laengen, lang);
  const alt = anfangsWechsel((teil) => teil.slice(-12), laengen, lang);

  assert.ok(alt >= 15, `das alte slice(-12) muss fast jede Runde wechseln, war ${alt}`);
  assert.ok(neu * 2 < alt, `die Bruecke muss den Anfang seltener bewegen: neu ${neu}, alt ${alt}`);

  const gehaertet = bruecke.hardenMessages(lang);
  assert.equal(gehaertet[0].role, "system", "die Schutzzeile muss zuerst stehen");
  assert.ok(gehaertet[0].content.includes("smejj.com"));
});

test("die Bruecke wirft weiterhin Unsinn weg und deckelt die Laenge", () => {
  const gehaertet = bruecke.hardenMessages([
    null,
    { role: "user" },
    { role: "user", content: "gueltig" },
    ...verlauf(20)
  ]);
  assert.ok(gehaertet.every((eintrag) => typeof eintrag.content === "string"));
  assert.ok(gehaertet.length <= 13, "Schutzzeile plus hoechstens zwoelf Nachrichten");
});

test("buildChatMessages behaelt die Reihenfolge System, Verlauf, Frage", () => {
  const messages = buildChatMessages({
    systemContent: "Regeln",
    history: verlauf(3),
    userContent: "aktuelle Frage"
  });
  assert.equal(messages[0].role, "system");
  assert.equal(messages[messages.length - 1].content, "aktuelle Frage");
  assert.ok(anfang(messages).includes("Regeln"));
});
