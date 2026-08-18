// Waechter fuer die Kontext-Diaet (src/agent/dateiKontext.js).
//
// Zwei Dinge koennen hier teuer schiefgehen, und beide haben ein Gegenstueck:
//   1. Das Budget greift nicht -> die Rechnung explodiert (bis 1,20 USD je
//      Anfrage, gerechnet aus der alten Obergrenze).
//   2. Das Budget greift ZU HART oder STILL -> das Modell antwortet
//      selbstsicher ueber Code, den es nie gesehen hat.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DATEIEN_GESAMT_ZEICHEN,
  baueDateibloecke,
  extrahiereSignaturen,
  kuerzeInhalt,
  verteileBudget
} from "../src/agent/dateiKontext.js";

const datei = (name, laenge, fuellung = "x") => ({ name, inhalt: fuellung.repeat(laenge) });

test("das Gesamtbudget haelt — auch bei acht grossen Dateien", () => {
  // Genau der Fall aus dem Befund: 8 x 120.000 Zeichen waren vorher erlaubt.
  const acht = Array.from({ length: 8 }, (_, i) => datei(`gross${i}.js`, 120_000));
  const { zeichen } = baueDateibloecke(acht);
  assert.ok(zeichen <= DATEIEN_GESAMT_ZEICHEN * 1.1, `Budget gerissen: ${zeichen}`);
  // Gegenstueck: das ist wirklich eine Groessenordnung weniger als vorher.
  assert.ok(zeichen < 960_000 / 10, "die Diaet muss deutlich wirken, nicht kosmetisch");
});

test("kleine Dateien geben ihren Rest an die grossen ab", () => {
  const budgets = verteileBudget([200, 200, 500_000], 60_000);
  assert.equal(budgets[0], 200, "eine kleine Datei bekommt genau, was sie braucht");
  assert.equal(budgets[1], 200);
  assert.ok(budgets[2] > 59_000, `die grosse Datei muss den Rest bekommen, war ${budgets[2]}`);
  assert.ok(budgets.reduce((a, b) => a + b, 0) <= 60_000);
});

test("passt alles ins Budget, wird gar nicht gekuerzt", () => {
  const klein = [datei("a.js", 100), datei("b.js", 200)];
  const { gekuerzt, weggelassen, bloecke } = baueDateibloecke(klein);
  assert.equal(gekuerzt, 0);
  assert.equal(weggelassen, 0);
  assert.ok(bloecke[0].includes("x".repeat(100)), "kleine Dateien bleiben unangetastet");
});

test("eine Kuerzung sagt IMMER, wieviel fehlt — nie still", () => {
  const { text, gekuerzt, weggelassen } = kuerzeInhalt("y".repeat(50_000), 5_000);
  assert.equal(gekuerzt, true);
  assert.ok(weggelassen > 40_000);
  assert.ok(/ausgelassen/.test(text), "die Marke muss im Text stehen, sonst raet das Modell");
  assert.ok(text.includes(String(weggelassen)), "die Zahl der fehlenden Zeichen gehoert in die Marke");
  assert.ok(/frage nach/i.test(text), "das Modell muss wissen, dass es nachfragen darf");
});

test("Kopf UND Fuss bleiben erhalten", () => {
  const inhalt = `ANFANG${"m".repeat(50_000)}ENDE`;
  const { text } = kuerzeInhalt(inhalt, 5_000);
  assert.ok(text.startsWith("ANFANG"), "der Kopf traegt Importe und Signaturen");
  assert.ok(text.endsWith("ENDE"), "der Fuss traegt Export und Hauptteil");
});

test("bei winzigem Budget wird ehrlich ganz weggelassen statt Bruchstuecke zu senden", () => {
  const { text, gekuerzt, weggelassen } = kuerzeInhalt("z".repeat(10_000), 50);
  assert.equal(gekuerzt, true);
  assert.equal(weggelassen, 10_000);
  assert.ok(/weggelassen/.test(text));
  assert.ok(text.length < 200, "ein 50-Zeichen-Bruchstueck hilft niemandem");
});

test("das Ergebnis bleibt unter dem Budget, egal wie die Groessen liegen", () => {
  const faelle = [
    [datei("a", 1)],
    [datei("a", 100_000)],
    Array.from({ length: 8 }, (_, i) => datei(`f${i}`, (i + 1) * 20_000)),
    [datei("winzig", 10), datei("riesig", 900_000)]
  ];
  for (const fall of faelle) {
    const { bloecke } = baueDateibloecke(fall, 60_000);
    const inhalt = bloecke.join("").length;
    // Die Ueberschriften (--- name ---) kommen obendrauf; sie sind winzig.
    assert.ok(inhalt <= 60_000 + fall.length * 200, `Budget gerissen bei ${fall.length} Dateien: ${inhalt}`);
  }
});

test("Unsinn faellt nicht um, sondern liefert nichts", () => {
  assert.deepEqual(baueDateibloecke(null).bloecke, []);
  assert.deepEqual(baueDateibloecke([{ ohneName: 1 }]).bloecke, []);
  assert.deepEqual(verteileBudget(null), []);
  assert.deepEqual(kuerzeInhalt(undefined, 100), { text: "", gekuerzt: false, weggelassen: 0 });
});

test("die Reihenfolge der Dateien bleibt erhalten", () => {
  const { bloecke } = baueDateibloecke([datei("erste.js", 100), datei("zweite.js", 100)]);
  assert.ok(bloecke[0].startsWith("--- erste.js ---"));
  assert.ok(bloecke[1].startsWith("--- zweite.js ---"));
});

// ---------------------------------------------------------------------------
// Symbol-Index: der Schwachpunkt des Kopf-Fuss-Schnitts ist die unsichtbare
// MITTE. Ohne Index weiss das Modell nur DASS dort etwas fehlt — mit Index
// weiss es WAS, und kann gezielt nachfragen statt zu raten oder die Existenz
// einer Funktion zu bestreiten, die es schlicht nie gesehen hat.
//
// GEMESSEN an src/server.js: 27 Symbole = 498 Zeichen = 1 % der Datei.
// ---------------------------------------------------------------------------
test("der Index findet Funktionen, Klassen und Pfeil-Konstanten", () => {
  const quelltext = [
    "import x from 'y';",
    "export function ersteFunktion(a) { return a; }",
    "async function zweiteFunktion() {}",
    "export class MeineKlasse {}",
    "export const pfeil = (a, b) => a + b;",
    "const alsFunktion = function () {};",
    "  const tiefVerschachtelt = () => 1;"
  ].join("\n");
  const namen = extrahiereSignaturen(quelltext);
  for (const erwartet of ["ersteFunktion", "zweiteFunktion", "MeineKlasse", "pfeil", "alsFunktion"]) {
    assert.ok(namen.includes(erwartet), `${erwartet} fehlt im Index`);
  }
  // Gegenstueck: gewoehnlicher Text erzeugt keine Phantom-Symbole.
  assert.deepEqual(extrahiereSignaturen("Das ist ein Satz ueber eine Funktion."), []);
  assert.deepEqual(extrahiereSignaturen(""), []);
  assert.deepEqual(extrahiereSignaturen(null), []);
});

test("die Marke nennt, WAS in der ausgelassenen Mitte steht", () => {
  const mitte = Array.from({ length: 60 }, (_, i) => `function mitte${i}() { ${"/*fuellung*/".repeat(20)} }`).join("\n");
  const inhalt = `function ganzOben() {}\n${mitte}\nfunction ganzUnten() {}`;
  const { text } = kuerzeInhalt(inhalt, 6_000);
  assert.ok(/Darin definiert:/.test(text), "ohne Index weiss das Modell nur DASS etwas fehlt");
  assert.ok(/mitte\d+/.test(text), "die Namen aus der Mitte gehoeren in die Marke");
  // Kopf und Fuss sind ohnehin sichtbar — sie doppelt zu nennen waere bezahlter
  // Platz fuer nichts.
  const marke = text.match(/\[\.\.\..*?\.\.\.\]/s)[0];
  assert.ok(!marke.includes("ganzOben"), "was im Kopf steht, gehoert nicht in den Index");
  assert.ok(!marke.includes("ganzUnten"), "was im Fuss steht, gehoert nicht in den Index");
});

test("der Index sprengt das Budget nicht — er wohnt darin", () => {
  const vieleSymbole = Array.from({ length: 400 }, (_, i) => `export function symbol${i}() {}`).join("\n");
  for (const budget of [2_000, 10_000, 30_000]) {
    const { text } = kuerzeInhalt(vieleSymbole, budget);
    assert.ok(text.length <= budget, `Budget ${budget} gerissen: ${text.length}`);
  }
  // Bei vielen Symbolen wird ehrlich abgekuerzt statt endlos aufgezaehlt.
  const { text } = kuerzeInhalt(vieleSymbole, 10_000);
  assert.ok(/und \d+ weitere/.test(text), "der Rest muss als Zahl genannt werden, nicht verschwiegen");
});

test("ohne erkennbare Symbole bleibt die Marke schlicht", () => {
  const { text } = kuerzeInhalt("a".repeat(50_000), 5_000);
  assert.ok(/ausgelassen/.test(text));
  assert.ok(!/Darin definiert/.test(text), "kein leerer Index-Satz ohne Inhalt");
});
