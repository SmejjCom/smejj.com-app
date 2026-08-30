#!/usr/bin/env node
// smejj.com — Waechter ueber die MARKENKETTE (?v=) der ausgelieferten Module.
//
// WARUM ES IHN GIBT: Am 18./19.08.2026 ist dieselbe Falle VIERMAL zugeschnappt.
// Ihr Muster ist immer gleich und von aussen nicht zu sehen:
//
//   index.html laedt app.js?v=b64
//   app.js     laedt maus-absicht.js?v=8      <- Marke blieb stehen
//   maus-absicht.js laedt maus-modul?v=ALT    <- also die ALTE Fassung
//   browser-pane.js laedt maus-modul?v=NEU    <- und daneben die NEUE
//
// Ergebnis: ZWEI Kopien desselben Moduls im selben Fenster, jede mit eigenem
// Zustand. Von Hand aufgerufen lief der Fix, ueber die App nicht. Gleicher
// Code, andere Datei. Nichts sah kaputt aus.
//
// Der Waechter prueft genau eine Zusage, aber die hart:
//   ZU JEDEM MODUL DARF ES NUR EINE MARKE GEBEN.
//
// Und eine zweite, die noch wichtiger ist:
//   AENDERT SICH DER INHALT, MUSS SICH DIE MARKE AENDERN.
//
// Das ist die URSACHE der vier Vorfaelle. Dreimal war die Quelle in sich
// stimmig — alle Verweise auf ein Modul trugen dieselbe Marke — und trotzdem
// lief die alte Fassung, weil der INHALT sich geaendert hatte und die Marke
// stehengeblieben war. Der Browser hat dann keinen Grund, neu zu laden.
// Dafuer merkt sich der Waechter je (Modul, Marke) einen Fingerabdruck.
//
// Fail-closed: jede Uneinigkeit beendet den Lauf mit Exit-Code 1.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const MANIFEST = "docs/frontend/marken-manifest.json";
const einfrieren = process.argv.includes("--freeze");

const WURZEL = "public";
// Nur was der Browser wirklich laedt. assets/ ist die Spiegelkopie im
// App-Repo und laeuft bekanntermassen hinterher — sie hier mitzuzaehlen
// wuerde bei jedem Lauf falschen Alarm geben.
const AUSGENOMMEN = new Set(["assets", "storage", "deploy", "icons", "shared"]);

function dateien(ordner) {
  const gefunden = [];
  for (const eintrag of readdirSync(ordner)) {
    if (AUSGENOMMEN.has(eintrag)) continue;
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...dateien(pfad));
    else if ([".js", ".html"].includes(extname(eintrag))) gefunden.push(pfad);
  }
  return gefunden;
}

// modul -> Marke -> [wer verweist so]
const marken = new Map();

for (const datei of dateien(WURZEL)) {
  const quelle = readFileSync(datei, "utf8");
  // Beides zaehlt: import/from "..." und <script src="...">
  for (const treffer of quelle.matchAll(/["'](?:\.\/|\/assets\/|\.\.\/)?([a-z0-9-]+\.js)\?v=([^"']+)["']/gi)) {
    const [, modul, marke] = treffer;
    if (!marken.has(modul)) marken.set(modul, new Map());
    const proModul = marken.get(modul);
    if (!proModul.has(marke)) proModul.set(marke, []);
    proModul.get(marke).push(datei);
  }
}

const uneinig = [];
for (const [modul, proModul] of marken) {
  if (proModul.size <= 1) continue;
  uneinig.push({ modul, fassungen: [...proModul.entries()].map(([marke, wer]) => ({ marke, wer: [...new Set(wer)] })) });
}

// --- Zweite Zusage: gleiche Marke, gleicher Inhalt --------------------------
const alt = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")).module || {} : {};
const neu = {};
const veraltet = [];

for (const [modul, proModul] of marken) {
  const datei = join(WURZEL, modul);
  if (!existsSync(datei)) continue; // Modul liegt woanders (z.B. ai/, auth/)
  const finger = createHash("sha256").update(readFileSync(datei)).digest("hex").slice(0, 16);
  const marke = [...proModul.keys()][0];
  neu[modul] = { marke, finger };
  const vorher = alt[modul];
  if (!einfrieren && vorher && vorher.marke === marke && vorher.finger !== finger) {
    veraltet.push({ modul, marke });
  }
}

if (einfrieren) {
  writeFileSync(MANIFEST, `${JSON.stringify({ hinweis: "Fingerabdruck je Modul und Marke. Aendert sich der Inhalt, MUSS die Marke steigen.", module: neu }, null, 2)}\n`);
  console.log(`markenkette eingefroren — ${Object.keys(neu).length} Module vermerkt.`);
  process.exit(0);
}

const gesamt = marken.size;
if (uneinig.length === 0 && veraltet.length === 0) {
  writeFileSync(MANIFEST, `${JSON.stringify({ hinweis: "Fingerabdruck je Modul und Marke. Aendert sich der Inhalt, MUSS die Marke steigen.", module: neu }, null, 2)}\n`);
  console.log(`markenkette OK — ${gesamt} markierte Module, jedes mit genau EINER Marke und passendem Inhalt.`);
  process.exit(0);
}

if (veraltet.length > 0) {
  console.error(`markenkette VERLETZT — ${veraltet.length} Modul(e) wurden GEAENDERT, ohne die Marke zu erhoehen.`);
  console.error("Der Browser laedt sie deshalb nicht neu: der Fix ist ausgeliefert und wirkt trotzdem nicht.\n");
  for (const { modul, marke } of veraltet) console.error(`  ${modul}  steht weiter auf ?v=${marke}`);
  console.error("\nHeilung: Marke erhoehen — in JEDER Datei, die dieses Modul laedt.");
  if (uneinig.length === 0) process.exit(1);
  console.error("");
}

console.error(`markenkette VERLETZT — ${uneinig.length} von ${gesamt} Modulen werden unter MEHREREN Marken geladen.`);
console.error("Der Browser haelt dann zwei Kopien mit getrenntem Zustand. Folge: ein Fix ist live und wirkt trotzdem nicht.\n");
for (const { modul, fassungen } of uneinig) {
  console.error(`  ${modul}`);
  for (const { marke, wer } of fassungen) console.error(`     ?v=${marke}  <- ${wer.join(", ")}`);
  console.error("");
}
console.error("Heilung: in ALLEN aufgefuehrten Dateien dieselbe (neueste) Marke eintragen.");
process.exit(1);
