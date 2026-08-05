#!/usr/bin/env node
// smejj.com — baut den Erstpartei-Trainingskorpus aus der eigenen Dokumentation.
//
// Trockenlauf (Standard, schreibt nichts):
//   node scripts/training/build_project_corpus.mjs
// Auf IDrive e2 ablegen:
//   CONFIRM_CORPUS_UPLOAD=YES node scripts/training/build_project_corpus.mjs
//
// Die Antworten sind woertliche Abschnitte aus der Dokumentation des
// Betreibers (siehe src/training/projectcorpus/extract.js) — kein Satz stammt
// aus einem Sprachmodell. Jede Zeile durchlaeuft Sanitization, das
// Lizenz-/Urheberschafts-Tor und das Verunreinigungs-Tor gegen die Pruefsuite.

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { baueKorpus } from "../../src/training/opencorpus/corpus.js";
import { baueSuiteFingerabdruck } from "../../src/training/opencorpus/contamination.js";
import { zeilenAusDokument } from "../../src/training/projectcorpus/extract.js";
import { signedS3Request } from "../../workers/glm-salad/s3.js";
import { idriveConfigFromEnv } from "../../workers/maus-engine/artifact-uploader.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Quellen. Bewusst eine ausdrueckliche Liste und kein Rundumschlag ueber alle
 * Markdown-Dateien: Task Capsules sind laut Richtlinie ausdruecklich KEINE
 * Trainingsdaten, und Benchmarks/Berichte sind Messwerte, kein Projektwissen.
 */
const QUELLEN = Object.freeze([
  "AI_Guidelines.md",
  "Project_Goals.md",
  "README.md",
  // Die Traeger von Roter Liste, Change-Lock und Autonomie-Charta. Vier der
  // sechs am 2026-08-05 durchgefallenen Pruefaelle betreffen genau diese
  // Regeln — sie fehlten als Quellen (TRAININGSKORPUS_VERMESSUNG_2026-08-05).
  "MASTER_PROMPT.md",
  "AGENTS.md",
  "docs/architecture",
  "docs/frontend",
  "docs/deployment",
  "docs/security"
]);

/**
 * Datei-spezifische Zerleger-Optionen. MASTER_PROMPT.md traegt seinen
 * gesamten Inhalt in einem ```text-Kopier-Zaun und gliedert mit
 * ====-Rahmen — ohne Sonderbehandlung liefert es genau 1 Fakt.
 */
const SONDERBEHANDLUNG = Object.freeze({
  "MASTER_PROMPT.md": Object.freeze({ textZaeuneTransparent: true })
});

/** Ausdruecklich ausgeschlossen, auch wenn sie unter den Quellen liegen. */
const AUSGESCHLOSSEN = [/task-capsules/i, /benchmarks/i, /CHANGELOG/i];

/**
 * Systemzeile. Woertlich dieselbe wie in der Pruefsuite — das Modell soll
 * unter genau der Anweisung lernen, unter der es spaeter gemessen wird.
 * Kopiert aus evals/suites/smejj-chat-core-v1.json, nicht neu formuliert.
 */
const SYSTEM_TEXT = "Du bist der Assistent von smejj.com, einem AI Autonomous Coding OS. "
  + "Der Plattformname wird ausnahmslos als smejj.com geschrieben. Antworte auf Deutsch, kurz und praezise.";

function sammleDateien(eintrag) {
  const voll = path.join(REPO, eintrag);
  let s;
  try { s = statSync(voll); } catch { return []; }
  if (s.isFile()) return voll.endsWith(".md") ? [voll] : [];
  const gefunden = [];
  for (const name of readdirSync(voll)) {
    gefunden.push(...sammleDateien(path.join(eintrag, name)));
  }
  return gefunden;
}

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function main() {
  loadSecureLocalEnv();

  const suite = JSON.parse(readFileSync(path.join(REPO, "evals/suites/smejj-chat-core-v1.json"), "utf8"));
  // Ausdruecklich unterscheidende Erwartungswerte: Zahlen und Kennungen, die
  // fuer sich genommen schon eine Testantwort verraten. Bewusst eine sichtbare
  // Liste — welcher Wert verraeterisch ist, ist eine inhaltliche Entscheidung.
  const fingerabdruck = baueSuiteFingerabdruck(suite, { unterscheidendeWerte: [] });

  const dateien = [...new Set(QUELLEN.flatMap(sammleDateien))]
    .filter((d) => !AUSGESCHLOSSEN.some((muster) => muster.test(d)));

  const zeilen = [];
  for (const datei of dateien) {
    const rel = path.relative(REPO, datei);
    zeilen.push(...zeilenAusDokument({
      pfad: rel,
      inhalt: readFileSync(datei, "utf8"),
      systemText: SYSTEM_TEXT,
      optionen: SONDERBEHANDLUNG[rel]
    }));
  }

  const revision = gitRevision();
  if (!revision) throw new Error("git_revision_nicht_ermittelbar");

  const fingerprintKey = leseFingerprintKey();
  const ergebnis = baueKorpus({
    zeilen,
    quelle: {
      datasetId: "smejj.com/projektwissen",
      revision,
      license: "first-party-owned",
      authorship: "human-first-party",
      licenseUrl: "Eigene Dokumentation des Betreibers, Repository smejj.com-app"
    },
    fingerabdruck,
    fingerprintKey
  });

  console.log(`Dateien: ${dateien.length}`);
  console.log(`Rohzeilen: ${zeilen.length}`);
  console.log(`Records: ${ergebnis.manifest.anzahl}`);
  console.log(`Split: train=${ergebnis.manifest.proSplit.train} validation=${ergebnis.manifest.proSplit.validation} test=${ergebnis.manifest.proSplit.test}`);
  console.log(`Abgelehnt: ${JSON.stringify(ergebnis.manifest.abgelehnt)}`);
  if (!ergebnis.ok) {
    console.error(`FEHLER: ${ergebnis.gruende.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (process.env.CONFIRM_CORPUS_UPLOAD !== "YES") {
    console.log("\nTrockenlauf — nichts geschrieben. Zum Ablegen: CONFIRM_CORPUS_UPLOAD=YES");
    const beispiel = ergebnis.records.find((r) => r.split === "train");
    if (beispiel) {
      console.log("\nBeispielzeile (train):");
      console.log(`  Frage:   ${beispiel.messages[1].content}`);
      console.log(`  Antwort: ${beispiel.messages[2].content.slice(0, 200).replace(/\n/g, " ")}...`);
    }
    return;
  }

  await lege(ergebnis, revision);
}

function leseFingerprintKey() {
  const roh = process.env.SMEJJ_TRAINING_FINGERPRINT_KEY || "";
  if (/^[0-9a-f]{64}$/i.test(roh)) return Buffer.from(roh, "hex");
  // Kein Zufallsschluessel: der Familien-Fingerabdruck muss ueber Laeufe hinweg
  // stabil sein, sonst wechseln Dokumente bei jedem Bau den Split und
  // Trainings- und Testteil vermischen sich ueber die Zeit.
  return crypto.createHash("sha256").update("smejj-1.0-projektkorpus-familie-v1").digest();
}

async function lege(ergebnis, revision) {
  const config = idriveConfigFromEnv(process.env);
  const basis = `datasets/smejj-1-0/projektwissen/${revision.slice(0, 12)}`;
  for (const split of ["train", "validation", "test"]) {
    const zeilen = ergebnis.records
      .filter((r) => r.split === split)
      .map((r) => JSON.stringify({ messages: r.messages, recordId: r.recordId }))
      .join("\n");
    if (!zeilen) continue;
    await signedS3Request(config, "PUT", `${basis}/${split}.jsonl`, `${zeilen}\n`, "application/x-ndjson; charset=utf-8");
    console.log(`abgelegt: ${basis}/${split}.jsonl`);
  }
  await signedS3Request(config, "PUT", `${basis}/manifest.json`,
    `${JSON.stringify(ergebnis.manifest, null, 2)}\n`, "application/json; charset=utf-8");
  console.log(`abgelegt: ${basis}/manifest.json`);
  console.log(`\nSMEJJ_LORA_DATENSATZ_SCHLUESSEL=${basis}/train.jsonl`);
  console.log(`SMEJJ_LORA_DATENSATZ_MANIFEST=${basis}/manifest.json`);
}

main().catch((error) => {
  console.error(`FEHLER: ${String(error?.stack || error)}`);
  process.exitCode = 1;
});
