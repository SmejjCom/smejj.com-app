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
  // Die Chrome-Angleichung des Panels (2026-08-19 aus browser-pane.css
  // herausgeloest, 800-Zeilen-Regel). Muss DIREKT dahinter stehen: sie
  // ueberschreibt Regeln von dort absichtlich.
  "browser-pane-chrome.css",
  "view-chrome.css",
  "profile-dock.css",
  "chat-markdown.css",
  // Aktionen pro Nachricht (2026-07-28). Bewusst im Buendel statt als eigenes
  // <link>: die Startseite soll genau EIN render-blockierendes Stylesheet laden.
  "chat-actions.css",
  // Such-Overlay (Cmd+K), Glas-Startseite und die App-weite Eckig-Regel
  // (2026-08-13). Alle drei kamen zuerst als eigenes <link> dazu und haben
  // damit den Ein-Buendel-Vertrag gebrochen — hier gehoeren sie hin.
  // eckig.css steht ABSICHTLICH am Ende: es ueberschreibt jede Rundung.
  "search-overlay.css",
  "start-glass.css",
  "eckig.css",
  // Design V11 (Betreiber-Freigabe 2026-08-15). Steht ABSICHTLICH nach
  // eckig.css: es traegt die dokumentierte Rundungs-Ausnahme ("leichter
  // Knick", 8 px) und die eine Farbquelle. Wer hier etwas davorschiebt,
  // bekommt wieder drei Cyantoene.
  "design-v11.css"
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
    if (/@import/.test(css)) {
      throw new Error(`${name} enthaelt @import — Buendeln waere nicht mehr sicher.`);
    }
    // Gefaehrlich am Buendeln ist nur ein RELATIVER Pfad: er wird gegen die
    // Adresse des Stylesheets aufgeloest und zeigt nach dem Zusammenlegen
    // woandershin. Wurzel-absolute Pfade ("/icons/…") und eingebettete
    // data:-Inhalte sind davon unberuehrt und deshalb erlaubt (2026-08-13,
    // gebraucht fuer das Maus-Zeichen in branding.css).
    for (const [, pfad] of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
      if (!pfad.startsWith("/") && !pfad.startsWith("data:")) {
        throw new Error(`${name} enthaelt den relativen Pfad url(${pfad}) — Buendeln waere nicht mehr sicher.`);
      }
    }
    parts.push(`\n/* ---- ${name} ---- */\n${entschlacke(css)}\n`);
  }
  return parts.join("");
}

// Kommentare und Leerzeilen fliegen NUR aus dem ERGEBNIS (Betreiber-Auftrag
// 2026-08-19, Startseiten-Gewicht): 205 KB -> 134 KB, gemessen -35 %. Die
// Quelldateien behalten jede Erklaerung; start-styles.css ist ohnehin reines
// Ergebnis und sein Kopf verweist auf die Quellen.
//
// Warum das sicher ist — und wo es NICHT sicher waere: Ein "/*" darf in
// keiner Zeichenkette stehen, sonst schneidet die Regel mitten im Wert.
// Betroffen waeren nur content:- und url()-Werte. Der Waechter unten bricht
// den Bau ab, falls das je vorkommt; lieber kein Buendel als ein kaputtes.
export function entschlacke(css) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, wert] of ohneKommentare.matchAll(/content\s*:\s*([^;}]*)/g)) {
    if (wert.includes("/*")) throw new Error("content-Wert enthaelt '/*' — Entschlacken waere nicht sicher.");
  }
  for (const [, wert] of ohneKommentare.matchAll(/url\(([^)]*)\)/g)) {
    if (wert.includes("/*")) throw new Error("url()-Wert enthaelt '/*' — Entschlacken waere nicht sicher.");
  }
  return ohneKommentare
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trimEnd();
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
