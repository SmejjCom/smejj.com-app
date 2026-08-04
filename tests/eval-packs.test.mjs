// smejj.com — Waechter fuer die Eval-Pakete (evalPacks.js) und die breite Suite.
//
// Ohne Netz, ohne Schluessel, ohne Kosten. Prueft drei Dinge:
// 1. Der Expander ist fail-closed: kaputte Pakete werfen, nichts faellt still heraus.
// 2. Die Kurzschreibweisen erzeugen exakt die Erwartungen, die evalScoring.js bewertet.
// 3. Die echte breite Suite auf der Platte validiert vollstaendig — inklusive Hash.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSuiteFromManifest,
  computeManifestSha256,
  expandPack,
  kategorienDerSuite,
  loadEvalSuite
} from "../src/evaluation/evalPacks.js";
import { validateEvalSuite } from "../src/evaluation/evalSuite.js";
import { evaluateAssertion, scoreCase } from "../src/evaluation/evalScoring.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BREITE_SUITE = path.join(REPO_ROOT, "evals/suites/smejj-chat-breit-v1.json");

const MINIPACK = Object.freeze({
  schemaVersion: 1,
  packId: "test-pack",
  kategorie: "testkategorie",
  standard: { profile: "default", weight: 2, maxTokens: 300, system: "Systemtext des Pakets." },
  faelle: [
    { id: "fall-eins", prompt: "Frage?", muss: ["antwort"], maxZeichen: 100 },
    { id: "fall-zwei", prompt: "Frage?", mussEines: ["a", "b"], weight: 5, system: "Eigener Systemtext." }
  ]
});

test("expandPack setzt Standardwerte und laesst Fall-Werte gewinnen", () => {
  const faelle = expandPack(structuredClone(MINIPACK));
  assert.equal(faelle.length, 2);
  assert.equal(faelle[0].profile, "default");
  assert.equal(faelle[0].weight, 2);
  assert.equal(faelle[0].system, "Systemtext des Pakets.");
  assert.equal(faelle[0].kategorie, "testkategorie");
  assert.equal(faelle[1].weight, 5);
  assert.equal(faelle[1].system, "Eigener Systemtext.");
});

test("Kurzschreibweisen erzeugen die richtigen Erwartungstypen mit richtiger Kritikalitaet", () => {
  const [fall] = expandPack({
    ...structuredClone(MINIPACK),
    faelle: [{
      id: "voll", prompt: "?",
      muss: ["x"], mussEines: ["y"], darfNicht: ["z"], mussMuster: "a+", darfNichtMuster: "b+",
      json: true, sollte: ["s"], sollteEines: ["t"], sollteNicht: ["u"], minZeichen: 5, maxZeichen: 50
    }]
  });
  const typen = fall.assertions.map((a) => `${a.type}:${a.critical ? "krit" : "weich"}`);
  assert.deepEqual(typen, [
    "contains_all:krit", "contains_any:krit", "contains_none:krit",
    "matches:krit", "not_matches:krit", "json_parses:krit",
    "contains_all:weich", "contains_any:weich", "contains_none:weich",
    "min_length:weich", "max_length:weich"
  ]);
  // Jede erzeugte Erwartung muss von evalScoring.js bewertbar sein (kein unknown).
  for (const assertion of fall.assertions) {
    const ergebnis = evaluateAssertion(assertion, { text: "xyza sstu und mehr Text" });
    assert.notEqual(ergebnis.type, "unknown");
  }
});

test("expandPack ist fail-closed: unbekanntes Feld, fehlende kritische Erwartung, leeres Paket", () => {
  assert.throws(() => expandPack({
    ...structuredClone(MINIPACK),
    faelle: [{ id: "tippfehler", prompt: "?", mussEins: ["x"] }]
  }), /eval_pack_case_unknown_field:tippfehler:mussEins/);

  assert.throws(() => expandPack({
    ...structuredClone(MINIPACK),
    faelle: [{ id: "nur-weich", prompt: "?", sollte: ["x"] }]
  }), /eval_pack_case_not_critical:nur-weich/);

  assert.throws(() => expandPack({ ...structuredClone(MINIPACK), faelle: [] }), /eval_pack_cases_missing/);
  assert.throws(() => expandPack({ ...structuredClone(MINIPACK), schemaVersion: 2 }), /eval_pack_schema_unsupported/);
});

test("buildSuiteFromManifest meldet Dubletten mit Paket-Kennung", () => {
  const manifest = { schemaVersion: 1, suiteId: "test-suite", version: "1.0.0" };
  const packA = structuredClone(MINIPACK);
  const packB = { ...structuredClone(MINIPACK), packId: "zweites-pack" };
  assert.throws(
    () => buildSuiteFromManifest(manifest, [packA, packB]),
    /eval_pack_case_id_duplicate:zweites-pack:fall-eins/
  );
});

test("ein expandierter Fall laeuft unveraendert durch scoreCase", () => {
  const [fall] = expandPack(structuredClone(MINIPACK));
  const gut = scoreCase(fall, { ok: true, text: "Die antwort ist kurz.", latencyMs: 10 });
  assert.equal(gut.status, "passed");
  const schlecht = scoreCase(fall, { ok: true, text: "Hier fehlt das Pflichtwort.", latencyMs: 10 });
  assert.equal(schlecht.score, 0);
  assert.equal(schlecht.criticalFailed, true);
});

test("die breite Suite auf der Platte validiert vollstaendig samt Hash", async () => {
  const { suite, packDateien } = await loadEvalSuite(BREITE_SUITE);
  assert.ok(packDateien.length >= 15, `erwartet mindestens 15 Pakete, gefunden ${packDateien.length}`);
  assert.ok(suite.cases.length >= 290, `erwartet mindestens 290 Faelle, gefunden ${suite.cases.length}`);

  const validation = validateEvalSuite(suite);
  assert.deepEqual(validation.reasons, []);
  assert.equal(validation.ok, true);
  assert.equal(validation.computedContentSha256, suite.integrity.contentSha256);

  // maxCasesPerRun muss alle Faelle decken — sonst faellt ein Teil der Messung
  // still weg und der Bericht sieht trotzdem vollstaendig aus.
  assert.ok(suite.budgets.maxCasesPerRun >= suite.cases.length);

  // Jede Kategorie traegt genug Faelle, um als eigene Kennzahl etwas auszusagen.
  const kategorien = kategorienDerSuite(suite);
  assert.ok(kategorien.length >= 15, `erwartet mindestens 15 Kategorien, gefunden ${kategorien.length}`);
  for (const kategorie of kategorien) {
    const anzahl = suite.cases.filter((fall) => fall.kategorie === kategorie).length;
    assert.ok(anzahl >= 10, `Kategorie ${kategorie} hat nur ${anzahl} Faelle (Minimum 10)`);
  }
});

test("computeManifestSha256 entspricht dem Hash der geladenen Suite", async () => {
  const { suite } = await loadEvalSuite(BREITE_SUITE);
  const manifest = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(BREITE_SUITE, "utf8")));
  const packs = [];
  for (const verweis of manifest.packs) {
    const datei = path.resolve(path.dirname(BREITE_SUITE), verweis);
    packs.push(JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(datei, "utf8"))));
  }
  assert.equal(computeManifestSha256(manifest, packs), suite.integrity.contentSha256);
});

test("die Eval-Fall-Kennungen der breiten Suite stehen in keinem RAG-Korpusdokument", async () => {
  // Dieselbe Antwortschluessel-Regel, die tests/rag-search.test.mjs fuer die
  // Kern-Suite prueft: kein Regeldokument darf die Fall-Kennungen samt
  // Erwartungen enthalten, sonst misst die Suite den Korpus statt das Modell.
  const { suite } = await loadEvalSuite(BREITE_SUITE);
  const { ROOT_KNOWLEDGE_FILES } = await import("../control-server/src/rag/knowledgeCorpus.js");
  const { readFile } = await import("node:fs/promises");
  for (const name of ROOT_KNOWLEDGE_FILES) {
    let text = "";
    try {
      text = await readFile(path.join(REPO_ROOT, name), "utf8");
    } catch {
      continue; // Dokument existiert (noch) nicht — dann kann es nichts verraten.
    }
    for (const fall of suite.cases) {
      assert.ok(!text.includes(fall.id), `${name} enthaelt die Fall-Kennung ${fall.id}`);
    }
  }
});
