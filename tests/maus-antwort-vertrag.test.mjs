// smejj.com — Waechter fuer die Antwort der Maus.
//
// LIVE GEFUNDEN 2026-09-05 (Betreiber: "Erledige mit der Maus im Browser ...
// alle Fehler beheben"): Auf den Auftrag "Oeffne example.com und sag mir, welche
// Ueberschrift dort steht" meldete die Maus
//   "Maus fertig nach 0 Schritten: The heading is present on the current page."
// Drei Fehler in einer Zeile: null Schritte (die Seite wurde nie gelesen),
// englische Antwort in einer deutschen App, und die Frage blieb unbeantwortet.
// Ursache war der Entscheidungs-Vertrag: er verlangte weder eine Sprache noch,
// dass bei einer Frage der gefundene WERT im "result" steht.
import test from "node:test";
import assert from "node:assert/strict";
import { buildStepPrompt } from "../workers/maus-engine/prompt-template.mjs";

const prompt = () => buildStepPrompt({
  task: "Oeffne example.com und sag mir, welche Ueberschrift dort steht.",
  capsuleRef: "capsule/pruef",
  domainAllowlist: ["example.com"],
  budget: { maxSteps: 10 },
  files: [],
  visionAllowed: false,
  observation: { url: "https://example.com", title: "Example Domain" },
  history: [],
  remainingSteps: 9
});

test("der Vertrag verlangt die Antwort auf Deutsch", () => {
  assert.match(prompt(), /ANTWORT FUER DEN NUTZER und steht auf DEUTSCH/);
});

test("der Vertrag verlangt den gefundenen WERT, nicht die Feststellung", () => {
  const p = prompt();
  assert.match(p, /gefundene WERT hinein/, "der Wert selbst muss verlangt sein");
  assert.match(p, /KEIN\n?\s*\/?\/?\s*Ergebnis|ist KEIN/, "die blosse Feststellung muss ausgeschlossen sein");
});

test("voreiliges done ist ausgeschlossen, solange der Wert fehlt", () => {
  // Genau der Fall vom 05.09.: done nach null Schritten, ohne je gelesen zu haben.
  assert.match(prompt(), /erst lesen \(act\), nicht done melden/);
});

test("die uebrigen Vertragsteile bleiben unangetastet", () => {
  const p = prompt();
  assert.match(p, /decision "act"/, "act muss weiter beschrieben sein");
  assert.match(p, /decision "fail"/, "fail muss weiter beschrieben sein");
  assert.match(p, /untrusted_seitenzustand/, "der Injektionsschutz muss stehen bleiben");
});

// LIVE GEMESSEN 2026-09-05 (Nachtest nach der Auslieferung): dreimal "navigate"
// ohne url auf die schon offene Seite -> entscheidung_abgelehnt, Frage offen.
test("die offene Seite wird als offen benannt — kein navigate im Kreis", () => {
  const p = prompt();
  assert.match(p, /DIE SEITE https:\/\/example\.com IST BEREITS GEOEFFNET/);
  assert.match(p, /navigate auf dieselbe Adresse ist kein Schritt/);
  assert.match(p, /sofort done, mit dem Wert im result/);
});

test("Pflichtfelder je Aktion stehen im Vertrag — aus dem Schema, nicht aus dem Kopf", () => {
  const p = prompt();
  assert.match(p, /PFLICHTFELDER JE AKTION/);
  assert.match(p, /navigate: url/);
  assert.match(p, /click: target/);
  assert.match(p, /extract: name, target/);
  assert.doesNotMatch(p, /openBrowser: /, "verbotene Loop-Aktionen gehoeren nicht in die Pflichtfeld-Liste");
});

test("ohne Adresse im Seitenzustand gibt es keinen Offen-Hinweis", () => {
  const p = buildStepPrompt({
    task: "x", capsuleRef: "c", domainAllowlist: ["example.com"], budget: { maxSteps: 3 }, files: [],
    visionAllowed: false, observation: { title: "ohne Adresse" }, history: [], remainingSteps: 3
  });
  assert.doesNotMatch(p, /IST BEREITS GEOEFFNET/);
  assert.match(p, /PFLICHTFELDER JE AKTION/, "die Pflichtfelder gelten immer");
});

// LIVE 06.09.: role textbox statt searchbox, derselbe Selektor nach dem Fehlschlag.
test("der Vertrag lenkt Eingabefelder auf css aus der Elementliste und verbietet die Wiederholung", () => {
  const p = prompt();
  assert.match(p, /EINGABEFELDER: nimm css aus der Elementliste/);
  assert.match(p, /Suchfelder sind\n?\s*searchbox, nicht textbox/);
  assert.match(p, /nie denselben\n?\s*Selektor wiederholen/);
});
