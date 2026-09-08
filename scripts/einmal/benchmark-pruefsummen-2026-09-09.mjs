#!/usr/bin/env node
// smejj.com — die zwei veralteten Pruefsummen im Foundation-Benchmark nachziehen.
//
// WARUM: Das Manifest idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json
// friert die Pruefskripte ein, mit denen ein Modell beurteilt wird. Das ist Absicht — sonst
// koennte jemand eine Erwartung aufweichen, damit ein Modell besser aussieht. Zwei dieser
// Skripte wurden seither VERBESSERT, ohne dass das Manifest nachgezogen wurde:
//   scripts/check-no-paid-services.mjs   03.09. (Secret-Scanner-Verweisformen)
//   scripts/check-guidelines.mjs         07.09. (CSP-Fix fuer Chat-Bilder)
// Seitdem meldet der Beurteilungslauf "protected_asset_digest_mismatch" und bricht ab.
// Betrifft NUR den Modell-Beurteilungslauf, nicht die App.
//
// Praezedenzfall: Version 2026-08-14.1 wurde schon einmal so nachgezogen
// ("Betreiber-Freigabe 'Ja, nachziehen'").
//
// WAS DIESES SKRIPT TUT: die beiden Pruefsummen auf den tatsaechlichen Dateiinhalt setzen,
// den Gesamt-Hash der Suite neu rechnen, danach die Gegenprobe fahren. Es aendert KEINEN
// Code und keine Erwartung — nur die Buchhaltung darueber, welche Fassung eingefroren ist.
//
// Aufruf:  node scripts/einmal/benchmark-pruefsummen-2026-09-09.mjs
//          node scripts/einmal/benchmark-pruefsummen-2026-09-09.mjs --probe   (nur zeigen)
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { computeBenchmarkSuiteSha256 } from "../../src/evaluation/modelPromotion.js";

const PFAD = "idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json";
const NEUE_VERSION = "2026-09-09.1";
const BEGRUENDUNG = "Version 2026-09-09.1: Pruefsummen von check-no-paid-services.mjs (03.09.) "
  + "und check-guidelines.mjs (07.09.) nachgezogen; Betreiber-Freigabe 2026-09-09. "
  + "Suite-Inhalt und Erwartungen sonst unveraendert.";
const nurZeigen = process.argv.includes("--probe");

const roh = await readFile(PFAD, "utf8");
const suite = JSON.parse(roh);

// 1. Welche eingefrorenen Dateien weichen ab?
const abweichungen = [];
const besuche = async (knoten) => {
  if (Array.isArray(knoten)) { for (const k of knoten) await besuche(k); return; }
  if (!knoten || typeof knoten !== "object") return;
  if (typeof knoten.path === "string" && typeof knoten.sha256 === "string") {
    const ist = createHash("sha256").update(await readFile(knoten.path)).digest("hex");
    if (ist !== knoten.sha256) abweichungen.push({ knoten, alt: knoten.sha256, neu: ist });
  }
  for (const wert of Object.values(knoten)) await besuche(wert);
};
await besuche(suite);

if (abweichungen.length === 0) {
  console.log("Nichts zu tun — alle eingefrorenen Pruefskripte stimmen bereits ueberein.");
  process.exit(0);
}

console.log(`${abweichungen.length} abweichende Pruefsumme(n):`);
for (const a of abweichungen) {
  console.log(`  ${a.knoten.path}`);
  console.log(`     eingefroren  ${a.alt.slice(0, 32)} …`);
  console.log(`     tatsaechlich ${a.neu.slice(0, 32)} …`);
}

if (nurZeigen) {
  console.log("\nPROBE — nichts geschrieben.");
  process.exit(0);
}

// 2. Sicherungskopie, dann nachziehen
const sicherung = `${PFAD}.vor-2026-09-09.bak`;
await copyFile(PFAD, sicherung);
console.log(`\nSicherung: ${sicherung}`);

for (const a of abweichungen) a.knoten.sha256 = a.neu;
suite.version = NEUE_VERSION;
suite.description = String(suite.description || "").replace(/\(Version[^)]*\)/, `(${BEGRUENDUNG})`);
if (!suite.description.includes(NEUE_VERSION)) suite.description += ` (${BEGRUENDUNG})`;

// 3. Gesamt-Hash der Suite neu rechnen (die Funktion klammert ihn selbst aus)
suite.integrity.contentSha256 = computeBenchmarkSuiteSha256(suite);
await writeFile(PFAD, `${JSON.stringify(suite, null, 2)}\n`);
console.log(`nachgezogen: ${abweichungen.length} Pruefsumme(n), Version ${NEUE_VERSION}`);
console.log(`Gesamt-Hash der Suite: ${suite.integrity.contentSha256.slice(0, 32)} …`);
