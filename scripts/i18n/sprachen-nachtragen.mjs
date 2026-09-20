#!/usr/bin/env node
// smejj.com — traegt neue Uebersetzungsschluessel in ALLE Sprachdateien nach.
//
// WARUM: tests/i18n-ui.test.mjs verlangt in jeder Nicht-de-Sprache denselben
// Schluesselsatz. Wer nur en.js pflegt, macht die Testreihe rot — und die
// uebrigen 13 Sprachen zeigen still weiter Deutsch. Dieses Skript nimmt eine
// Tabelle { schluessel: { en: "…", es: "…", … } } und schreibt sie in einem
// Zug in alle Dateien; vorhandene Schluessel bleiben unberuehrt.
//
// Aufruf: node scripts/i18n/sprachen-nachtragen.mjs <tabelle.json> "<Kommentar>"
import { readFileSync, writeFileSync } from "node:fs";

const [, , tabelleDatei, kommentar = "Nachtrag"] = process.argv;
const tabelle = JSON.parse(readFileSync(tabelleDatei, "utf8"));
const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

for (const sprache of SPRACHEN) {
  const pfad = `public/i18n/${sprache}.js`;
  let inhalt = readFileSync(pfad, "utf8");
  let block = `  // ${kommentar}\n`;
  let neu = 0;
  for (const [schluessel, werte] of Object.entries(tabelle)) {
    if (inhalt.includes(`"${esc(schluessel)}":`)) continue;
    const wert = werte[sprache];
    if (!wert) { console.error(`FEHLT ${sprache}: ${schluessel}`); process.exit(1); }
    block += `  "${esc(schluessel)}": "${esc(wert)}",\n`;
    neu += 1;
  }
  if (!neu) { console.log(`${sprache}: nichts Neues`); continue; }
  inhalt = inhalt.replace("export default {\n", `export default {\n${block}`);
  writeFileSync(pfad, inhalt);
  console.log(`${sprache}: ${neu} Schluessel ergaenzt`);
}
