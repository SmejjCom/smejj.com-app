#!/usr/bin/env node
// smejj.com Datensatzbau — CLI (Single Responsibility: Quellenpaket lesen,
// Datensatz bauen, Bericht schreiben). Die Entscheidungen liegen in
// src/training/datensatzbau.js; hier steht nur Ein- und Ausgabe.
//
// Aufruf:
//   node scripts/training/baue_smejj_datensatz.mjs \
//     --quellen datensaetze/quellen/smejj-1-1/batch-01 \
//     --ausgabe ops/datensaetze/smejj-1-1/v2026.08.30 \
//     --version v2026.08.30
//
// Quellenpaket (Format, siehe datensaetze/quellen/README.md):
//   paare.jsonl    — {frage, antwort, quelle, einwilligung, familie}
//   personen.txt   — eine Person/Kennung je Zeile (leere Datei erlaubt)
//
// fail-closed: ohne Fingerabdruck-Schluessel (SMEJJ_TRAINING_FINGERPRINT_KEY_ID
// + _B64), ohne paare.jsonl oder mit LEEREM Ergebnis wird nichts geschrieben.
// Der Upload passiert bewusst NICHT hier, sondern nur über
// scripts/training/lade_datensatz_hoch.mjs mit eigener Bestätigung.

import fs from "node:fs";
import path from "node:path";
import { baueDatensatz, pruefeVollstaendigkeit, STANDARD_SYSTEMPROMPT } from "../../src/training/datensatzbau.js";
import { trainingFingerprintConfig } from "../../src/training/encryption.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

const quellenDir = argument("quellen");
const ausgabeDir = argument("ausgabe");
const version = argument("version");

if (!quellenDir || !ausgabeDir || !version) {
  console.error("Verwendung: baue_smejj_datensatz.mjs --quellen <dir> --ausgabe <dir> --version vJJJJ.MM.TT");
  process.exit(1);
}

const fingerprintConfig = trainingFingerprintConfig(process.env);
if (!fingerprintConfig.ready) {
  console.error("ABBRUCH: SMEJJ_TRAINING_FINGERPRINT_KEY_ID / _B64 fehlen oder passen nicht (32 Byte, base64)."
    + " Ohne Familien-Fingerprints kein Datensatz.");
  process.exit(1);
}

const paarePfad = path.join(quellenDir, "paare.jsonl");
if (!fs.existsSync(paarePfad)) {
  console.error(`ABBRUCH: ${paarePfad} fehlt.`);
  process.exit(1);
}
const personenPfad = path.join(quellenDir, "personen.txt");
const personen = fs.existsSync(personenPfad)
  ? fs.readFileSync(personenPfad, "utf8").split(/\r?\n/).map((z) => z.trim()).filter(Boolean)
  : [];

const quelPaare = [];
let zeilenNr = 0;
for (const roh of fs.readFileSync(paarePfad, "utf8").split(/\r?\n/)) {
  zeilenNr += 1;
  const text = roh.trim();
  if (!text) continue;
  try {
    quelPaare.push(JSON.parse(text));
  } catch {
    console.error(`ABBRUCH: paare.jsonl Zeile ${zeilenNr} ist kein gueltiges JSON.`);
    process.exit(1);
  }
}

let datensatz;
try {
  datensatz = baueDatensatz(quelPaare, {
    fingerprintKey: fingerprintConfig.key,
    personen,
    versionId: version
  });
} catch (fehler) {
  console.error(`ABBRUCH: ${String(fehler?.message || fehler)}`);
  process.exit(1);
}

const vollstaendigkeit = pruefeVollstaendigkeit(datensatz);
if (!vollstaendigkeit.vollstaendig) {
  console.error(`ABBRUCH: leere Splits (${vollstaendigkeit.fehlt.join(", ")}) — mehr Quelldaten nötig,`
    + " sonst ist ein Split ohne Inhalt zufaellig und die Suite misst Zufall.");
  process.exit(1);
}

fs.mkdirSync(ausgabeDir, { recursive: true });
for (const [name, paare] of [
  ["train.jsonl", datensatz.train],
  ["validation.jsonl", datensatz.validation],
  ["test.jsonl", datensatz.test]
]) {
  const koerper = paare.map((p) => JSON.stringify({ messages: p.messages })).join("\n") + "\n";
  fs.writeFileSync(path.join(ausgabeDir, name), koerper, "utf8");
}
fs.writeFileSync(path.join(ausgabeDir, "manifest.json"),
  `${JSON.stringify(datensatz.manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(ausgabeDir, "quarantaene.jsonl"),
  datensatz.quarantaene.map((q) => JSON.stringify(q)).join("\n") + (datensatz.quarantaene.length ? "\n" : ""), "utf8");

const bericht = [
  "# Datensatz-Bericht",
  "",
  `- Datensatz: ${datensatz.manifest.datasetId} @ ${datensatz.manifest.versionId}`,
  `- Gesamt: ${datensatz.manifest.gesamt} Paare (train ${datensatz.manifest.proSplit.train},`
    + ` validation ${datensatz.manifest.proSplit.validation}, test ${datensatz.manifest.proSplit.test})`,
  `- Quarantaene: ${datensatz.manifest.quarantaeneAnzahl}`,
  `- Split-Seed: ${datensatz.manifest.splitSeed} (deterministisch, neustartfest)`,
  `- Systemprompt: ${STANDARD_SYSTEMPROMPT.slice(0, 80)}...`,
  "",
  "## Quarantaene-Gruende",
  "",
  ...(datensatz.quarantaene.length
    ? datensatz.quarantaene.map((q) => `- ${q.grund} (quelle: ${q.quelle ?? "-"})`)
    : ["- keine"]),
  "",
  "Naechster Schritt (nur mit Bestätigung): scripts/training/lade_datensatz_hoch.mjs"
].join("\n");
fs.writeFileSync(path.join(ausgabeDir, "bericht.md"), `${bericht}\n`, "utf8");

console.log(`FERTIG: ${datensatz.manifest.gesamt} Paare`
  + ` (train ${datensatz.manifest.proSplit.train}, validation ${datensatz.manifest.proSplit.validation},`
  + ` test ${datensatz.manifest.proSplit.test}), ${datensatz.manifest.quarantaeneAnzahl} Quarantaene`);
console.log(`Ausgabe: ${ausgabeDir}`);
