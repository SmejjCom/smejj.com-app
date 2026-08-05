// smejj.com — Tests des Nachsortierers (Reranker).
// Kein Netz, kein Schluessel, keine Kosten: der Modellaufruf ist injiziert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ANTWORT_TOKEN,
  baueAuswahlPrompt,
  bucheNachsortierung,
  GRUND,
  leseWahl,
  nachsortiere,
  neueNachsortierStatistik,
  NACHSORTIER_BECKEN
} from "../control-server/src/rag/ragRerank.js";
import { withRagContext } from "../src/evaluation/evalRagContext.js";
import { parseArguments } from "../scripts/evaluation/run_model_eval.mjs";

const BECKEN = [
  { source: "docs/architecture/FREE_ONLY_MASTER_POLICY.md", heading: "Skalierungsregel", snippet: "Skaliert wird durch Design." },
  { source: "AGENTS.md", heading: "Change-Lock", snippet: "Verifizierte Funktionen duerfen nicht kaputtgehen." },
  { source: "docs/architecture/LOCAL_FIRST_WORKSPACE.md", heading: "Grenzen", snippet: "Der Arbeitsbereich bleibt lokal." }
];

test("waehlt die zustaendige Passage und holt sie nach vorn", async () => {
  // Genau der gemessene Fall: BM25 hatte die Skalierungsregel vorn, zustaendig
  // ist aber der Change-Lock auf Platz 2.
  const ergebnis = await nachsortiere("Duerfen wir eine verifizierte Funktion ausbauen?", BECKEN, {
    callModel: async () => "2"
  });
  assert.equal(ergebnis.grund, GRUND.GEWAEHLT);
  assert.equal(ergebnis.wahl, 2);
  assert.equal(ergebnis.treffer.length, 1);
  assert.equal(ergebnis.treffer[0].heading, "Change-Lock");
});

test("Platz 1 bestaetigt wird als solcher gemeldet, nicht als Korrektur", async () => {
  const ergebnis = await nachsortiere("frage", BECKEN, { callModel: async () => "1" });
  assert.equal(ergebnis.grund, GRUND.BESTAETIGT);
  assert.equal(ergebnis.treffer[0].heading, "Skalierungsregel");
});

test("Ablehnung liefert KEINEN Kontext — das ist der halbe Zweck", async () => {
  // Kein Kontext ist besser als falscher Kontext. Gemessen brach genau daran die
  // Kategorie training ein (-14,4), als irrelevante Auszuege eingespeist wurden.
  const ergebnis = await nachsortiere("Wie spaet ist es in Tokio?", BECKEN, { callModel: async () => "0" });
  assert.equal(ergebnis.grund, GRUND.ABGELEHNT);
  assert.equal(ergebnis.wahl, 0);
  assert.deepEqual(ergebnis.treffer, []);
});

test("faellt bei Ausfall auf das heutige Verhalten zurueck, nicht auf gar nichts", async () => {
  // Non-Regression: ein Netzfehler darf keine funktionierende Eigenschaft
  // abschalten. Der Grund wird mitgefuehrt, damit haeufige Ausfaelle auffallen.
  const werfend = await nachsortiere("frage", BECKEN, { callModel: async () => { throw new Error("netz"); } });
  assert.equal(werfend.grund, GRUND.FEHLER);
  assert.equal(werfend.treffer.length, 1, "Rueckfall ist der beste BM25-Treffer");
  assert.equal(werfend.treffer[0].heading, "Skalierungsregel");

  const unlesbar = await nachsortiere("frage", BECKEN, { callModel: async () => "weiss nicht" });
  assert.equal(unlesbar.grund, GRUND.FEHLER);
  assert.equal(unlesbar.treffer[0].heading, "Skalierungsregel");

  const ohneAufruf = await nachsortiere("frage", BECKEN, {});
  assert.equal(ohneAufruf.grund, GRUND.FEHLER);
});

test("leeres Becken ruft das Modell gar nicht erst auf", async () => {
  let aufgerufen = false;
  const ergebnis = await nachsortiere("frage", [], { callModel: async () => { aufgerufen = true; return "1"; } });
  assert.equal(ergebnis.grund, GRUND.KEIN_BECKEN);
  assert.deepEqual(ergebnis.treffer, []);
  assert.equal(aufgerufen, false, "ohne Kandidaten gibt es nichts zu waehlen — kein Aufruf, keine Kosten");
});

test("leseWahl unterscheidet Ablehnung von Ausfall", () => {
  // 0 ist eine Entscheidung, null ist ein Ausfall. Sie fuehren zu verschiedenen
  // Rueckfallebenen — wer sie gleichsetzt, verliert diese Unterscheidung.
  assert.equal(leseWahl("0", 3), 0);
  assert.equal(leseWahl("2", 3), 2);
  assert.equal(leseWahl("Passage 3 passt", 3), 3);
  assert.equal(leseWahl("", 3), null);
  assert.equal(leseWahl("keine Ahnung", 3), null);
  assert.equal(leseWahl("7", 3), null, "ausserhalb des Beckens ist unbrauchbar, nicht Treffer 7");
  assert.equal(leseWahl(null, 3), null);
});

test("der Auswahl-Prompt nummeriert ab 1 und nennt die Quelle", () => {
  const prompt = baueAuswahlPrompt("Duerfen wir das?", BECKEN);
  assert.match(prompt, /\[1\] docs\/architecture\/FREE_ONLY_MASTER_POLICY\.md :: Skalierungsregel/);
  assert.match(prompt, /\[2\] AGENTS\.md :: Change-Lock/);
  assert.match(prompt, /Antworte NUR mit der Nummer/);
  assert.ok(ANTWORT_TOKEN > 0 && NACHSORTIER_BECKEN >= 3);
});

test("der Wortlaut haelt die Ablehnung eng — sie ist die Ausnahme, nicht der Standard", () => {
  // Gemessen am 2026-08-04: "Welche Passage BEANTWORTET die Frage ... beantwortet
  // KEINE, antworte 0" lehnte 33 % der Becken ab, im vollen Lauf sogar 51 % — und
  // halbierte damit den Kontext, der +4,0 Punkte wert ist. Die Fassung unten kam
  // auf 10 %. Der Wortlaut ist deshalb Teil der Messung und darf nicht beilaeufig
  // zurueckgedreht werden; wer ihn aendert, misst neu.
  const prompt = baueAuswahlPrompt("Frage", BECKEN);
  assert.match(prompt, /hilft am ehesten/, "die Messlatte ist Hilfe, nicht vollstaendige Beantwortung");
  assert.match(prompt, /Waehle 0 NUR, wenn/, "die Ablehnung braucht eine enge Bedingung");
  assert.match(prompt, /Im Zweifel waehle die beste Passage statt 0/);
  assert.doesNotMatch(prompt, /Beantwortet KEINE der Passagen die Frage/, "die abgeloeste Fassung darf nicht zurueckkehren");
});

test("die Statistik zaehlt jeden Ausgang getrennt", () => {
  const s = neueNachsortierStatistik();
  for (const grund of [GRUND.BESTAETIGT, GRUND.GEWAEHLT, GRUND.GEWAEHLT, GRUND.ABGELEHNT, GRUND.FEHLER, GRUND.KEIN_BECKEN]) {
    bucheNachsortierung(s, grund);
  }
  assert.deepEqual(s, { becken: 5, bestaetigt: 1, gewaehlt: 2, abgelehnt: 1, fehler: 1, keinBecken: 1 });
});

test("ohne Nachsortierer bleibt der bisherige Weg unveraendert", async () => {
  // Bedingung dafuer, dass die frueheren Berichte vergleichbar bleiben: der Pfad
  // ohne Nachsortierer darf sich nicht bewegt haben.
  const fall = { id: "x", prompt: "frage", system: "ANWEISUNG" };
  const ergebnis = await withRagContext(fall, "/egal", { buildBlock: async () => "KONTEXT" });
  assert.equal(ergebnis.case.system, "KONTEXT\n\nANWEISUNG");
  assert.equal(ergebnis.grund, null, "ohne Nachsortierer gibt es keinen Grund zu melden");
});

test("--rerank verlangt --rag, sonst Abbruch statt stiller Wirkungslosigkeit", () => {
  assert.equal(parseArguments(["--rerank"]).error, "rerank_ohne_rag");
  assert.equal(parseArguments(["--rag", "--rerank"]).options.rerank, true);
  assert.equal(parseArguments(["--rag"]).options.rerank, false, "aus ist der Standard");
});
