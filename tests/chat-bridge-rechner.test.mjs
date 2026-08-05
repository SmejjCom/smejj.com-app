import assert from "node:assert/strict";
import test from "node:test";

import { annuitaet, baueRechenKontext, istFinanzierungsfrage, leseZahl } from "../public/chat-bridge-rechner.js";

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

test("die Bruecke haengt den Rechen-Kontext an und verbietet LaTeX", async () => {
  const quelle = await import("node:fs/promises").then((fs) => fs.readFile("public/chat-bridge.js", "utf8"));
  const ohneKommentare = quelle.replace(/^\s*\/\/.*$/gm, "");
  assert.match(ohneKommentare, /baueRechenKontext\(task\)/);
  assert.match(ohneKommentare, /task, rechnung, webContext/); // liegt im Nutzertext an
  assert.match(ohneKommentare, /Niemals LaTeX/);
  // Coding-Anfragen bleiben unberuehrt.
  assert.match(ohneKommentare, /coding \? "" : baueRechenKontext/);
});
