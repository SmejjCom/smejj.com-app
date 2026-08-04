#!/usr/bin/env node
// smejj.com — Inhalts-Hash einer Eval-Suite nachrechnen und eintragen.
//
// Noetig nach JEDER Aenderung an einer Suite oder einem ihrer Pakete: die Suite
// wird sonst fail-closed abgelehnt (eval_suite_integrity_mismatch). Genau das ist
// gewollt — der Hash ist der Beweis, dass niemand still eine Erwartung
// aufgeweicht hat, um ein Modell besser aussehen zu lassen.
//
//   node scripts/evaluation/rehash_eval_suite.mjs evals/suites/smejj-chat-breit-v1.json
//   node scripts/evaluation/rehash_eval_suite.mjs --check evals/suites/*.json
//
// Ohne --check wird der Hash in die Datei geschrieben. Mit --check wird nur
// verglichen und bei Abweichung mit Exit-Code 1 beendet (fuer die Pflicht-Checks).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeEvalSuiteSha256, validateEvalSuite } from "../../src/evaluation/evalSuite.js";
import { loadEvalSuite } from "../../src/evaluation/evalPacks.js";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const dateien = argv.filter((arg) => arg !== "--check");

if (dateien.length === 0) {
  process.stderr.write("Aufruf: rehash_eval_suite.mjs [--check] <suite.json> [...]\n");
  process.exit(2);
}

let fehler = 0;
for (const datei of dateien) {
  const absolut = path.resolve(datei);
  // Manifest wie im echten Lauf expandieren — zwei Rechenwege waeren eine Fehlerquelle.
  const { suite } = await loadEvalSuite(absolut);
  const berechnet = computeEvalSuiteSha256(suite);
  const eingetragen = suite?.integrity?.contentSha256 || "";

  if (berechnet === eingetragen) {
    // Auch bei stimmigem Hash die volle Validierung zeigen — ein Hash ueber eine
    // strukturell kaputte Suite ist kein Guetesiegel.
    const validation = validateEvalSuite(suite);
    if (!validation.ok) {
      process.stderr.write(`FEHLER ${datei}: Hash stimmt, Suite trotzdem ungueltig — ${validation.reasons.join(", ")}\n`);
      fehler += 1;
      continue;
    }
    process.stdout.write(`OK ${datei} — ${suite.cases.length} Faelle, sha256 ${berechnet.slice(0, 12)}…\n`);
    continue;
  }

  if (checkOnly) {
    process.stderr.write(`ABWEICHUNG ${datei}: eingetragen ${eingetragen.slice(0, 12)}…, berechnet ${berechnet.slice(0, 12)}…\n`);
    fehler += 1;
    continue;
  }

  // In die DATEI auf der Platte schreiben, nicht in die expandierte Fassung:
  // bei einem Manifest bleibt die Datei ein Manifest.
  const roh = JSON.parse(await readFile(absolut, "utf8"));
  roh.integrity = { ...roh.integrity, contentSha256: berechnet };
  await writeFile(absolut, `${JSON.stringify(roh, null, 2)}\n`, "utf8");

  // Nach dem Schreiben beweisen, dass das Ergebnis wirklich validiert.
  const { suite: neu } = await loadEvalSuite(absolut);
  const validation = validateEvalSuite(neu);
  if (!validation.ok) {
    process.stderr.write(`FEHLER ${datei}: nach Hash-Eintrag ungueltig — ${validation.reasons.join(", ")}\n`);
    fehler += 1;
    continue;
  }
  process.stdout.write(`AKTUALISIERT ${datei} — ${neu.cases.length} Faelle, sha256 ${berechnet.slice(0, 12)}…\n`);
}

process.exit(fehler > 0 ? 1 : 0);
