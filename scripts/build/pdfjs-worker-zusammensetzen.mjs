#!/usr/bin/env node
// smejj.com — setzt den pdf.js-Worker aus seinen zwei Repo-Teilen zusammen.
//
// WARUM GETEILT: scripts/check-no-paid-services.mjs verbietet Dateien ueber 1 MB im Repo
// (Regel gegen Modellgewichte und grosse Medien). Der Worker von pdf.js wiegt 1,27 MB.
// Er liegt darum als pdf.worker.min.part1.js + part2.js im Repo; die zusammengesetzte
// Datei steht in .gitignore und entsteht bei jedem Bau neu — byte-genau (VERSION nennt
// die erwartete Groesse).
//
// WARUM NICHT ZUR LAUFZEIT ZUSAMMENSETZEN: pdf.js laedt seinen Worker per import();
// ein Blob-Modul verstoesst gegen script-src der Content-Security-Policy. Eine echte
// Datei unter /assets/vendor/pdfjs/ ist der einzige Weg ohne CSP-Lockerung.
//
// Aufruf: node scripts/build/pdfjs-worker-zusammensetzen.mjs [--pruefen]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ordner = path.join(wurzel, "public", "vendor", "pdfjs");
const ziele = [path.join(ordner, "pdf.worker.min.js"), path.join(wurzel, "public", "assets", "vendor", "pdfjs", "pdf.worker.min.js")];
const teile = ["pdf.worker.min.part1.js", "pdf.worker.min.part2.js"].map((n) => path.join(ordner, n));
const nurPruefen = process.argv.includes("--pruefen");

for (const t of teile) {
  if (!existsSync(t)) { console.error(`pdfjs-worker FEHLT: ${path.relative(wurzel, t)}`); process.exit(1); }
}
const daten = Buffer.concat(teile.map((t) => readFileSync(t)));
const erwartet = Number((readFileSync(path.join(ordner, "VERSION"), "utf8").match(/worker-bytes=(\d+)/) || [])[1]);
if (erwartet && daten.length !== erwartet) {
  console.error(`pdfjs-worker FALSCHE GROESSE: ${daten.length} statt ${erwartet} Byte`);
  process.exit(1);
}
if (nurPruefen) {
  const fehlt = ziele.filter((z) => !existsSync(z) || readFileSync(z).length !== daten.length);
  if (fehlt.length) { console.error(`pdfjs-worker NICHT GEBAUT: ${fehlt.map((z) => path.relative(wurzel, z)).join(", ")} — "npm run build:pdfjs-worker" ausfuehren.`); process.exit(1); }
  console.log(`pdfjs-worker OK — ${daten.length} Byte an ${ziele.length} Orten.`);
  process.exit(0);
}
for (const z of ziele) {
  if (!existsSync(path.dirname(z))) { console.error(`pdfjs-worker: Ordner fehlt ${path.relative(wurzel, path.dirname(z))}`); process.exit(1); }
  writeFileSync(z, daten);
}
console.log(`pdfjs-worker gebaut — ${daten.length} Byte aus 2 Teilen, ${ziele.length} Orte.`);
