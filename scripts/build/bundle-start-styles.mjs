// smejj.com — buendelt die render-blockierenden Stylesheets der Startseite.
//
// Befund 2026-07-27 (job_webvitals_messung_20260727): Beim Erstbesuch laufen 45
// Anfragen vor dem ersten Bildaufbau. Acht davon sind Stylesheets, die alle bei
// ~822 ms starten und erst bei 1452-1531 ms fertig sind. Nicht die Bytes bremsen
// (37 KB), sondern die Anzahl der Runden.
//
// Loesung ohne Bundler und ohne neue Abhaengigkeit: die acht Quelldateien werden
// in exakt der Reihenfolge aus index.html aneinandergehaengt. Die Quelldateien
// bleiben unveraendert die Wahrheit — start-styles.css ist reines Ergebnis.
//
// Sicher, weil keine der acht Dateien `url()` oder `@import` benutzt: es gibt
// keine relativen Pfade, die sich durch das Zusammenlegen verschieben koennten.
// Das Buendel liegt ausserdem im selben Ordner wie die Quellen (/assets/).
//
// Aufruf:
//   node scripts/build/bundle-start-styles.mjs           # erzeugen
//   node scripts/build/bundle-start-styles.mjs --check   # nur pruefen (CI)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT = join(ROOT, "public", "start-styles.css");

// Reihenfolge = Kaskade. Muss exakt der frueheren Reihenfolge in index.html
// entsprechen, sonst gewinnen andere Regeln als vorher.
export const SOURCES = Object.freeze([
  "styles.css",
  "cline-model-menu.css",
  "branding.css",
  "composer-tools.css",
  "browser-pane.css",
  "view-chrome.css",
  "profile-dock.css",
  "chat-markdown.css"
]);

const HEADER = `/* ERZEUGT — nicht von Hand aendern.
 * Quelle: scripts/build/bundle-start-styles.mjs
 * Buendelt die render-blockierenden Stylesheets der Startseite zu einer Datei.
 * Aenderungen gehoeren in die Quelldateien; danach:
 *   node scripts/build/bundle-start-styles.mjs
 * Reihenfolge ist die Kaskade und darf nicht vertauscht werden.
 */
`;

export async function buildBundle() {
  const parts = [HEADER];
  for (const name of SOURCES) {
    const css = await readFile(join(ROOT, "public", name), "utf8");
    if (/@import|url\(/.test(css)) {
      throw new Error(`${name} enthaelt @import oder url() — Buendeln waere nicht mehr sicher.`);
    }
    parts.push(`\n/* ---- ${name} ---- */\n${css.trimEnd()}\n`);
  }
  return parts.join("");
}

// Nur beim direkten Aufruf ausfuehren. Tests importieren SOURCES aus dieser
// Datei — ein Import darf niemals ungefragt Dateien schreiben.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = await buildBundle();
  if (process.argv.includes("--check")) {
    const current = await readFile(OUTPUT, "utf8").catch(() => "");
    if (current !== bundle) {
      console.error("start-styles.css ist NICHT aktuell — bitte 'node scripts/build/bundle-start-styles.mjs' ausfuehren.");
      process.exit(1);
    }
    console.log(`start-styles.css aktuell — ${SOURCES.length} Quelldateien, ${Math.round(bundle.length / 1024)} KB.`);
  } else {
    await writeFile(OUTPUT, bundle);
    console.log(`start-styles.css erzeugt — ${SOURCES.length} Quelldateien, ${Math.round(bundle.length / 1024)} KB.`);
  }
}
