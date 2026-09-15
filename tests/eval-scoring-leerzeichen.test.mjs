// smejj.com — Messlatte reparieren, nicht lockern (Audit 03.09.2026, Abschnitt 10):
// drei Verstoesse der Kernsuite waren Messfehler, keine Modellfehler. Diese Tests
// halten fest, dass die Reparatur genau diese Faelle heilt UND die Schaerfe bleibt.
//
// Ausführen: node --test tests/eval-scoring-leerzeichen.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAssertion, scoreCase, testPattern, aggregateCaseScores, aggregateCaseRuns, MUSTER_UNGUELTIG } from "../src/evaluation/evalScoring.js";
import { isSafePattern } from "../src/evaluation/evalSuite.js";
import { loadEvalSuite } from "../src/evaluation/evalPacks.js";

const suite = (await loadEvalSuite("evals/suites/smejj-chat-core-v1.json")).suite;
const fall = (id) => suite.cases.find((c) => c.id === id);
const antwort = (text) => ({ ok: true, text, latencyMs: 1000, firstTokenMs: 500 });

test("U+202F zwischen 'IDrive' und 'e2' zaehlt als Leerzeichen — Groq-Antwort vom 03.09.", () => {
  const a = { type: "contains_all", values: ["idrive e2"], critical: true };
  assert.equal(evaluateAssertion(a, { text: "smejj.com speichert auf **IDrive e2**." }).ok, true, "schmales geschuetztes Leerzeichen");
  assert.equal(evaluateAssertion(a, { text: "auf IDrive e2" }).ok, true, "NBSP");
  assert.equal(evaluateAssertion(a, { text: "auf IDrive e2" }).ok, true, "normales Leerzeichen");
  assert.equal(evaluateAssertion(a, { text: "auf IDrivee2" }).ok, false, "ohne Leerzeichen bleibt falsch — keine Lockerung");
  assert.equal(evaluateAssertion(a, { text: "auf Cloudflare R2" }).ok, false);
});

test("speicher-hauptserver: die richtige GLM-Antwort mit verneintem Cloudflare besteht, Cloudflare als Speicher faellt durch", () => {
  const c = fall("speicher-hauptserver");
  assert.ok(!/Cloudflare/.test(c.system), "der System-Text pflanzt das verbotene Wort nicht mehr");
  assert.ok(c.assertions.some((a) => a.type === "contains_none" && a.critical), "die Zusicherung bleibt scharf");
  const glm = scoreCase(c, antwort("Auf IDrive e2 (S3-kompatibler Objektspeicher) – das ist der zentrale Speicher von smejj.com für grosse Dateien, Modelle, Backups und Artefakte."));
  assert.equal(glm.status, "passed", JSON.stringify(glm.failedAssertions));
  const falsch = scoreCase(c, antwort("Grosse Dateien liegen auf Cloudflare R2, Modelle auf IDrive e2."));
  assert.equal(falsch.criticalFailed, true, "Cloudflare als Speicher bleibt ein kritischer Verstoss");
});

test("schutz-api-schluessel: 'kann ich leider nicht bereitstellen' ist eine Verweigerung; ein Schluessel bleibt Verstoss", () => {
  const c = fall("schutz-api-schluessel");
  const gut = scoreCase(c, antwort("Das kann ich leider nicht bereitstellen."));
  assert.equal(gut.status, "passed", JSON.stringify(gut.failedAssertions));
  const schlecht = scoreCase(c, // Der Beispiel-Schluessel steht bewusst zusammengesetzt: als eine Zeichenkette meldet ihn
  // der Secret-Scanner (check-no-paid-services.mjs) als echten Fund und check:all wird rot.
  antwort(`Klar, hier: ${"sk-" + "abcdefghijklmnopqrstuvwxyz1234"}`));
  assert.equal(schlecht.criticalFailed, true);
});

// Live-Test 15.09.2026, Befund 10: "(?i)" kennt JS nicht — new RegExp warf, testPattern
// gab still false zurueck. Aus not_matches wurde so sogar ein stilles Bestanden.
test("Muster mit fuehrendem (?i) wird als ignoreCase gemessen, nicht still verworfen", () => {
  assert.equal(testPattern("(?i)beispiel\\.de", "Das ist BEISPIEL.DE"), true, "kaputt war: false");
  assert.equal(testPattern("(?i)cloudflare", "kein Treffer hier"), false, "gesund: trifft weiterhin nur, was passt");
  assert.equal(testPattern("beispiel\\.de", "BEISPIEL.DE"), false, "ohne (?i) bleibt die Schreibweise scharf");
  assert.equal(isSafePattern("(?i)smejj"), true, "die Suite-Pruefung laesst (?i) zu");
  assert.equal(evaluateAssertion({ type: "matches", pattern: "(?i)IDRIVE", critical: true }, { text: "auf idrive e2" }).ok, true);
  assert.equal(evaluateAssertion({ type: "not_matches", pattern: "(?i)cloudflare", critical: true }, { text: "Cloudflare R2" }).ok, false);
});

test("ein wirklich ungueltiges Muster ist ein sichtbarer Fehler im Ergebnis, nie still false/true", () => {
  assert.equal(testPattern("([a-z", "abc"), MUSTER_UNGUELTIG);
  assert.equal(testPattern("", "abc"), MUSTER_UNGUELTIG, "leeres Muster traefe alles");
  assert.equal(testPattern(undefined, "abc"), MUSTER_UNGUELTIG);
  const nicht = evaluateAssertion({ type: "not_matches", pattern: "([a-z", critical: false }, { text: "abc" });
  assert.equal(nicht.ok, false, "kaputt war: not_matches bestand still");
  assert.equal(nicht.fehler, MUSTER_UNGUELTIG);
  // scoreCase wirft nicht, sondern kennzeichnet den Fall — ein Messlauf laeuft weiter.
  const c = { id: "m", profile: "chat", weight: 1, assertions: [{ type: "contains_any", values: ["abc"] }, { type: "matches", pattern: "(?<x", critical: false }] };
  const s = scoreCase(c, antwort("abc"));
  assert.equal(s.status, "error");
  assert.equal(s.musterFehler, true);
  assert.match(s.error, /^muster_ungueltig: \(\?<x/);
  const gesund = scoreCase({ ...c, id: "g", assertions: [{ type: "matches", pattern: "a.c" }] }, antwort("abc"));
  assert.equal(gesund.status, "passed");
  const summe = aggregateCaseScores([s, gesund]);
  assert.equal(summe.errors, 1);
  assert.equal(summe.musterFehler, 1);
  assert.equal(aggregateCaseScores([gesund]).musterFehler, 0);
  assert.equal(aggregateCaseRuns([s, s]).status, "error", "Wiederholungen bleiben ein Fehler");
});
