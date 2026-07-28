// smejj.com — prueft, ob der Service-Worker-Precache den Modulgraph vollstaendig abdeckt.
//
// Warum das zaehlt: Faellt ein importiertes Modul aus dem Precache, findet der
// Import offline nichts. Der Fetch-Handler liefert als Rueckfall "/" (index.html),
// der Browser bekommt HTML statt JavaScript und bricht das ganze Modul ab — die
// App ist offline tot. Genau diese Falle steht seit v130 als Warnung in sw.js;
// diese Pruefung macht daraus eine automatische Zusage.
//
// Vorgehen: Von jedem im SHELL gelisteten .js-Modul aus den Importgraph
// verfolgen (relative Pfade korrekt am Ordner der Quelldatei aufloesen) und
// melden, was fehlt.
//
// Fail-closed: jede Luecke beendet den Lauf mit Exit-Code 1.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const SW = readFileSync("public/sw.js", "utf8");
const shell = new Set(
  Array.from(SW.matchAll(/^\s*"(\/assets\/[^"]+|\/[^"]*\.js)",?$/gm), (treffer) => treffer[1])
);

// Nur JavaScript-Module haben einen Importgraph.
const module = [...shell].filter((pfad) => pfad.endsWith(".js"));
const luecken = [];
const gesehen = new Set();

for (const start of module) besuche(start);

function besuche(assetPfad) {
  if (gesehen.has(assetPfad)) return;
  gesehen.add(assetPfad);
  const datei = quellDatei(assetPfad);
  if (!datei || !existsSync(datei)) return;
  const quelle = readFileSync(datei, "utf8");
  for (const treffer of quelle.matchAll(/(?:^|[\s(])(?:import|export)[^'"\n]*?from\s*["'](\.[^"']+)["']/g)) {
    const ziel = aufloesen(datei, treffer[1]);
    if (!ziel) continue;
    if (!shell.has(ziel)) luecken.push({ von: assetPfad, fehlt: ziel });
    else besuche(ziel);
  }
}

// /assets/x.js -> public/x.js  (live liegt public/ unter /assets/)
function quellDatei(assetPfad) {
  if (assetPfad.startsWith("/assets/")) return join("public", assetPfad.slice("/assets/".length));
  if (assetPfad.endsWith(".js")) return join("public", assetPfad.slice(1));
  return "";
}

// Relativen Import am Ordner der QUELLDATEI aufloesen und zurueck auf /assets/ abbilden.
function aufloesen(quellDateiPfad, spezifizierer) {
  const ohneVersion = spezifizierer.split("?")[0];
  if (!ohneVersion.endsWith(".js")) return "";
  const ziel = normalize(join(dirname(quellDateiPfad), ohneVersion));
  if (!ziel.startsWith("public/")) return "";
  return `/assets/${ziel.slice("public/".length)}`;
}

if (luecken.length) {
  console.error(`check:precache-imports FAILED (${luecken.length} Luecken) — offline waere die App tot:`);
  for (const { von, fehlt } of luecken.sort((a, b) => a.fehlt.localeCompare(b.fehlt))) {
    console.error(`  - ${fehlt} fehlt im SHELL (importiert von ${von})`);
  }
  process.exit(1);
}

console.log(`check:precache-imports OK — ${gesehen.size} Module erreichbar, Precache vollstaendig.`);
