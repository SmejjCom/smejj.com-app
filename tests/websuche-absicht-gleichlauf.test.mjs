// smejj.com — Gleichlauf der beiden Such-Weichen.
//
// Warum es diesen Test gibt (Befund 2026-07-29): smejj.com entscheidet an ZWEI
// Stellen, ob live gesucht wird, und beide hatten eine eigene Wortliste:
//   1. public/chat-bridge.js   — entscheidet Schnellspur oder Control-Server.
//   2. src/search/searchIntent.js — entscheidet im Control-Server die Websuche.
// Die Listen sind auseinandergelaufen. Die Bridge kannte "nachricht", aber nicht
// "schlagzeil"; deshalb landete "kannst du Schlagzeile ueber Berlin schreiben"
// in der Schnellspur und bekam die Antwort "Ich habe keine Informationen".
//
// Ein Fix an nur einer Stelle haette den Fehler NICHT behoben. Dieser Test
// vergleicht beide Umsetzungen Fall fuer Fall und schlaegt fehl, sobald eine
// abweicht — die Kopie bleibt damit belegbar inhaltsgleich.
//
// Ausfuehren: node --test tests/websuche-absicht-gleichlauf.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { shouldSearchWeb as controlGate, normalizeForIntent as controlNorm } from "../src/search/searchIntent.js";

// Ohne dieses Flag startet der Import den Bridge-Server und der Test haengt.
process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const bridge = await import("../public/chat-bridge.js");
const bridgeGate = bridge.shouldSearchWeb;
const bridgeNorm = bridge.normalizeForIntent;

// Gemeinsame Pruefmenge: normale Nutzerfragen. Bewusst OHNE die beiden Faelle,
// in denen sich die Weichen absichtlich unterscheiden duerfen (siehe unten):
// nackte Domains und "bist du online" kennt nur die Bridge, Laengengrenze und
// Coding-Ausschluss nur der Control-Server.
const GEMEINSAME_FAELLE = [
  // Der Live-Befund selbst, Singular und Plural.
  "kannst du Schlagzeile ueber Berlin mir hier schreiben",
  "kannst du Schlagzeilen ueber Berlin mir hier schreiben",
  // Umlaute gegen transliterierte Schreibweise.
  "Was sind die Öffnungszeiten vom Zoo Berlin",
  "Was sind die Oeffnungszeiten vom Zoo Berlin",
  "Gibt es eine Verspätung bei der S-Bahn",
  "Störung bei der Deutschen Bahn?",
  // Weitere Aktualitaetsfragen.
  "Wetter heute in Berlin",
  "Aktuelle Nachrichten",
  "Bitcoin Preis",
  "Wer hat die Wahl 2026 gewonnen?",
  "Welche Version von Node ist aktuell?",
  "Neueste Meldung zum Streik",
  "Wie ist der Spielstand?",
  "Was kostet Strom gerade",
  "Was gibt es Neues in Muenchen?",
  "latest news about AI",
  // Ausdrueckliche Recherche.
  "Nenne mir bitte eine Quelle dafuer",
  "Suche mir ein gutes Restaurant",
  "Fasse mir das zusammen",
  // Statisches Allgemeinwissen — beide muessen nein sagen.
  "Was ist die Hauptstadt von Australien?",
  "Was ergibt sieben mal acht?",
  "Erklaere mir Photosynthese",
  "Wie funktioniert ein Kuehlschrank",
  "Hallo",
  "danke!",
  "ok",
  // Aehnliche Woerter duerfen keinen Fehltreffer erzeugen.
  "Ich war letztes Jahr in Neuseeland",
  "Er hat viel Verstand bewiesen"
];

test("beide Such-Weichen entscheiden bei denselben Fragen gleich", () => {
  const abweichungen = GEMEINSAME_FAELLE
    .map((frage) => ({ frage, bridge: bridgeGate(frage), control: controlGate(frage) }))
    .filter((zeile) => zeile.bridge !== zeile.control);
  assert.deepEqual(
    abweichungen,
    [],
    "Die Wortlisten sind auseinandergelaufen — genau so entstand der Befund vom 2026-07-29."
  );
});

test("die Regressionsfaelle des Befunds loesen in BEIDEN Weichen eine Suche aus", () => {
  for (const frage of [
    "kannst du Schlagzeile ueber Berlin mir hier schreiben",
    "kannst du Schlagzeile über Berlin mir hier schreiben",
    "Was sind die Öffnungszeiten vom Zoo Berlin",
    "Gibt es eine Verspätung bei der S-Bahn"
  ]) {
    assert.equal(bridgeGate(frage), true, `Bridge muesste suchen: ${frage}`);
    assert.equal(controlGate(frage), true, `Control-Server muesste suchen: ${frage}`);
  }
});

test("die Normalisierung ist auf beiden Seiten identisch", () => {
  for (const text of ["Öffnungszeiten Café Straße", "Verspätung ÜBER", "Grüße aus Köln", ""]) {
    assert.equal(bridgeNorm(text), controlNorm(text), `Normalisierung weicht ab bei: ${text}`);
  }
});

// Die erlaubten Unterschiede werden hier festgehalten, damit sie bewusst bleiben
// und nicht versehentlich zur naechsten Luecke werden.
test("die bewussten Unterschiede der beiden Weichen bleiben erhalten", () => {
  // Nur die Bridge kennt nackte Domains: sie muss verhindern, dass eine Adresse
  // in der werkzeuglosen Schnellspur landet und der Inhalt geraten wird.
  assert.equal(bridgeGate("Lies imild.com und nenne den Titel"), true);
  // Nur die Bridge faengt die Selbstauskunft ab (keine Suche noetig).
  assert.equal(bridgeGate("bist du online"), false);
  // Nur der Control-Server schliesst Coding-Aufgaben und ueberlange Eingaben aus.
  assert.equal(controlGate("Bitte einen unified diff erstellen"), false);
  assert.equal(controlGate("aktuell " + "x".repeat(500)), false);
  // Eine echte https-Adresse loest auf beiden Seiten aus.
  assert.equal(bridgeGate("Was steht auf https://smejj.com ?"), true);
  assert.equal(controlGate("Was steht auf https://smejj.com ?"), true);
});
