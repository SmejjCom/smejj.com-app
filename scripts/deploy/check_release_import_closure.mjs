#!/usr/bin/env node
// smejj.com — Release-Import-Abschluss-Pruefung (Fix 2026-07-15).
// Verhindert die V68-Fehlerklasse: Artefakt und Server-Imports muessen ein Paar sein.
// Ausgehend von src/server.js werden alle RELATIVEN Imports transitiv verfolgt;
// jede erreichte Datei muss in den Release-INCLUDE_PATHS liegen. Fail-closed:
// ein einziger Import ausserhalb des Artefakts -> Exit 1, Release verboten.
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Eine Quelle der Wahrheit fuer ALLE Builder und Checks (Fix 2026-07-17):
// Vorher hatte dieser Check seine eigene Kopie der Liste und pruefte damit
// am Basis-Builder vorbei — der rc1-Crash-Loop entstand genau in dieser Luecke.
import {
  CONTROL_RELEASE_INCLUDE_PATHS,
  CONTROL_RELEASE_RUNTIME_RESOURCES,
  isInReleaseIncludePaths
} from "./release-include-paths.mjs";

const INCLUDE_PATHS = CONTROL_RELEASE_INCLUDE_PATHS;

const ROOT = path.resolve(process.cwd());
const IMPORT_RE = /(?:^|\n)\s*(?:import\s[^"']*|import\s*\(|export\s[^"']*from\s*)["']([^"']+)["']/g;

function imArtefakt(relPfad) {
  return isInReleaseIncludePaths(relPfad, INCLUDE_PATHS);
}

function aufloesen(basisDatei, spec) {
  const kandidat = path.resolve(path.dirname(basisDatei), spec);
  for (const p of [kandidat, `${kandidat}.js`, `${kandidat}.mjs`, path.join(kandidat, "index.js")]) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const start = path.join(ROOT, "src/server.js");
const gesehen = new Set();
const fehler = [];
const stapel = [start];
while (stapel.length > 0) {
  const datei = stapel.pop();
  if (gesehen.has(datei)) continue;
  gesehen.add(datei);
  const rel = path.relative(ROOT, datei).split(path.sep).join("/");
  if (!imArtefakt(rel)) {
    fehler.push(rel);
    continue;
  }
  let quelle = "";
  try { quelle = readFileSync(datei, "utf8"); } catch { fehler.push(`${rel} (nicht lesbar)`); continue; }
  // Template-Literale entfernen: Imports in Code-VORLAGEN (Strings) sind keine
  // echten Modul-Imports (bekanntes Beispiel: freeAppExecutor-Projektvorlagen).
  quelle = quelle.replace(/`(?:[^`\\]|\\[\s\S])*`/g, '""');
  for (const treffer of quelle.matchAll(IMPORT_RE)) {
    const spec = treffer[1];
    if (!spec.startsWith(".")) continue; // node:-/Paket-Imports sind nicht Teil des Artefakts
    const ziel = aufloesen(datei, spec);
    if (!ziel) { fehler.push(`${rel} -> ${spec} (nicht aufloesbar)`); continue; }
    stapel.push(ziel);
  }
}

// Zweite Fehlerklasse (Fix 2026-07-17): Dateien, die zur LAUFZEIT per fs
// gelesen werden, findet kein Import-Graph — sie muessen trotzdem im Artefakt
// liegen und auf der Platte existieren (Beispiel: schemas/maus-*.schema.json).
for (const eintrag of CONTROL_RELEASE_RUNTIME_RESOURCES) {
  const leserImArtefakt = imArtefakt(eintrag.whenPresent) && existsSync(path.join(ROOT, eintrag.whenPresent));
  if (!leserImArtefakt) continue;
  if (!imArtefakt(eintrag.resource)) {
    fehler.push(`${eintrag.resource} (Laufzeit-Ressource, nicht in INCLUDE_PATHS; ${eintrag.reason})`);
    continue;
  }
  if (!existsSync(path.join(ROOT, eintrag.resource))) {
    fehler.push(`${eintrag.resource} (Laufzeit-Ressource fehlt auf der Platte; ${eintrag.reason})`);
  }
}

if (fehler.length > 0) {
  console.error(`check:release-imports FEHLGESCHLAGEN — ${fehler.length} Abhaengigkeit(en) ausserhalb des Release-Artefakts:`);
  for (const f of [...new Set(fehler)].slice(0, 20)) console.error(`  - ${f}`);
  console.error("Release verboten: Artefakt-INCLUDE_PATHS, Server-Imports und Laufzeit-Ressourcen muessen ein Paar sein (V68- + rc1-Schutz).");
  process.exit(1);
}
console.log(`check:release-imports OK — ${gesehen.size} Dateien transitiv geprueft, ${CONTROL_RELEASE_RUNTIME_RESOURCES.length} Laufzeit-Ressourcen bestaetigt, alle im Release-Artefakt.`);
