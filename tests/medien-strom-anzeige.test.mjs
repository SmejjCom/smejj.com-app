// smejj.com — Waechter fuer die Anzeige waehrend einer Bild-/Video-Uebertragung.
//
// LIVE GEMESSEN 2026-09-05 mit dem echten Auftrag "Generiere ein Bild von: ein
// roter Apfel auf einem Holztisch": Bis das fertige Bild erschien, vergingen
// 5 Minuten 45 Sekunden — und die ganze Zeit wuchs in der Blase eine Wand aus
// base64-Zeichen, gemessen 600.000 Zeichen. Der Nutzer sieht Zeichensalat statt
// eines Hinweises; genau das meinte der Betreiber mit "zeigt der so komisch".
//
// Der Text selbst ist richtig und wird gebraucht: renderChatMarkdown baut daraus
// am Ende das <img>. Er darf also NICHT geloescht werden. Versteckt wird nur die
// ANZEIGE — chat-stream.js setzt die Klasse, das Stylesheet blendet aus.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markiereMedienStrom } from "../public/ai/chat-stream.js";

// Minimaler Knoten: nur was die Funktion anfasst.
function knoten(text) {
  const klassen = new Set();
  return {
    textContent: text,
    dataset: {},
    classList: {
      toggle(name, an) { if (an) klassen.add(name); else klassen.delete(name); },
      contains: (name) => klassen.has(name)
    },
    hatMarke: () => klassen.has("medien-strom")
  };
}

const OFFEN = "Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/png;base64,iVBORw0KGgoAAAA";
const FERTIG = `${OFFEN})`;

test("waehrend der Uebertragung wird die Marke gesetzt", () => {
  const n = knoten(OFFEN);
  assert.equal(markiereMedienStrom(n), true);
  assert.equal(n.hatMarke(), true);
  assert.equal(n.dataset.medienArt, "Bild");
});

test("ist der Datenblock geschlossen, faellt die Marke sofort", () => {
  // Sonst bliebe die FERTIGE Antwort unsichtbar — der schlimmere Fehler.
  const n = knoten(FERTIG);
  assert.equal(markiereMedienStrom(n), false);
  assert.equal(n.hatMarke(), false);
  assert.equal(n.dataset.medienArt, undefined);
});

test("Video wird als Video benannt", () => {
  const n = knoten("![Clip](data:video/mp4;base64,AAAA");
  assert.equal(markiereMedienStrom(n), true);
  assert.equal(n.dataset.medienArt, "Video");
});

test("normaler Text bleibt unberuehrt", () => {
  const n = knoten("Ein ganz gewoehnlicher Satz ohne Medien.");
  assert.equal(markiereMedienStrom(n), false);
  assert.equal(n.hatMarke(), false);
});

test("der Text selbst wird NIE veraendert", () => {
  // Die Rohquelle muss stehen bleiben: renderChatMarkdown baut daraus das Bild.
  const n = knoten(OFFEN);
  markiereMedienStrom(n);
  assert.equal(n.textContent, OFFEN);
});

test("das Stylesheet blendet den Rohtext aus und zeigt einen Satz", () => {
  const css = readFileSync("public/mobil-composer.css", "utf8");
  assert.match(css, /\.entry\.assistant\.medien-strom\s*\{[^}]*font-size:\s*0/, "der Rohtext muss unsichtbar werden");
  assert.match(css, /medien-strom::after[^}]*content:\s*attr\(data-medien-art\)/, "der Hinweis muss die Art nennen");
});

test("der Stream setzt die Marke und loescht sie am Ende wieder", () => {
  const quelle = readFileSync("public/ai/chat-stream.js", "utf8");
  // Die entscheidende Stelle ist der laufende Strom: dort waechst die Wand.
  // Ohne diesen Aufruf wuerde die Marke erst am Ende gesetzt — zu spaet.
  assert.match(
    quelle,
    /output\.textContent \+= delta\.content;\s*\n\s*markiereMedienStrom\(output\);/,
    "direkt nach dem Anhaengen im Strom muss markiert werden"
  );
  const stellen = (quelle.match(/markiereMedienStrom\(output\)/g) || []).length;
  assert.ok(stellen >= 5, `erwartet mindestens 5 Aufrufe (Strom, Abriss, Stille, Ende), gefunden ${stellen}`);
  // Nach dem letzten Saeubern MUSS die Marke fallen, sonst bleibt die Antwort weg.
  const endBlock = quelle.split("entferneAbgerisseneMedien(output.textContent);").pop();
  assert.match(endBlock, /markiereMedienStrom\(output\)/, "am Ende muss die Marke fallen");
});
