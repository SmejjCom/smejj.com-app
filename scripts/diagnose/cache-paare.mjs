#!/usr/bin/env node
// smejj.com — die Trefferpaare des semantischen Cache zum Nachlesen.
//
// WARUM ES DAS GIBT: Seit dem 2026-08-18 beantwortet der Cache Fragen, ohne dass
// ein Modell laeuft. Das spart Geld — und es ist der einzige Hebel, der eine
// FALSCHE Antwort ausliefern kann. Eine Trefferquote allein sagt darueber
// nichts: "0,93 Aehnlichkeit" kann ein perfekter Treffer sein oder ein
// Fehlgriff. Nur das PAAR verraet es.
//
// Dieses Werkzeug stellt die Paare nebeneinander, damit ein Mensch in zehn
// Sekunden sieht, ob der Cache richtig liegt. Es aendert nichts.
//
// Aufruf:
//   node scripts/diagnose/verbrauch-holen.mjs 40 | node scripts/diagnose/cache-paare.mjs
//   npm run cache:paare < logdatei.txt
//
// Bewertet wird NICHT automatisch. Ein Rechner, der entscheidet, ob zwei Fragen
// dasselbe meinen, ist genau der Rechner, dessen Urteil hier geprueft werden
// soll — er kann sich nicht selbst kontrollieren.

import { readFileSync } from "node:fs";

const MARKE = "[sem-cache] ";

const datei = process.argv[2];
const roh = datei ? readFileSync(datei, "utf8") : readFileSync(0, "utf8");

const saetze = [];
for (const zeile of roh.split("\n")) {
  const start = zeile.indexOf(MARKE);
  if (start === -1) continue;
  try {
    const satz = JSON.parse(zeile.slice(start + MARKE.length));
    if (satz && typeof satz === "object") saetze.push(satz);
  } catch {
    // Abgeschnittene Zeile am Logrand — ueberspringen, nicht abbrechen.
  }
}

if (saetze.length === 0) {
  console.log("Keine [sem-cache]-Zeilen gefunden.");
  console.log("Entweder lief kein Verkehr, oder SMEJJ_SEM_CACHE steht auf \"aus\".");
  process.exit(0);
}

const treffer = saetze.filter((satz) => satz.treffer);
const ausgeliefert = treffer.filter((satz) => satz.grund === "ausgeliefert");
const schatten = treffer.filter((satz) => satz.grund === "schatten-treffer");

console.log("");
console.log(`Anfragen mit Cache-Pruefung : ${saetze.length}`);
console.log(`davon Treffer               : ${treffer.length}  (${prozent(treffer.length, saetze.length)})`);
console.log(`davon WIRKLICH ausgeliefert : ${ausgeliefert.length}`);
console.log(`davon nur im Schatten       : ${schatten.length}`);
console.log("");

const gruende = new Map();
for (const satz of saetze.filter((s) => !s.treffer)) {
  gruende.set(satz.grund, (gruende.get(satz.grund) || 0) + 1);
}
if (gruende.size > 0) {
  console.log("Warum es KEIN Treffer war:");
  for (const [grund, anzahl] of [...gruende.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(grund).padEnd(20)} ${anzahl}`);
  }
  console.log("");
}

if (ausgeliefert.length === 0) {
  console.log("Es wurde noch keine Antwort aus dem Cache ausgeliefert — nichts nachzulesen.");
  process.exit(0);
}

console.log("══ AUSGELIEFERTE ANTWORTEN — bitte durchsehen ".padEnd(78, "═"));
console.log("");
for (const satz of ausgeliefert) {
  console.log(`  Aehnlichkeit ${satz.aehnlich}`);
  console.log(`    gefragt   : ${satz.neueFrage || "(nicht protokolliert)"}`);
  console.log(`    getroffen : ${satz.getroffeneFrage || "(nicht protokolliert)"}`);
  console.log("");
}
console.log("Meinen zwei Zeilen eines Paares NICHT dasselbe, ist der Cache zu grosszuegig.");
console.log("Rueckweg: SMEJJ_SEM_CACHE=schatten setzen und Control neu bauen.");
console.log("");

function prozent(teil, ganzes) {
  return ganzes > 0 ? `${Math.round((teil / ganzes) * 100)} %` : "0 %";
}
