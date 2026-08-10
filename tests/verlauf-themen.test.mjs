// Themen-Zuordnung der Verlauf-Ansicht.
//
// Warum als Test und nicht nur von Hand geprueft: Die Zuordnung besteht aus
// vierzehn regulaeren Ausdruecken, die in FESTER REIHENFOLGE geprueft werden —
// der erste Treffer gewinnt. Ein neues Wort in einem frueheren Muster kann
// deshalb ein spaeteres Thema stillegen, ohne dass irgendwo ein Fehler
// auftaucht: die Chats landen einfach unter der falschen Ueberschrift.
// Genau das war vor dem 2026-08-09 der Fall (43 % richtig).
//
// Der Test liest die Tabelle aus der ECHTEN Datei und baut die Muster mit
// `new RegExp` nach — kein eval, und keine Kopie der Tabelle, die auseinander-
// laufen koennte.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Seit 2026-08-10 wohnen THEMEN, NUR_BILD und die Textaufbereitung in
// chat-history-text.js (aus der Ansicht ausgelagert, 800-Zeilen-Regel).
const QUELLE = readFileSync(new URL("../public/chat-history-text.js", import.meta.url), "utf8");

function ladeThemen() {
  const block = QUELLE.match(/const THEMEN = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
  assert.ok(block, "THEMEN-Tabelle nicht gefunden — wurde sie umbenannt?");
  const themen = [];
  for (const zeile of block[1].split("\n")) {
    const t = zeile.match(/^\s*\["([^"]+)",\s*\/(.*)\/([a-z]*)\],?\s*$/);
    if (t) themen.push([t[1], new RegExp(t[2], t[3])]);
  }
  assert.ok(themen.length >= 12, `nur ${themen.length} Themen gelesen`);
  return themen;
}

function nurBild() {
  const m = QUELLE.match(/const NUR_BILD = \/(.*)\/([a-z]*);/);
  assert.ok(m, "NUR_BILD nicht gefunden");
  return new RegExp(m[1], m[2]);
}

// Nachbau von themaVon() aus der Ansicht — inklusive ohneBallast, weil ein
// Dateipfad im Text sonst als Bild-Treffer durchginge.
function themaVon(frage, themen, bild) {
  const roh = ` ${frage}`.slice(0, 400);
  const probe = roh
    .replace(/^\[Anhang:[^\]]*\]\s*/i, "")
    .replace(/@"[^"]*"/g, " ")
    .replace(/@\/[^\s"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [name, muster] of themen) {
    if (muster.test(probe)) return name;
  }
  return bild.test(roh) ? "Bilder" : "Allgemein";
}

const FAELLE = [
  ["Suche mir einen leisen Standventilator unter 80 Euro zum Kaufen", "Einkauf"],
  ["Wo bestelle ich guenstig Druckerpatronen fuer den Brother?", "Einkauf"],
  ["Was kostet ein gebrauchtes MacBook Air M2 ungefaehr?", "Einkauf"],
  ["Welche Bank fuer meine iMild LLC in Kalifornien?", "Finanzen"],
  ["Wie hoch ist meine Monatsrate bei 24000 Euro auf 60 Monate?", "Finanzen"],
  ["Muss ich als Einzelunternehmer Umsatzsteuer ausweisen?", "Finanzen"],
  ["Erstelle ein Bash-Skript, das alte Log-Dateien nach 30 Tagen loescht", "Technik"],
  ["Warum ist mein Docker-Abbild 400 MB gross?", "Technik"],
  ["Schreibe eine ESM-Funktion parseBudget, die Eurobetraege aus Freitext liest", "Technik"],
  ["Mein git push wird abgelehnt, was bedeutet non-fast-forward?", "Technik"],
  ["Wie zentriere ich ein div mit CSS Grid?", "Technik"],
  ["Der Service Worker liefert eine alte Datei aus", "Technik"],
  ["Wie richte ich einen Cronjob unter macOS ein?", "Technik"],
  ["Fasse mir die Datenschutzgrundverordnung fuer einen Einzelunternehmer zusammen", "Recht"],
  ["Brauche ich ein Impressum fuer meine Webseite?", "Recht"],
  ["Wie formuliere ich eine Widerrufsbelehrung fuer meinen Shop?", "Recht"],
  ["Ist eine Einwilligung nach DSGVO auch per Haken gueltig?", "Recht"],
  ["Plane mir drei Tage Lissabon im Oktober", "Reise"],
  ["Brauche ich ein Visum fuer die USA als Deutscher?", "Reise"],
  ["Welcher Flug von Muenchen nach Porto ist am guenstigsten?", "Reise"],
  ["Welches Hotel in Rom liegt zentral und ist ruhig?", "Reise"],
  ["Was hilft gegen Nackenverspannung am Schreibtisch?", "Gesundheit"],
  ["Wie viel Schlaf braucht ein Erwachsener wirklich?", "Gesundheit"],
  ["Wie formuliere ich eine hoefliche Absage an einen Bewerber?", "Texte"],
  ["Uebersetze diesen Absatz ins Englische", "Texte"],
  ["Schreibe eine Schlagzeile fuer den Newsletter", "Texte"],
  ["Was ist 7 mal 8?", "Rechnen"],
  ["Wie viel ist 15 Prozent von 3400?", "Rechnen"],
  ["Was ist die Hauptstadt von Australien?", "Wissen"],
  ["Wann wurde die Berliner Mauer gebaut?", "Wissen"],
  ["Geh in den Browser und teste, ob meine Startseite auf dem Handy sauber umbricht", "Websites"],
  ["Pruefe die Seite smejj.com auf tote Links", "Websites"],
  ["Was kostet der Quadratmeter Miete in Leipzig?", "Immobilien"],
  ["Wie wird das Wetter am Wochenende in Hamburg?", "Wetter"],
  ["Recherchiere die groessten KI-Anbieter in Europa", "Recherche"],
];

// Faelle, die absichtlich ein Wort aus einem FRUEHEREN Thema enthalten. Sie
// sind der eigentliche Wert dieses Tests: sie fallen um, sobald jemand ein
// Muster verbreitert.
const FALLEN = [
  ["Erstelle separate Dateien fuer jede Ansicht", "Technik"],
  ["Was kostet ein Kredit ueber 10000 Euro?", "Finanzen"],
  ["Die Temperatur im Serverraum steigt auf 40 Grad", "Technik"],
  ["Schreibe mir ein Python-Skript fuer die Auswertung", "Technik"],
  ["Wie kuendige ich meinen Handyvertrag fristgerecht?", "Recht"],
  ["Der Vertrag mit dem Makler laeuft drei Jahre", "Recht"],
  ["Ich suche eine Wohnung mit drei Zimmern in Leipzig", "Immobilien"],
  ["Uebersetze die AGB ins Englische", "Recht"],
  ["Wie viel Miete kann ich mir bei 3000 Euro netto leisten?", "Immobilien"],
  ["Buche mir einen Arzttermin naechste Woche", "Gesundheit"],
  ["Plane die Datenbank-Migration in drei Tagen", "Technik"],
  ["Suche mir die guenstigste Bank fuer ein Geschaeftskonto", "Finanzen"],
];

test("jede Beispielanfrage landet im richtigen Thema", () => {
  const themen = ladeThemen();
  const bild = nurBild();
  const daneben = FAELLE
    .map(([frage, soll]) => ({ frage, soll, ist: themaVon(frage, themen, bild) }))
    .filter((z) => z.ist !== z.soll);
  assert.deepEqual(daneben, [], `falsch zugeordnet:\n${daneben.map((z) => `  ${z.soll} -> ${z.ist}: ${z.frage}`).join("\n")}`);
});

test("ein breites Muster darf kein spaeteres Thema verschlucken", () => {
  const themen = ladeThemen();
  const bild = nurBild();
  const daneben = FALLEN
    .map(([frage, soll]) => ({ frage, soll, ist: themaVon(frage, themen, bild) }))
    .filter((z) => z.ist !== z.soll);
  assert.deepEqual(daneben, [], `Muster greift zu weit:\n${daneben.map((z) => `  ${z.soll} -> ${z.ist}: ${z.frage}`).join("\n")}`);
});

test("zusammengesetzte Woerter werden erkannt (die Wortgrenzen-Falle)", () => {
  const themen = ladeThemen();
  const bild = nurBild();
  // Vier Muster hatten ein fuehrendes \b, das genau die haeufigste Schreibweise
  // aussperrte: Monatsrate, Handyvertrag, Arzttermin, Serverraum.
  for (const [frage, soll] of [
    ["Wie hoch ist die Monatsrate?", "Finanzen"],
    ["Handyvertrag kuendigen", "Recht"],
    ["Arzttermin verschieben", "Gesundheit"],
    ["Serverraum zu warm", "Technik"],
  ]) {
    assert.equal(themaVon(frage, themen, bild), soll, `"${frage}" sollte ${soll} sein`);
  }
});

test("Umschriften ohne Umlaut treffen genauso (ue statt ü)", () => {
  const themen = ladeThemen();
  const bild = nurBild();
  for (const [frage, soll] of [
    ["Uebersetze das bitte", "Texte"],
    ["Pruefe die Seite auf Fehler", "Websites"],
    ["Wo gibt es das guenstiger?", "Einkauf"],
    ["Wie kuendige ich?", "Recht"],
  ]) {
    assert.equal(themaVon(frage, themen, bild), soll, `"${frage}" sollte ${soll} sein`);
  }
  // Gegenprobe: [üu] haette "ue" NICHT getroffen — dieses Muster darf nicht
  // zurueckkehren.
  assert.ok(!/\[(ü|u)+u?\]bersetz/.test(QUELLE), "uebersetzen haengt wieder an [üu] statt (ü|ue)");
});

test("ein Anhang ist ein Transportweg, kein Thema", () => {
  const themen = ladeThemen();
  const bild = nurBild();
  assert.equal(
    themaVon('[Anhang: IMG_4911.jpeg] @/Users/alanbest/Downloads/IMG_4911.HEIC Geh chrome Browser Bank of America', themen, bild),
    "Finanzen",
    "der Bildanhang hat den Inhalt ueberstimmt");
  assert.equal(themaVon("[Anhang: screenshot.png] Was siehst du hier?", themen, bild), "Bilder");
});

test("Finanzen steht zweimal in der Tabelle — vor und nach Einkauf", () => {
  const themen = ladeThemen();
  const namen = themen.map(([name]) => name);
  const ersteFinanzen = namen.indexOf("Finanzen");
  const einkauf = namen.indexOf("Einkauf");
  const zweiteFinanzen = namen.lastIndexOf("Finanzen");
  assert.ok(ersteFinanzen >= 0 && einkauf >= 0, "Finanzen oder Einkauf fehlt");
  assert.ok(ersteFinanzen < einkauf, "die starken Geldwoerter muessen VOR Einkauf stehen");
  assert.ok(zweiteFinanzen > einkauf, "die breiten Geldwoerter muessen NACH Einkauf stehen");
});
