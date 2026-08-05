// smejj.com — Tests der Deckenmessung.
// Kein Netz, kein Schluessel: das Urteil wird injiziert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  baueUrteilsPrompt,
  bewerteFall,
  DECKEN_BECKEN,
  fasseDeckeZusammen,
  leseNummern,
  parseArguments
} from "../scripts/evaluation/rag_decke.mjs";

const BECKEN = [
  { source: "AGENTS.md", heading: "Change-Lock", text: "Verifizierte Funktionen duerfen nicht kaputtgehen." },
  { source: "docs/architecture/FREE_ONLY_MASTER_POLICY.md", heading: "Skalierungsregel", text: "Skaliert wird durch Design." }
];

test("Kommandozeile: Standard ist die Produktionsschwelle", () => {
  const standard = parseArguments([]).options;
  assert.equal(standard.suite, "evals/suites/smejj-chat-breit-v1.json");
  // Verglichen wird gegen das, was der Dienst WIRKLICH tut — nicht gegen einen
  // Messwert. Sonst beschriebe die Decke eine Konfiguration, die niemand faehrt.
  assert.equal(standard.schwelle, 20);
  assert.equal(parseArguments(["--quatsch"]).error, "unknown_argument:--quatsch");
  assert.equal(parseArguments(["--limit", "0"]).error, "invalid_limit");
  assert.equal(parseArguments(["--schwelle", "-1"]).error, "invalid_schwelle");
});

test("leseNummern trennt Ablehnung, Treffer und Ausfall", () => {
  assert.deepEqual(leseNummern("0", 2), [], "0 heisst: keine Passage deckt die Frage");
  assert.deepEqual(leseNummern("1,2", 2), [1, 2]);
  assert.deepEqual(leseNummern("Passage 2", 2), [2]);
  assert.deepEqual(leseNummern("2,2,1", 2), [2, 1], "Dubletten werden zusammengefasst");
  assert.equal(leseNummern("", 2), null, "leere Antwort ist ein Ausfall, keine Aussage");
  assert.equal(leseNummern("weiss nicht", 2), null);
  // Nur unbrauchbare Nummern heissen: das Modell hat die Frage nicht beantwortet.
  // Als "ungedeckt" gezaehlt wuerde das die Decke faelschlich niedriger machen.
  assert.equal(leseNummern("42", 2), null);
});

test("die drei Gruppen trennen Suchproblem von Wissensluecke", () => {
  assert.equal(bewerteFall({ gedeckt: true, heuteGefunden: true }), "gedeckt-gefunden");
  assert.equal(bewerteFall({ gedeckt: true, heuteGefunden: false }), "gedeckt-verfehlt");
  assert.equal(bewerteFall({ gedeckt: false, heuteGefunden: false }), "ungedeckt");
  // Unklar ist eine eigene Gruppe: ein Ausfall darf weder als Luft noch als
  // Decke zaehlen, sonst zeigt die Messung eine Genauigkeit, die sie nicht hat.
  assert.equal(bewerteFall({ gedeckt: null, heuteGefunden: false }), "unklar");
});

test("die Zusammenfassung zaehlt je Kategorie und insgesamt", () => {
  const { gesamt, kategorien } = fasseDeckeZusammen([
    { kategorie: "schutz", gruppe: "gedeckt-verfehlt" },
    { kategorie: "schutz", gruppe: "gedeckt-gefunden" },
    { kategorie: "logik", gruppe: "ungedeckt" },
    { kategorie: "", gruppe: "unklar" }
  ]);
  assert.equal(gesamt.gesamt, 4);
  assert.equal(gesamt["gedeckt-verfehlt"], 1);
  assert.equal(kategorien.schutz.gesamt, 2);
  assert.equal(kategorien.logik.ungedeckt, 1);
  assert.equal(kategorien.sonstige.unklar, 1, "Faelle ohne Kategorie verschwinden nicht");
});

test("der Urteils-Prompt fragt nach Notwendigkeit, nicht nach Aehnlichkeit", () => {
  // Die Lehre aus dem Nachsortierer: der Wortlaut entscheidet ueber das Ergebnis.
  // "passt zum Thema" wuerde fast alles bejahen und die Decke zu hoch ausweisen.
  const prompt = baueUrteilsPrompt("Duerfen wir das?", BECKEN);
  assert.match(prompt, /\[1\] AGENTS\.md :: Change-Lock/);
  assert.match(prompt, /BRAUCHT/);
  assert.match(prompt, /Allgemeinwissen zaehlt nicht/);
  assert.match(prompt, /antworte 0/);
  assert.ok(DECKEN_BECKEN >= 20, "das Becken muss breiter sein als im Betrieb, sonst misst es die Suche statt den Korpus");
});
