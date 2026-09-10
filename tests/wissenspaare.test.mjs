// Die Wissenspaare — und die Grenze, die sie nicht ueberschreiten duerfen.
//
// Wissen ins Training zu geben ist die einzige verbliebene Idee, nachdem sechs
// Versionen an derselben Stelle gescheitert sind (Wissen faellt, Koennen
// steigt). Sie hat aber eine gefaehrliche Nachbarschaft: wer die PRUEFFRAGEN
// ins Training gibt statt der Fakten, bekommt eine bessere Note und ein
// schlechteres Modell — und merkt es nie, weil die Messung selbst der Zeuge
// waere.
//
// Diese Faelle ziehen die Grenze an drei Stellen: woertliche Uebernahme,
// zu grosse Wortueberlappung, und ob die Antworten die Fakten ueberhaupt
// treffen.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { alsZeile, verteilung, wissensPaare } from "../scripts/training/smejj-1-1-wissenspaare.mjs";

/** Alle Faelle der Pruefsuite, einmal geladen. */
function suitenFaelle() {
  const faelle = [];
  for (const datei of readdirSync("evals/packs")) {
    const pack = JSON.parse(readFileSync(`evals/packs/${datei}`, "utf8"));
    for (const fall of pack.faelle || pack.cases || []) {
      if (fall.prompt) faelle.push({ ...fall, pack: datei.replace(/\.json$/, "") });
    }
  }
  const core = JSON.parse(readFileSync("evals/suites/smejj-chat-core-v1.json", "utf8"));
  for (const fall of core.cases || []) if (fall.prompt) faelle.push({ ...fall, pack: "core" });
  return faelle;
}

const woerter = (text) => new Set(String(text).toLowerCase().match(/[a-zäöüß0-9.]{4,}/g) || []);

function ueberlappung(a, b) {
  const A = woerter(a);
  const B = woerter(b);
  if (A.size === 0 || B.size === 0) return 0;
  let gleich = 0;
  for (const w of A) if (B.has(w)) gleich += 1;
  return gleich / Math.min(A.size, B.size);
}

test("keine Frage ist aus der Pruefsuite abgeschrieben", () => {
  const suite = new Set(suitenFaelle().map((f) => f.prompt.trim().toLowerCase()));
  assert.ok(suite.size > 200, `nur ${suite.size} Faelle gelesen — die Pruefung waere wertlos`);
  for (const paar of wissensPaare()) {
    assert.ok(!suite.has(paar.frage.trim().toLowerCase()),
      `woertlich aus der Suite: ${paar.frage}`);
  }
});

test("auch UMFORMULIERTE Pruefaufgaben sind zu nah dran", () => {
  // Die woertliche Pruefung allein genuegt nicht: ein umgestelltes Wort haette
  // sie schon ausgehebelt. Ab 80 Prozent gemeinsamer Woerter ist es dieselbe
  // Aufgabe in anderer Verpackung.
  const faelle = suitenFaelle();
  const zuNah = [];
  for (const paar of wissensPaare()) {
    for (const fall of faelle) {
      const wert = ueberlappung(paar.frage, fall.prompt);
      if (wert >= 0.8) zuNah.push(`${Math.round(wert * 100)} % — "${paar.frage.slice(0, 60)}" ~ "${fall.prompt.slice(0, 60)}"`);
    }
  }
  assert.deepEqual(zuNah, [], `zu nah an der Pruefung:\n${zuNah.join("\n")}`);
});

test("die Antworten treffen die Fakten, die die Pruefung verlangt", () => {
  // Die Gegenprobe zur Abgrenzung: die Fragen muessen ANDERS sein, die FAKTEN
  // dieselben. Sonst lehrt die Datei etwas Falsches — und das faellt sonst erst
  // nach einem Trainingslauf und einer Messung auf, also nach Stunden und Geld.
  const alle = wissensPaare().map((p) => p.antwort.toLowerCase()).join("\n");
  const pflicht = [
    ["200", "TTFB-Budget"],
    ["p95", "Perzentil des TTFB-Budgets"],
    ["1,5", "LCP-Budget"],
    ["0,1", "CLS-Budget"],
    ["300 kb", "Gewicht der Startseite"],
    ["99,99", "Verfuegbarkeit"],
    ["measure:vitals", "Messbefehl"],
    ["fail-closed", "Standard des Mitschreibens"],
    ["modellkollaps", "Folge von erzeugten Trainingsdaten"],
    ["einwilligung", "Bedingung fuer eigene Nutzerdaten"],
    ["idrive e2", "Hauptspeicher"],
    ["github pages", "Auslieferung"],
    ["zeabur", "Control Server"],
    ["salad", "Rechenarbeit"],
    ["/api/agent", "Pfad fuer Projektwissen"],
    ["task capsule", "Ort der Historie"],
    ["smejj 1.0", "Name des eigenen Modells"],
    ["smejj_", "Praefix der Umgebungsvariablen"]
  ];
  const fehlend = pflicht.filter(([wort]) => !alle.includes(wort)).map(([wort, wofuer]) => `${wofuer} (${wort})`);
  assert.deepEqual(fehlend, [], `diese Fakten kommen in keiner Antwort vor: ${fehlend.join(", ")}`);
});

test("die Namensregel wird in den Antworten selbst eingehalten", () => {
  // Ein Paar, das die Regel LEHRT und im eigenen Text bricht, lehrt das
  // Gegenteil — das Modell lernt aus dem Text, nicht aus der Absicht.
  for (const paar of wissensPaare()) {
    const text = `${paar.frage}\n${paar.antwort}`;
    const verstoesse = (text.match(/SMEJJ\.COM|Smejj\.com|Smejj\b/g) || [])
      .filter((treffer) => !text.includes(`'${treffer}'`) && !text.includes(`"${treffer}"`));
    assert.deepEqual(verstoesse, [],
      `falsche Schreibweise in: ${paar.frage.slice(0, 50)} -> ${verstoesse.join(", ")}`);
  }
});

test("jedes Paar hat eine echte Antwort, keinen Stichpunkt", () => {
  for (const paar of wissensPaare()) {
    assert.ok(paar.antwort.length >= 60, `zu knapp: ${paar.frage}`);
    assert.ok(paar.frage.length >= 15, `zu knapp gefragt: ${paar.frage}`);
    assert.ok(paar.gebiet, `ohne Gebiet: ${paar.frage}`);
  }
});

test("keine Frage kommt doppelt vor", () => {
  const fragen = wissensPaare().map((p) => p.frage.trim().toLowerCase());
  assert.equal(fragen.length, new Set(fragen).size);
});

test("alle sechs abgestuerzten Gebiete sind abgedeckt", () => {
  // Gemessen bei 1.8 gegen die Basis: name -16, trainingsdaten -25,6,
  // rag -17,8, leistung -15, architektur -13,3, sicherheit -14,7.
  const v = verteilung();
  for (const gebiet of ["name", "trainingsdaten", "rag", "leistung", "architektur", "sicherheit"]) {
    assert.ok((v[gebiet] || 0) >= 4, `Gebiet ${gebiet} hat nur ${v[gebiet] || 0} Paare`);
  }
});

test("das Trainingsformat passt zu dem der uebrigen Handpaare", () => {
  const z = alsZeile(wissensPaare()[0]);
  assert.equal(z.messages.length, 3);
  assert.equal(z.messages[0].role, "system");
  assert.equal(z.messages[1].role, "user");
  assert.equal(z.messages[2].role, "assistant");
  assert.equal(z.handgeschrieben, true, "sonst zaehlt der Datensatzbau sie nicht zu den echten Paaren");
});
