import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { baueSuiteFingerabdruck, pruefeVerunreinigung } from "../src/training/opencorpus/contamination.js";
import { baueKorpus, baueKorpusRecord, korpusFamilienFingerabdruck } from "../src/training/opencorpus/corpus.js";

const KEY = Buffer.alloc(32, 7);
const SUITE = JSON.parse(readFileSync(new URL("../evals/suites/smejj-chat-core-v1.json", import.meta.url), "utf8"));
const FINGERABDRUCK = baueSuiteFingerabdruck(SUITE, { unterscheidendeWerte: [] });

const QUELLE = Object.freeze({
  datasetId: "OpenAssistant/oasst2",
  revision: "2a4bbd0e1a9d5a1b8f7c3e2d1a0b9c8d7e6f5a4b",
  license: "apache-2.0",
  authorship: "human"
});

function zeile(overrides = {}) {
  return {
    id: "m-1",
    gruppe: "baum-1",
    synthetic: false,
    messages: [
      { role: "user", content: "Erklaere mir bitte kurz, wie eine Schleife in JavaScript funktioniert." },
      { role: "assistant", content: "Eine Schleife wiederholt einen Block, solange ihre Bedingung wahr ist." }
    ],
    ...overrides
  };
}

test("saubere menschliche Zeile wird zu einem Record mit Split", () => {
  const ergebnis = baueKorpusRecord({ zeile: zeile(), quelle: QUELLE, fingerabdruck: FINGERABDRUCK, fingerprintKey: KEY });
  assert.equal(ergebnis.ok, true, JSON.stringify(ergebnis.gruende));
  assert.ok(["train", "validation", "test"].includes(ergebnis.record.split));
  assert.equal(ergebnis.record.messages.length, 2);
});

test("eine Testfrage aus der Pruefsuite wird abgewiesen", () => {
  // Das ist die harte Regel "Testdaten NIE ins Training", mechanisch geprueft:
  // der Prompt eines echten Suite-Falls darf nicht als Trainingszeile durchgehen.
  const suiteFall = SUITE.cases.find((f) => f.id === "architektur-static-first");
  const ergebnis = baueKorpusRecord({
    zeile: zeile({ messages: [
      { role: "user", content: suiteFall.prompt },
      { role: "assistant", content: "Weil die Startseite statisch schneller ist." }
    ] }),
    quelle: QUELLE,
    fingerabdruck: FINGERABDRUCK,
    fingerprintKey: KEY
  });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.gruende.includes("suite_prompt_ueberschneidung"), ergebnis.gruende.join(","));
});

test("das Verunreinigungs-Tor sperrt bei fehlendem Fingerabdruck statt durchzuwinken", () => {
  assert.equal(pruefeVerunreinigung("beliebiger Text", null).sauber, false);
  assert.equal(pruefeVerunreinigung("beliebiger Text", { gramme: new Set(), werte: new Set() }).sauber, false);
});

test("'smejj.com' allein loest das Tor NICHT aus", () => {
  // Sonst waere ausgerechnet der wichtigste Teil eines Projektkorpus gesperrt.
  const ergebnis = pruefeVerunreinigung("Die Plattform heisst smejj.com und wird klein geschrieben.", FINGERABDRUCK);
  assert.equal(ergebnis.sauber, true, ergebnis.gruende.join(","));
});

test("ein ausdruecklich unterscheidender Erwartungswert loest das Tor aus", () => {
  const mitWert = baueSuiteFingerabdruck(SUITE, { unterscheidendeWerte: ["2500 ms"] });
  assert.equal(pruefeVerunreinigung("Das Budget betraegt 2500 ms.", mitWert).sauber, false);
});

test("Zeile mit Zugangsdaten faellt durch die Sanitization", () => {
  const ergebnis = baueKorpusRecord({
    zeile: zeile({ messages: [
      { role: "user", content: "Mein Schluessel ist ghp_abcdefghijklmnopqrstuvwxyz012345 — passt das?" },
      { role: "assistant", content: "Bitte niemals Schluessel teilen." }
    ] }),
    quelle: QUELLE,
    fingerabdruck: FINGERABDRUCK,
    fingerprintKey: KEY
  });
  // Der Filter ersetzt den Token; der Record darf entstehen, aber ohne Klartext.
  if (ergebnis.ok) {
    const text = ergebnis.record.messages.map((n) => n.content).join(" ");
    assert.ok(!text.includes("ghp_abcdefghijklmnopqrstuvwxyz012345"));
    assert.ok(ergebnis.record.redactions.length > 0);
  } else {
    assert.ok(ergebnis.gruende.includes("sanitization_nicht_bestanden"));
  }
});

test("alle Zeilen einer Quellgruppe landen im selben Split (keine Leckage)", () => {
  const a = korpusFamilienFingerabdruck({ datasetId: QUELLE.datasetId, revision: QUELLE.revision, gruppe: "baum-9" }, KEY);
  const b = korpusFamilienFingerabdruck({ datasetId: QUELLE.datasetId, revision: QUELLE.revision, gruppe: "baum-9" }, KEY);
  assert.equal(a, b);
  const c = korpusFamilienFingerabdruck({ datasetId: QUELLE.datasetId, revision: QUELLE.revision, gruppe: "baum-10" }, KEY);
  assert.notEqual(a, c);
});

test("Korpus ohne Trainingsanteil ist fail-closed, nicht 'leer aber ok'", () => {
  const ergebnis = baueKorpus({ zeilen: [], quelle: QUELLE, fingerabdruck: FINGERABDRUCK, fingerprintKey: KEY });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.gruende.includes("korpus_ohne_trainingsanteil"));
  assert.equal(ergebnis.manifest.promotionStatus, "not-approved");
});

test("Manifest zaehlt Ablehnungsgruende, ohne Inhalte weiterzutragen", () => {
  const ergebnis = baueKorpus({
    zeilen: [zeile({ id: "a", gruppe: "g1" }), zeile({ id: "b", gruppe: "g2", synthetic: true })],
    quelle: QUELLE,
    fingerabdruck: FINGERABDRUCK,
    fingerprintKey: KEY
  });
  assert.equal(ergebnis.manifest.abgelehnt.zeile_ist_synthetisch, 1);
  assert.equal(ergebnis.manifest.anzahl, 1);
  assert.equal(JSON.stringify(ergebnis.manifest).includes("Schleife"), false);
});
