#!/usr/bin/env node
// smejj.com — macht feste deutsche Oberflaechentexte uebersetzbar.
//
// WARUM ES DIESES WERKZEUG GIBT (Inventur 20.09.2026): Rund 800 sichtbare
// Texte standen als feste Zeichenketten im Client und erschienen darum in
// JEDER Sprache deutsch. Von Hand ist das fehleranfaellig: der Import fehlt,
// eine Zeichenkette steht auch in einem Kommentar, oder eine Datei wird
// vergessen. Dieses Skript macht genau drei Dinge und bricht sonst ab:
//   1. Es haengt `import { t } from "<pfad>/i18n/ui.js?v=3";` an, wenn er fehlt.
//   2. Es ersetzt NUR die genannten Zeichenketten und NUR ausserhalb von
//      Kommentaren, und nur wenn sie nicht schon in t(...) stehen.
//   3. Es meldet jede Zeichenkette, die es nicht gefunden hat — statt sie
//      stillschweigend zu uebergehen.
//
// Aufruf: node scripts/i18n/uebersetzbar-machen.mjs <auftrag.json> [--probe]
// Auftrag: { "public/datei.js": ["Text eins", "Text zwei"], ... }
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , auftragDatei, ...rest] = process.argv;
if (!auftragDatei) { console.error("Aufruf: uebersetzbar-machen.mjs <auftrag.json> [--probe]"); process.exit(1); }
const probe = rest.includes("--probe");
const auftrag = JSON.parse(readFileSync(auftragDatei, "utf8"));

/** Zeichenketten in Kommentarzeilen bleiben unberuehrt. */
function istKommentar(zeile) {
  const s = zeile.trimStart();
  return s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");
}

function importPfad(datei) {
  const tiefe = datei.replace(/^public\//, "").split("/").length - 1;
  return `${tiefe === 0 ? "." : "..".concat("/..".repeat(tiefe - 1))}/i18n/ui.js?v=3`;
}

let geaendert = 0; let fehlend = 0;
for (const [datei, texte] of Object.entries(auftrag)) {
  let quelle = readFileSync(datei, "utf8");
  const vorher = quelle;
  if (!/from "\.{1,2}[^"]*i18n\/ui\.js/.test(quelle)) {
    const marke = quelle.match(/^(import .+?;\n)/m);
    const zeile = `import { t } from "${importPfad(datei)}";\n`;
    quelle = marke ? quelle.replace(marke[1], marke[1] + zeile) : zeile + "\n" + quelle;
  }
  const zeilen = quelle.split("\n");
  for (const text of texte) {
    let getroffen = false;
    for (let i = 0; i < zeilen.length; i += 1) {
      if (istKommentar(zeilen[i])) continue;
      for (const q of ['"', "'"]) {
        const roh = `${q}${text}${q}`;
        if (!zeilen[i].includes(roh)) continue;
        // TEUER GELERNT (20.09.2026): ein schlichtes includes("t(" + roh + ")")
        // haelt auch `showToast("…")` fuer bereits uebersetzt — in "showToast"
        // steckt ein "t(". Deshalb muss vor dem t( ein Zeichen stehen, das
        // kein Namensteil ist.
        const schon = new RegExp(`(^|[^A-Za-z0-9_$])t\\(${q}${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${q}\\)`);
        if (schon.test(zeilen[i])) continue;
        zeilen[i] = zeilen[i].split(roh).join(`t(${roh})`);
        getroffen = true;
      }
    }
    if (!getroffen) { console.error(`  NICHT GEFUNDEN in ${datei}: ${text.slice(0, 60)}`); fehlend += 1; }
  }
  quelle = zeilen.join("\n");
  if (quelle !== vorher) { geaendert += 1; if (!probe) writeFileSync(datei, quelle); }
}
console.log(`${probe ? "PROBE — " : ""}${geaendert} Datei(en) geaendert, ${fehlend} Zeichenkette(n) nicht gefunden.`);
process.exit(fehlend ? 1 : 0);
