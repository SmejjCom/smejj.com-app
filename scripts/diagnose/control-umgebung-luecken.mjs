#!/usr/bin/env node
// smejj.com — welche Umgebungswerte erwartet der Code, und welche traegt der
// laufende Dienst wirklich?
//
// WARUM ES DAS GIBT (Befund 2026-08-17): Der Dienst smejj-control trug nur noch
// 35 Umgebungswerte; am 2026-08-14 waren es 101. Gemerkt hat das niemand, weil
// jede fehlende Variable an einer ANDEREN Stelle einen anderen Fehler ausloest:
// der Maus-Lauf meldete "budget_gate_blockiert", der Artefakt-Abruf
// "rate_limit_not_enabled", und beides sah nach einem Fehler im jeweiligen
// Fachgebiet aus. Wer eine Luecke einzeln jagt, jagt wochenlang.
//
// Dieses Werkzeug stellt die Frage EINMAL fuer alle: es liest die
// SMEJJ_-/bekannten Schluesselnamen aus dem Quelltext und haelt sie gegen die
// Zeabur-Umgebung. Werte werden nie ausgegeben — nur Namen und "da/fehlt".
//
// Aufruf:  node scripts/diagnose/control-umgebung-luecken.mjs [dienstname]
// Exit-Code 0 = keine Luecke, 2 = Luecken gefunden (fail-closed fuer CI).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { zeaburAbfrage } from "./zeabur-api.mjs";
import { findeDienst } from "../deploy/zeabur-umgebung-setzen.mjs";

const QUELLEN = ["src", "control-server/src", "gatekeeper", "workers/maus-engine"];
// Nur Praefixe, die wirklich Serverkonfiguration sind. Ohne diese Einschraenkung
// faengt der Scan auch NODE_ENV, PATH und jede Testattrappe ein.
const MUSTER = /\benv\.([A-Z][A-Z0-9_]{4,})\b|process\.env\.([A-Z][A-Z0-9_]{4,})\b/g;
const RELEVANT = /^(SMEJJ_|IDRIVE_|STRIPE_|GOOGLE_|PRESIGN_|FREE_DEMO_)/;

function dateien(wurzel) {
  const gefunden = [];
  const lauf = (pfad) => {
    let eintraege;
    try { eintraege = readdirSync(pfad); } catch { return; }
    for (const name of eintraege) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const voll = join(pfad, name);
      if (statSync(voll).isDirectory()) lauf(voll);
      else if (/\.(js|mjs)$/.test(name) && !/\.test\./.test(name)) gefunden.push(voll);
    }
  };
  lauf(wurzel);
  return gefunden;
}

/** Alle Konfigurationsnamen, die der Quelltext liest. */
export function erwarteteSchluessel(wurzeln = QUELLEN) {
  const namen = new Set();
  for (const wurzel of wurzeln) {
    for (const datei of dateien(wurzel)) {
      const text = readFileSync(datei, "utf8");
      for (const treffer of text.matchAll(MUSTER)) {
        const name = treffer[1] || treffer[2];
        if (RELEVANT.test(name)) namen.add(name);
      }
    }
  }
  return [...namen].sort();
}

const dienstName = process.argv[2] || "smejj-control";
const dienst = await findeDienst(dienstName, zeaburAbfrage);
const daten = await zeaburAbfrage(
  `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key } } }`,
  { s: dienst.serviceId, e: dienst.environmentId }
);
const vorhanden = new Set((daten?.service?.variables || []).map((v) => v.key));
const erwartet = erwarteteSchluessel();
const fehlend = erwartet.filter((k) => !vorhanden.has(k));

console.log(`${dienstName}: ${vorhanden.size} gesetzt, ${erwartet.length} im Quelltext gelesen.`);
if (!fehlend.length) {
  console.log("Keine Luecke.");
  process.exit(0);
}
console.log(`\n${fehlend.length} Schluessel werden gelesen, sind aber NICHT gesetzt:`);
for (const k of fehlend) console.log(`  ${k}`);
console.log("\nNicht jede Luecke ist ein Fehler — manche Werte sind optional und haben"
  + " einen Standard. Die Liste ist der Ausgangspunkt fuer die Pruefung, nicht das Urteil.");
process.exit(2);
