#!/usr/bin/env node
// smejj.com Datensatzbau — Upload (Single Responsibility: die vier gebauten
// Dateien UNVERAENDERLICH nach IDrive e2 bringen).
//
// IMMUTABILITAET IST HIER CODE, NICHT VORSATZ: vor jedem PUT wird das Ziel per
// GET geprueft. Existiert es bereits, bricht das Skript ab — eine gebaute
// Datensatzversion wird nie ueberschrieben (Policy-Pflicht); Korrekturen
// ergeben eine neue Version vJJJJ.MM.TT.
//
// Voraussetzungen (alle fail-closed):
//   CONFIRM_DATENSATZ_UPLOAD=YES    — ausdrueckliche Bestaetigung, sonst nichts
//   IDRIVE_E2_ACCESS_KEY/SECRET_KEY — allgemeine Ablage-Zugangsdaten
//   --eingabe <dir>                 — Ausgabe des Bau-Schritts (mit manifest.json)
//   --ziel <prefix>                 — z. B. datasets/smejj-1-1/v2026.08.30
//
// Nur Schreib- und Leserecht noetig — Listenrecht hat dieser Zugang bewusst
// nicht (Messfalle aus der Capsule 2026-08-04: leeres Listing beweist nichts).

import fs from "node:fs";
import path from "node:path";
import { idriveConfigFromEnv } from "../../workers/maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../../workers/glm-salad/s3.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

if (String(process.env.CONFIRM_DATENSATZ_UPLOAD || "").trim().toUpperCase() !== "YES") {
  console.error("ABBRUCH: CONFIRM_DATENSATZ_UPLOAD != YES — der Upload passiert nur mit ausdruecklicher Bestaetigung.");
  process.exit(1);
}

const eingabeDir = argument("eingabe");
const zielPrefix = (argument("ziel") || "").replace(/^\/+|\/+$/g, "");
if (!eingabeDir || !zielPrefix) {
  console.error("Verwendung: lade_datensatz_hoch.mjs --eingabe <dir> --ziel <prefix>  (CONFIRM_DATENSATZ_UPLOAD=YES)");
  process.exit(1);
}

const manifesPfad = path.join(eingabeDir, "manifest.json");
if (!fs.existsSync(manifesPfad)) {
  console.error(`ABBRUCH: ${manifesPfad} fehlt — zuerst baue_smejj_datensatz.mjs ausfuehren.`);
  process.exit(1);
}

let config;
try {
  config = idriveConfigFromEnv(process.env);
} catch (fehler) {
  console.error(`ABBRUCH: IDrive-Zugang unvollstaendig (${String(fehler?.message || fehler)}).`);
  process.exit(1);
}

const dateien = [
  ["train.jsonl", "application/jsonl; charset=utf-8"],
  ["validation.jsonl", "application/jsonl; charset=utf-8"],
  ["test.jsonl", "application/jsonl; charset=utf-8"],
  ["manifest.json", "application/json; charset=utf-8"]
];

for (const [name] of dateien) {
  if (!fs.existsSync(path.join(eingabeDir, name))) {
    console.error(`ABBRUCH: ${name} fehlt in ${eingabeDir} — ein Split ohne Datei darf nie hochgeladen werden.`);
    process.exit(1);
  }
}

async function existiertSchon(schluessel) {
  try {
    await signedS3Request(config, "GET", schluessel);
    return true;
  } catch (fehler) {
    if (/_404/.test(String(fehler?.message || fehler))) return false;
    throw fehler;
  }
}

for (const [name, contentType] of dateien) {
  const schluessel = `${zielPrefix}/${name}`;
  let schonDa;
  try {
    schonDa = await existiertSchon(schluessel);
  } catch (fehler) {
    console.error(`ABBRUCH: Zielpruefung fehlgeschlagen (${schluessel}): ${String(fehler?.message || fehler).slice(0, 160)}`);
    process.exit(1);
  }
  if (schonDa) {
    console.error(`ABBRUCH: ${schluessel} existiert bereits. Datensatzversionen sind unveranderlich —`
      + " Korrekturen laufen unter einer NEUEN Version.");
    process.exit(1);
  }
}

for (const [name, contentType] of dateien) {
  const schluessel = `${zielPrefix}/${name}`;
  const koerper = fs.readFileSync(path.join(eingabeDir, name), "utf8");
  try {
    await signedS3Request(config, "PUT", schluessel, koerper, contentType);
    console.log(`HOCHGELADEN: ${schluessel} (${Buffer.byteLength(koerper, "utf8")} Bytes)`);
  } catch (fehler) {
    console.error(`FEHLER bei ${schluessel}: ${String(fehler?.message || fehler).slice(0, 200)}`);
    console.error("TEILUPLOAD moeglich — naechster Versuch prueft jedes Ziel erneut und bricht bei Bestand ab.");
    process.exit(1);
  }
}

console.log("FERTIG: alle vier Dateien unveranderlich abgelegt.");
console.log("Naechster Schritt: SMEJJ_LORA_DATENSATZ_SCHLUESSEL/_MANIFEST der Schleife auf diesen Ziel-Prefix zeigen lassen.");
