#!/usr/bin/env node
// smejj.com — die fehlenden Budget-Grenzen am Control-Server nachtragen.
//
// BEFUND 2026-08-15: Von den vier Budget-Grenzen fehlten DREI in der
// Zeabur-Umgebung. Aufgefallen ist es nur an einer Stelle, und das ist der
// eigentliche Lehrsatz:
//
//   budgetGate.js:22   maxConcurrentWorkers = positiveNumber(env...) || 1
//   workerCapacityStore.js:332  Number(env...) und dann Number.isSafeInteger
//
// Das Tor setzt bei fehlendem Wert still eine 1 ein und meldet sich als
// "scharf". Die Platzreservierung hat keine Vorgabe und meldet
// `global_worker_capacity_configuration_invalid`. Ein und dieselbe fehlende
// Variable — einmal unsichtbar, einmal als Ausfall. Wer nur auf die
// Kostenseite schaut, haelt alles fuer eingerichtet.
//
// DIE WERTE sind keine Erfindung: genau diese hat der Dienst am 2026-08-14
// selbst zurueckgemeldet, bevor die Umgebung zweimal ersetzt wurde
// (/api/admin/geld/kosten: maxUsdProJob 0.1, maxLaufzeitMinuten 30,
// maxGleichzeitigeWorker 1). Die Reserve-Obergrenze ist bewusst knapp:
// 1 USD ist das Zehnfache eines Jobs und bleibt ein harter Deckel.
//
// Nur EINEN Wert je Aufruf setzen. updateEnvironmentVariable(data: Map)
// ersetzt die ganze Umgebung und hat am 2026-08-14 zweimal Control
// ausgeknipst — kommt hier nicht vor.
//
// Aufruf: node scripts/deploy/budget-grenze-nachtragen.mjs [--ausrollen]
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";
import { findeDienst } from "./zeabur-umgebung-setzen.mjs";

const DIENST = "smejj-control";
const GRENZEN = {
  SMEJJ_BUDGET_MAX_USD_PER_JOB: "0.1",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30",
  SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
  SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "1"
};

const dienst = await findeDienst(DIENST);
const basis = { s: dienst.serviceId, e: dienst.environmentId };

async function anlegen(key, value) {
  return zeaburAbfrage(
    `mutation($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
       createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
     }`, { ...basis, k: key, v: value });
}
async function aendern(key, value) {
  return zeaburAbfrage(
    `mutation($s: ObjectID!, $e: ObjectID!, $alt: String!, $neu: String!, $v: String!) {
       updateSingleEnvironmentVariable(serviceID: $s, environmentID: $e, oldKey: $alt, newKey: $neu, value: $v) { key }
     }`, { ...basis, alt: key, neu: key, v: value });
}

let letzte = null;
for (const [key, value] of Object.entries(GRENZEN)) {
  try {
    await anlegen(key, value);
    process.stderr.write(`  ${key} = ${value} (neu)\n`);
  } catch (fehler) {
    if (!/has been created/i.test(String(fehler.message))) throw fehler;
    letzte = await aendern(key, value);
    process.stderr.write(`  ${key} = ${value} (war da)\n`);
  }
}

// Gegenprobe: die Aendern-Mutation gibt ALLE Schluessel des Dienstes zurueck.
if (!letzte) letzte = await aendern("SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD", GRENZEN.SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD);
const schluessel = (letzte.updateSingleEnvironmentVariable || []).map((x) => x.key);
const fehlen = Object.keys(GRENZEN).filter((k) => !schluessel.includes(k));
process.stderr.write(`\n${schluessel.length} Variablen am Dienst; fehlende Grenzen: ${fehlen.length ? fehlen.join(", ") : "keine"}\n`);

if (process.argv.includes("--ausrollen")) {
  // redeployService, NICHT restartService: ein Neustart behaelt die ALTE
  // Umgebung — am 2026-08-15 nachgemessen.
  const a = await zeaburAbfrage(
    `mutation($s: ObjectID!, $e: ObjectID!) { redeployService(serviceID: $s, environmentID: $e) }`, basis);
  process.stderr.write(`Neu ausgerollt: ${JSON.stringify(a)}\n`);
}
