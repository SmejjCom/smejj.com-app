// smejj.com — vergleicht das ausgelieferte Stylesheet mit dem, das der
// Bau-Zweig erzeugt. VOR jedem Frontend-Deploy laufen lassen.
//
// Der Vorfall, der zu dieser Datei fuehrte (2026-08-15):
// Auf smejj.com standen 77 Schriftgroessen und vier weitere Regeln, die es
// in KEINER Quelldatei gab — die "grosse Schrift" des Betreibers und der
// ruhige Hintergrund ohne Farbschleier. Sie lagen nur im ausgelieferten
// Buendel. Wer das Buendel aus dem Bau-Zweig darueberkopiert haette, haette
// jede Schrift auf der Seite zurueckgeschrumpft, ohne dass irgendein Test
// rot geworden waere: das Artefakt ist nicht Teil des Bau-Zweigs, also
// vergleicht es niemand.
//
// Das ist derselbe Fehler wie in docs/.../smejj-artefakt-ersetzt-nie-die-quelle,
// nur eine Stufe subtiler: dort FEHLTEN Dateien, hier stimmten die WERTE
// nicht. Ein Dateiname-Vergleich haette das nicht gefunden.
//
// Der Vergleich ist bewusst auf Regeln normalisiert, nicht byteweise: der
// Live-Stand ist im Leerraum verdichtet, das gebaute Buendel nicht. Ein
// Byte-Vergleich waere dauerhaft rot und damit wertlos.
//
// Aufruf:
//   node scripts/check-buendel-gegen-live.mjs
//   node scripts/check-buendel-gegen-live.mjs --url https://smejj.com/assets/start-styles.css

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildBundle } from "./build/bundle-start-styles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STANDARD_URL = "https://smejj.com/assets/start-styles.css";

/**
 * Zerlegt ein Stylesheet in eine Menge von Regeln, unabhaengig von Leerraum,
 * Kommentaren und der Reihenfolge der Eigenschaften innerhalb eines Blocks.
 * @param {string} css
 * @returns {Map<string, string>} Selektor -> sortierte Eigenschaften
 */
export function regelmenge(css) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const eng = ohneKommentare
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1");
  const menge = new Map();
  for (const [, selektor, koerper] of eng.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const eigenschaften = koerper
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort()
      .join("; ");
    // Gleicher Selektor kann mehrfach vorkommen (Kaskade) — Schluessel
    // erweitern, damit nichts still verschluckt wird.
    let schluessel = selektor.trim();
    let n = 2;
    while (menge.has(schluessel)) schluessel = `${selektor.trim()} #${n++}`;
    menge.set(schluessel, eigenschaften);
  }
  return menge;
}

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : STANDARD_URL;

let liveCss;
try {
  const antwort = await fetch(`${url}?pruefung=${Date.now()}`);
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  liveCss = await antwort.text();
} catch (fehler) {
  // Ohne Netz ist nichts gemessen — und "nichts gemessen" ist nicht gruen.
  console.error(`Live-Stylesheet nicht erreichbar (${url}): ${fehler.message}`);
  console.error("Nichts gemessen ist NICHT gruen. Vor dem Deploy erneut ausfuehren.");
  process.exit(2);
}

const gebaut = await buildBundle();
const live = regelmenge(liveCss);
const meins = regelmenge(gebaut);

const nurLive = [...live].filter(([s, e]) => meins.get(s) !== e);
const nurMeins = [...meins].filter(([s, e]) => live.get(s) !== e);

if (nurLive.length === 0) {
  console.log(
    `check:buendel-gegen-live OK — ${live.size} Regeln live, ${meins.size} gebaut. ` +
      `Nichts auf smejj.com, das nicht in einer Quelldatei steht.` +
      (nurMeins.length ? ` ${nurMeins.length} Regeln sind neu und noch nicht ausgeliefert.` : "")
  );
  process.exit(0);
}

console.error(
  `\ncheck:buendel-gegen-live ROT — ${nurLive.length} Regeln stehen auf smejj.com,\n` +
    `aber in keiner Quelldatei. Ein regulaerer Bau wuerde sie loeschen:\n`
);
for (const [selektor, eigenschaften] of nurLive.slice(0, 30)) {
  console.error(`  ${selektor} {${eigenschaften.slice(0, 160)}}`);
  const meine = meins.get(selektor);
  if (meine) console.error(`      Quelle sagt: {${meine.slice(0, 160)}}`);
  else console.error(`      Quelle kennt diesen Selektor gar nicht.`);
}
if (nurLive.length > 30) console.error(`  … und ${nurLive.length - 30} weitere.`);
console.error(
  `\nNICHT einfach das Buendel darueberkopieren. Erst die Werte in die\n` +
    `Quelldateien zurueckholen, dann neu bauen, dann erneut pruefen.\n`
);
process.exit(1);
