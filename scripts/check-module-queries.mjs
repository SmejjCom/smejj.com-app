// smejj.com — Waechter: EIN Modul, EINE Kennung.
//
// Warum es diesen Pruefer gibt: dieselbe Falle hat dreimal live zugeschlagen.
//
//   sw v184: settings-surface.js importierte settings-runtime.js unter ZWEI
//            Adressen (mit und ohne ?v=3). In ES-Modulen sind das zwei
//            getrennte Instanzen mit eigenem Zustand.
//   sw v185: dieselbe Ursache eine Ebene hoeher — premium-surfaces.js zog ueber
//            settings-surface.js?v=3 die ganze alte Kette mit.
//   2026-07-29: chat-actions.js importierte voice-speech-queue.js?v=1, waehrend
//            composer-tools.js und voice-landing.js ?v=blitz-20260726 nutzen.
//            Live gemessen: die Datei wurde ZWEIMAL geladen, 4,3 KB doppelt.
//            Gleichzeitig gefunden: public/de/index.html lud voice-landing.js
//            unter einer Kennung, die sechs Aenderungen alt war — waehrend die
//            14 anderen Sprachseiten die aktuelle nutzten.
//
// Zwei verschiedene Schaeden aus einer Ursache:
//   1. Auf DERSELBEN Seite: zwei Modulinstanzen, getrennter Zustand. Der Fehler
//      zeigt sich als "die Einstellung kommt nicht an" — nicht als Absturz.
//   2. Auf VERSCHIEDENEN Seiten: der Browser behaelt unter der alten Kennung
//      seine alte Kopie. Eine Seite laeuft dann auf altem Stand.
//
// Regel: Jedes Modul wird projektweit unter GENAU EINER Kennung angesprochen.
//
// Aufruf: node scripts/check-module-queries.mjs

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = join(ROOT, "public");

// sw.js fuehrt die Precache-Liste ohne Kennungen — es ist die Ausnahme, kein
// Verstoss. i18n-Bundles werden zur Laufzeit ueber einen Ausdruck geladen
// (`./${next}.js?v=3`) und sind hier nicht statisch pruefbar.
const AUSGENOMMEN = new Set(["sw.js"]);
const UEBERSPRUNGENE_ORDNER = new Set(["i18n", "deploy", "task-capsules", "storage"]);

const BEZUG = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']|src=["']([^"']+\.js[^"']*)["']/g;

function* dateien(ordner) {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      if (!UEBERSPRUNGENE_ORDNER.has(eintrag.name)) yield* dateien(pfad);
      continue;
    }
    if (!/\.(js|html)$/.test(eintrag.name)) continue;
    if (AUSGENOMMEN.has(eintrag.name)) continue;
    yield pfad;
  }
}

// "./voice-speech-queue.js?v=1" und "/assets/voice-speech-queue.js?v=1" meinen
// dieselbe Datei — beim Vergleich zaehlt der Dateiname, nicht die Schreibweise.
function normalisiere(spezifizierer) {
  const [pfad, kennung = ""] = spezifizierer.split("?");
  const modul = pfad
    .replace(/^\/assets\//, "")
    .replace(/^\.\.\//, "")
    .replace(/^\.\//, "")
    .replace(/^\//, "");
  return { modul, kennung };
}

/**
 * Sammelt je Modul alle benutzten Kennungen.
 * @returns {Map<string, Map<string, string[]>>} Modul -> Kennung -> Dateien
 */
export function sammleKennungen(basis = BASIS) {
  const treffer = new Map();
  for (const datei of dateien(basis)) {
    const inhalt = readFileSync(datei, "utf8");
    for (const stelle of inhalt.matchAll(BEZUG)) {
      const spezifizierer = stelle[1] || stelle[2] || stelle[3];
      if (!spezifizierer || /^https?:/.test(spezifizierer)) continue;
      // Laufzeit-Ausdruecke (Template-Literale) sind statisch nicht aufloesbar.
      if (spezifizierer.includes("${")) continue;
      const { modul, kennung } = normalisiere(spezifizierer);
      if (!modul.endsWith(".js")) continue;
      if (!treffer.has(modul)) treffer.set(modul, new Map());
      const kennungen = treffer.get(modul);
      if (!kennungen.has(kennung)) kennungen.set(kennung, []);
      kennungen.get(kennung).push(datei.replace(`${ROOT}/`, ""));
    }
  }
  return treffer;
}

/**
 * @param {Map<string, Map<string, string[]>>} treffer
 * @returns {Array<{modul: string, kennungen: Array<{kennung: string, dateien: string[]}>}>}
 */
export function findeVerstoesse(treffer) {
  return [...treffer.entries()]
    .filter(([, kennungen]) => kennungen.size > 1)
    .map(([modul, kennungen]) => ({
      modul,
      kennungen: [...kennungen.entries()].map(([kennung, dateien]) => ({
        kennung: kennung || "(ohne)",
        dateien
      }))
    }));
}

function main() {
  const treffer = sammleKennungen();
  const verstoesse = findeVerstoesse(treffer);
  if (!verstoesse.length) {
    console.log(`check:module-queries OK — ${treffer.size} Module, jedes unter genau einer Kennung.`);
    return;
  }
  console.error(`check:module-queries FEHLGESCHLAGEN (${verstoesse.length}):`);
  for (const verstoss of verstoesse) {
    console.error(`\n  ${verstoss.modul} wird unter ${verstoss.kennungen.length} Kennungen angesprochen:`);
    for (const { kennung, dateien } of verstoss.kennungen) {
      console.error(`    ?${kennung}  <- ${dateien.join(", ")}`);
    }
  }
  console.error("\nEIN Modul, EINE Kennung. Zwei Kennungen bedeuten zwei Modulinstanzen");
  console.error("mit getrenntem Zustand — und im Browser-Cache zwei verschiedene Staende.");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
