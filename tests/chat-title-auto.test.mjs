// Prueft die Titel-Bereinigung aus public/chat-title-auto.js.
//
// Warum ein eigener Test: Der Titel kommt aus einem Sprachmodell und landet
// unveraendert in der Oberflaeche. Auf "Antworte NUR mit dem Titel" kommt
// gemessen trotzdem Vorrede ("Hier ist ein passender Titel:"), Markdown,
// Anfuehrungszeichen oder gleich ein ganzer Absatz. Ohne harte Grenzen zerlegt
// so eine Antwort die Kartenliste.
//
// Das Modul selbst laesst sich in Node nicht importieren (es zieht config.js
// und chat-stream.js aus dem Browser). Der Test liest darum die Quelle und
// wertet genau den Bereinigungsblock aus — schlaegt fehl, sobald der Block
// verschwindet oder umbenannt wird.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const QUELLE = readFileSync(new URL("../public/chat-title-auto.js", import.meta.url), "utf8");

function ladeBereinige() {
  const start = QUELLE.indexOf("function istVorrede");
  const ende = QUELLE.indexOf("// Antwort der Bruecke");
  assert.ok(start > -1 && ende > start, "Bereinigungsblock in chat-title-auto.js nicht gefunden");
  const block = QUELLE.slice(start, ende);
  const fabrik = new Function(`
    const MAX_WOERTER = 6;
    const MAX_ZEICHEN = 60;
    ${block}
    return bereinige;
  `);
  return fabrik();
}

const bereinige = ladeBereinige();

test("die Grenzen halten, egal was das Modell schickt", () => {
  const eingaben = [
    "Bank of America Ueberweisung",
    "Eine sehr ausfuehrliche Zusammenfassung dieser Unterhaltung ueber Immobilienfinanzierung in Berlin",
    "Donaudampfschifffahrtsgesellschaftskapitaenswitwenrentenversicherungsanstalt",
    "Kurz\nZWEITE ZEILE\nDRITTE ZEILE",
    "",
    null,
    undefined
  ];
  for (const eingabe of eingaben) {
    const titel = bereinige(eingabe);
    assert.ok(titel.length <= 60, `zu lang: ${titel.length}`);
    assert.ok(titel.split(" ").filter(Boolean).length <= 6, `zu viele Woerter: ${titel}`);
    assert.ok(!titel.includes("\n"), "ein Titel darf nie mehrzeilig sein");
    assert.equal(typeof titel, "string");
  }
});

test("Markdown, Anfuehrungszeichen und Schlusspunkt fallen weg", () => {
  assert.equal(bereinige("**Buerosuche in Berlin**"), "Buerosuche in Berlin");
  assert.equal(bereinige("## Kontoeroeffnung bei der Bank"), "Kontoeroeffnung bei der Bank");
  assert.equal(bereinige("- Wetter morgen in Berlin"), "Wetter morgen in Berlin");
  assert.equal(bereinige('"Wetter in Silicon Valley"'), "Wetter in Silicon Valley");
  assert.equal(bereinige("“Immobilienfinanzierung Berlin”"), "Immobilienfinanzierung Berlin");
  assert.equal(bereinige("„Kontoeroeffnung pruefen“"), "Kontoeroeffnung pruefen");
  assert.equal(bereinige("Test von iMild Funktionen."), "Test von iMild Funktionen");
});

test("eine Vorrede ist kein Titel", () => {
  // Gemessenes Verhalten: das Modell schiebt gelegentlich eine Einleitung vor.
  assert.equal(bereinige("Hier ist ein passender Titel:\nBank of America Ueberweisung"), "Bank of America Ueberweisung");
  assert.equal(bereinige("Titel: Wetterabfrage Berlin"), "Wetterabfrage Berlin");
  // Steht NUR Vorrede da, gibt es keinen Titel — dann bleibt der Regel-Titel.
  assert.equal(bereinige("Hier ist der Titel:"), "");
  assert.equal(bereinige("Vorschlag:"), "");
});

test("spitze Klammern bleiben nicht im Titel stehen", () => {
  // Angezeigt wird ohnehin nur Text (textContent), das ist kein Ausfuehrungs-
  // risiko — aber ein Titel soll nicht wie kaputtes Markup aussehen.
  const titel = bereinige("<img src=x onerror=alert(1)>");
  assert.ok(!titel.includes("<") && !titel.includes(">"), titel);
});

test("das Modul bleibt fail-safe und ruecksichtsvoll", () => {
  // Diese Zusagen tragen den Betrieb: ohne sie wuerde ein Ansturm von Anfragen
  // das geteilte Kontingent der Bruecke aufbrauchen.
  assert.match(QUELLE, /const MIN_NACHRICHTEN = 4/, "Titel erst ab vier Nachrichten");
  assert.match(QUELLE, /const MAX_JE_RUNDE = \d+/, "Obergrenze je Runde fehlt");
  assert.match(QUELLE, /signal: abbruch\.signal/, "Anfrage ohne Zeitbudget");
  assert.match(QUELLE, /document\.hidden/, "im Hintergrund muss die Arbeit ruhen");
  assert.match(QUELLE, /chat\.titleEdited === true/, "von Hand vergebene Titel muessen geschuetzt sein");
});

test("Kennungen der Importe passen zu den uebrigen Modulen (Befund F-07)", () => {
  // Ein abweichender Spezifizierer erzeugt eine ZWEITE Modulinstanz.
  assert.match(QUELLE, /from "\/assets\/chat-store\.js\?v=pin-20260806"/);
  assert.match(QUELLE, /from "\/assets\/ai\/chat-stream\.js"/);
  assert.ok(!/chat-stream\.js\?/.test(QUELLE), "chat-stream.js wird ohne Kennung importiert");
});
