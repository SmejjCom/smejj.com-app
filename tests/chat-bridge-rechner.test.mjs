import assert from "node:assert/strict";
import test from "node:test";

import {
  annuitaet, baueRechenKontext, istFinanzierungsfrage, leseZahl,
  restschuld, sparplanEndwert, zinseszins
} from "../public/chat-bridge-rechner.js";

// Die Frage des Betreibers vom 2026-08-05, an der der Fehler gemessen wurde.
const ECHTE_FRAGE = "Ein Buero kostet 1.200.000 USD. Ich habe 25 % Eigenkapital, "
  + "will 20 Jahre finanzieren bei 6,5 % Zins. Berechne die Monatsrate und die Gesamtzinsen.";

test("annuitaet rechnet exakt — der Fall, an dem das Modell 40 % daneben lag", () => {
  const { monatsrate, gesamtzinsen } = annuitaet({ darlehen: 900_000, zinsProJahr: 6.5, jahre: 20 });
  // Von Hand gegengerechnet: (1+0,065/12)^240 = 3,656447 -> 6710,16.
  assert.ok(Math.abs(monatsrate - 6710.16) < 0.5, `Monatsrate ${monatsrate}`);
  assert.ok(Math.abs(gesamtzinsen - 710_437) < 200, `Gesamtzinsen ${gesamtzinsen}`);
  // Und ausdruecklich NICHT die geschaetzte Zahl des Modells.
  assert.ok(Math.abs(monatsrate - 9373.5) > 1000);
});

test("annuitaet ohne Zins entartet nicht (Division durch null)", () => {
  const { monatsrate, gesamtzinsen } = annuitaet({ darlehen: 12_000, zinsProJahr: 0, jahre: 1 });
  assert.equal(monatsrate, 1000);
  assert.equal(gesamtzinsen, 0);
});

test("leseZahl versteht deutsche UND englische Schreibweise", () => {
  assert.equal(leseZahl("1.200.000"), 1_200_000);
  assert.equal(leseZahl("1,200,000"), 1_200_000);
  assert.equal(leseZahl("1.234.567,89"), 1_234_567.89);
  assert.equal(leseZahl("6,5"), 6.5);
  assert.equal(leseZahl("6.5"), 6.5);
  assert.equal(leseZahl("abc"), null);
});

test("erkennt eine Finanzierungsfrage und rechnet sie durch", () => {
  assert.equal(istFinanzierungsfrage(ECHTE_FRAGE), true);
  const kontext = baueRechenKontext(ECHTE_FRAGE);
  assert.match(kontext, /Darlehensbetrag: 900\.000,00/);
  assert.match(kontext, /Monatsrate \(Annuitaet\): 6\.710,1/);
  assert.match(kontext, /Zinssatz: 6,5 %/); // deutsches Komma, nicht "6.5"
});

// Der eigentliche Schutz: im Zweifel NICHTS liefern. Eine halb erkannte Zahl
// waere schlimmer als gar keine, weil sie richtig aussieht.
test("liefert leer, wenn Werte fehlen oder unsinnig sind", () => {
  for (const frage of [
    "Wie ist das Wetter in Berlin?",                        // gar keine Finanzfrage
    "Erklaer mir, wie ein Annuitaetendarlehen funktioniert.", // kein Rechenwunsch
    "Berechne meinen Kredit ueber 20 Jahre.",               // ohne Zins und Betrag
    "Berechne den Kredit: 300.000 Euro, 30 Jahre, 95 % Zins" // Zins ausserhalb des Rahmens
  ]) {
    assert.equal(baueRechenKontext(frage), "", frage);
  }
  assert.equal(baueRechenKontext(""), "");
  assert.equal(baueRechenKontext(null), "");
});

test("ohne Eigenkapital gilt der Betrag selbst als Darlehen", () => {
  const kontext = baueRechenKontext("Berechne die Monatsrate: Darlehen 300.000 Euro, 10 Jahre, 3 % Zins.");
  assert.match(kontext, /Kaufpreis\/Betrag: 300\.000,00/);
  assert.doesNotMatch(kontext, /Eigenkapital/);
  assert.match(kontext, /Monatsrate \(Annuitaet\): 2\.896,8/); // von Hand: 2896,82
});

// Anschlussfragen — der Fall, an dem die erste Fassung live scheiterte:
// "Und wenn ich stattdessen nur 15 Jahre finanziere?" ergab 8.221,74 statt
// 7.839,97, weil der Rechner nur die aktuelle Frage sah.
test("Anschlussfrage: neue Laufzeit gewinnt, der Rest kommt aus dem Verlauf", () => {
  const kontext = baueRechenKontext("Und wenn ich stattdessen nur 15 Jahre finanziere?", [ECHTE_FRAGE]);
  assert.match(kontext, /Laufzeit: 15 Jahre \(180 Monatsraten\)/);
  assert.match(kontext, /Darlehensbetrag: 900\.000,00/);   // Eigenkapital mitgenommen
  assert.match(kontext, /Monatsrate \(Annuitaet\): 7\.839,97/);
  assert.doesNotMatch(kontext, /Laufzeit: 20 Jahre/);      // alte Laufzeit darf NICHT stehenbleiben
});

test("Anschlussfrage: geaendertes Eigenkapital gewinnt ebenfalls", () => {
  const kontext = baueRechenKontext("Und mit 40 % Eigenkapital?", [ECHTE_FRAGE]);
  assert.match(kontext, /Eigenkapital \(40 %\): 480\.000,00/);
  assert.match(kontext, /Laufzeit: 20 Jahre/); // unveraendert aus dem Verlauf
});

test("das Eigenkapital wird auch aus einer aelteren Runde geholt", () => {
  const kontext = baueRechenKontext("Und bei 15 Jahren Laufzeit?", [
    "Rechne mit 6,5 % Zins ueber 20 Jahre.",
    "Ich will ein Buero fuer 1.200.000 Euro kaufen, 25 % Eigenkapital, Kredit."
  ]);
  // Ohne Blick in die zweite Runde waere der volle Kaufpreis das Darlehen —
  // zu hoch, aber plausibel, und damit die gefaehrlichste Sorte Fehler.
  assert.match(kontext, /Darlehensbetrag: 900\.000,00/);
  assert.match(kontext, /Laufzeit: 15 Jahre/);
});

test("der Verlauf reisst NICHT jede Zahl an sich", () => {
  for (const frage of [
    "Wie war das Wetter vor 5 Jahren?", // Jahreszahl, aber kein Finanzthema
    "Danke, sehr hilfreich!",           // aendert gar nichts
    "Erzaehl mir einen Witz."
  ]) {
    assert.equal(baueRechenKontext(frage, [ECHTE_FRAGE]), "", frage);
  }
  // Und ohne Verlauf bleibt eine Anschlussfrage folgenlos.
  assert.equal(baueRechenKontext("Und wenn ich stattdessen nur 15 Jahre finanziere?", []), "");
});

test("die Bruecke haengt den Rechen-Kontext an und verbietet LaTeX", async () => {
  const quelle = await import("node:fs/promises").then((fs) => fs.readFile("public/chat-bridge.js", "utf8"));
  const ohneKommentare = quelle.replace(/^\s*\/\/.*$/gm, "");
  assert.match(ohneKommentare, /baueRechenKontext\(task, nutzerfragenRueckwaerts\(body\.history\)\)/);
  assert.match(ohneKommentare, /task, rechnung, webContext/); // liegt im Nutzertext an
  assert.match(ohneKommentare, /Niemals LaTeX/);
  // Coding-Anfragen bleiben unberuehrt.
  assert.match(ohneKommentare, /coding \? "" : baueRechenKontext/);
});

// --- Die drei anderen Potenzrechnungen ---------------------------------------
// Alle drei am 2026-08-05 live gemessen und alle drei falsch beantwortet.
// Sollwerte von Hand nachgerechnet, nicht vom Modell uebernommen.

test("Zinseszins: 50.000 zu 4,5 % ueber 12 Jahre", () => {
  const { endwert } = zinseszins({ betrag: 50_000, zinsProJahr: 4.5, jahre: 12 });
  assert.ok(Math.abs(endwert - 84_794.07) < 1, `Endwert ${endwert}`);
  assert.ok(Math.abs(endwert - 64_800.59) > 1000); // NICHT die geschaetzte Zahl
  assert.match(
    baueRechenKontext("Wie viel sind 50.000 Euro nach 12 Jahren bei 4,5 % Zinseszins pro Jahr wert?"),
    /ENDWERT nach 12 Jahren: 84\.794,07/
  );
});

test("Sparplan: 300 im Monat, 15 Jahre, 5 %", () => {
  const { endwert, eingezahlt } = sparplanEndwert({ monatsbetrag: 300, zinsProJahr: 5, jahre: 15 });
  assert.equal(eingezahlt, 54_000);
  assert.ok(Math.abs(endwert - 80_186.68) < 1, `Endwert ${endwert}`);
  assert.match(
    baueRechenKontext("Ich spare 300 Euro im Monat ueber 15 Jahre bei 5 % Rendite pro Jahr. Wie viel habe ich am Ende?"),
    /ENDWERT nach 15 Jahren: 80\.186,68/
  );
});

test("Restschuld: 400.000 zu 3,5 %, nach 10 von 30 Jahren", () => {
  const w = restschuld({ darlehen: 400_000, zinsProJahr: 3.5, jahre: 30, nachJahren: 10 });
  assert.ok(Math.abs(w.monatsrate - 1796.18) < 0.5);
  assert.ok(Math.abs(w.rest - 309_707.5) < 5, `Restschuld ${w.rest}`);
  // Getilgt + Restschuld muss wieder das Darlehen ergeben — die Probe aufs Exempel.
  assert.ok(Math.abs(w.getilgt + w.rest - 400_000) < 0.01);
});

test("die Arten nehmen einander die Frage nicht weg", () => {
  // Eine Annuitaetsfrage darf NICHT beim Zinseszins landen (Kreditwort schuetzt).
  assert.match(baueRechenKontext(ECHTE_FRAGE), /Monatsrate \(Annuitaet\): 6\.710,16/);
  // Und ohne erkennbare Art bleibt alles leer.
  assert.equal(baueRechenKontext("Wie wird das Wetter in 3 Jahren?"), "");
  assert.equal(baueRechenKontext("Was kostet ein Kaffee bei 5 % Aufschlag?"), "");
});

test("unsinnige Zeitpunkte werden abgewiesen", () => {
  // Restschuld NACH dem Ende der Laufzeit ist keine sinnvolle Frage.
  assert.equal(baueRechenKontext("Darlehen 400.000 Euro, 3,5 % Zins, 10 Jahre Laufzeit. Restschuld nach 20 Jahren?"), "");
});
