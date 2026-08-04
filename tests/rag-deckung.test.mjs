// smejj.com — Tests fuer die RAG-Deckungsmessung.
//
// Warum diese Tests: das Werkzeug existiert, weil ein A/B-Lauf am 2026-08-04 in
// 0 von 4 Aufrufen Kontext bekam und daraus beinahe "Projektwissen bringt nichts"
// geworden waere. Ein Werkzeug gegen Fehlmessungen darf selbst keine haben.
// Ohne Netz, ohne Modellaufruf, ohne Schluessel.
import test from "node:test";
import assert from "node:assert/strict";
import { fasseDeckungZusammen, parseArguments } from "../scripts/evaluation/rag_deckung.mjs";
import { withRagContext } from "../src/evaluation/evalRagContext.js";

test("Kommandozeile: Standardwerte und eigene Schwellen", () => {
  const standard = parseArguments([]).options;
  assert.equal(standard.suite, "evals/suites/smejj-chat-breit-v1.json");
  // Die erste Schwelle ist die Produktionsschwelle — der Vergleich beginnt immer
  // bei dem, was der Dienst wirklich tut, nicht bei einem Wunschwert.
  assert.equal(standard.schwellen[0], 20);

  const eigen = parseArguments(["--schwellen", "20,10"]).options;
  assert.deepEqual(eigen.schwellen, [20, 10]);
});

test("Kommandozeile weist Unbrauchbares ab, statt still zu raten", () => {
  assert.equal(parseArguments(["--quatsch"]).error, "unknown_argument:--quatsch");
  assert.equal(parseArguments(["--schwellen", "acht"]).error, "invalid_schwellen");
  assert.equal(parseArguments(["--schwellen", "-5"]).error, "invalid_schwellen");
  assert.equal(parseArguments(["--schwellen", ""]).error, "invalid_schwellen");
});

test("Deckung wird je Kategorie gezaehlt, nicht nur insgesamt", () => {
  // Genau das ist der Kern: 30 % Deckung INSGESAMT kann bedeuten, dass die
  // Wissenskategorien voll versorgt sind — oder dass ausgerechnet sie leer
  // ausgehen. Nur die Aufschluesselung unterscheidet die beiden Faelle.
  const treffer = fasseDeckungZusammen([
    { kategorie: "router", contextChars: 0 },
    { kategorie: "router", contextChars: 0 },
    { kategorie: "naming", contextChars: 500 },
    { kategorie: "naming", contextChars: 300 }
  ]);
  assert.deepEqual(treffer.router, { mit: 0, gesamt: 2, zeichen: 0 });
  assert.deepEqual(treffer.naming, { mit: 2, gesamt: 2, zeichen: 800 });
});

test("Faelle ohne Kategorie verschwinden nicht, sie heissen sonstige", () => {
  const treffer = fasseDeckungZusammen([{ kategorie: "", contextChars: 0 }]);
  assert.equal(treffer.sonstige.gesamt, 1);
});

test("ohne Treffer bleibt der Fall unveraendert — kein leerer Kontextblock", async () => {
  const fall = { id: "x", prompt: "irgendwas", system: "urspruenglich" };
  const ergebnis = await withRagContext(fall, "/nicht/vorhanden", { buildBlock: async () => null });
  assert.equal(ergebnis.contextChars, 0);
  assert.equal(ergebnis.case.system, "urspruenglich");
  assert.equal(ergebnis.case, fall, "ohne Kontext darf der Fall nicht kopiert werden");
});

test("mit Treffer steht der Kontext VOR der Anweisung des Falls", async () => {
  // Die Zusicherungen pruefen die Anweisung, nicht den Kontext. Stuende der
  // Kontext hinten, koennte er die Anweisung ueberschreiben und der Fall wuerde
  // etwas anderes messen als er soll.
  const fall = { id: "x", prompt: "frage", system: "ANWEISUNG" };
  const ergebnis = await withRagContext(fall, "/egal", { buildBlock: async () => "KONTEXT" });
  assert.equal(ergebnis.case.system, "KONTEXT\n\nANWEISUNG");
  assert.equal(ergebnis.contextChars, 7);
});
