#!/usr/bin/env node
// smejj.com — Registry der Hausmodelle in IDrive e2.
//
// Die Registry ist die EINZIGE Wahrheit darueber, welche Modelle smejj.com
// besitzt. Sie liegt in e2 (Eimer aus IDRIVE_E2_BUCKET) unter:
//   models/production/<name>/   lauffaehig, vom Hausmodell-Dienst benutzt
//   models/staging/<name>/      in Pruefung
//   models/archive/<name>/      Besitz, auf 2C/8GB NICHT lauffaehig
//   webhooks/                   Ereignisse aus dem Webhook-Gateway
//   logs/                       Betriebsprotokolle des Hausmodell-Dienstes
//
// Je Modell: manifest.json (model_id, version, format, size_bytes, sha256,
// storage, status) und sha256.txt (eine Zeile je Datei, wie sha256sum).
//
// Befehle:
//   node scripts/model-management/hausmodell-registry.mjs init      Struktur anlegen
//   node scripts/model-management/hausmodell-registry.mjs liste     Inhalt zeigen
//   node scripts/model-management/hausmodell-registry.mjs zeige <stufe>/<name>
//   node scripts/model-management/hausmodell-registry.mjs kosten    Lagerkosten rechnen
//
// KOSTEN: e2 kostet rund 4 USD je TB und Monat. "kosten" rechnet den Ist-Stand
// aus, damit vor jedem Archiv-Upload die Kostenwahrheit auf dem Tisch liegt.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2AusUmgebung } from "../../workers/smejj-hausmodell/e2.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USD_JE_TB_MONAT = 4;
const STUFEN = ["production", "staging", "archive"];

ladeLokaleUmgebung();

const befehl = process.argv[2] || "liste";
const argument = process.argv[3] || "";

try {
  const e2 = e2AusUmgebung();
  if (befehl === "init") await init(e2);
  else if (befehl === "liste") await liste(e2);
  else if (befehl === "zeige") await zeige(e2, argument);
  else if (befehl === "kosten") await kosten(e2);
  else {
    console.error(`Unbekannter Befehl: ${befehl}`);
    process.exit(2);
  }
} catch (fehler) {
  console.error(`FEHLER: ${fehler.message}`);
  process.exit(1);
}

/** Legt die Registry-Struktur an. Vorhandene Objekte werden NICHT ueberschrieben. */
async function init(e2) {
  const jetzt = new Date().toISOString();
  const eintraege = [
    ["models/README.json", { zweck: "Registry der smejj.com-Hausmodelle", stufen: STUFEN, angelegt: jetzt }],
    ["models/production/.registry.json", { stufe: "production", bedeutung: "lauffaehig auf 2C/8GB, vom Dienst smejj-hausmodell benutzt", angelegt: jetzt }],
    ["models/staging/.registry.json", { stufe: "staging", bedeutung: "in Pruefung, noch nicht im Router", angelegt: jetzt }],
    ["models/archive/.registry.json", { stufe: "archive", bedeutung: "Besitz-Archiv, auf 2C/8GB NICHT lauffaehig (status archive-only)", angelegt: jetzt }],
    ["webhooks/.registry.json", { zweck: "Ereignisse aus /api/webhook/:kanal", aufbewahrung: "unbefristet bis Betreiber-Entscheid", angelegt: jetzt }],
    ["logs/.registry.json", { zweck: "Betriebsprotokolle Hausmodell-Dienst", angelegt: jetzt }]
  ];
  for (const [schluessel, inhalt] of eintraege) {
    const vorhanden = await e2.kopf(schluessel);
    if (vorhanden) {
      console.log(`= ${schluessel} (existiert, unveraendert)`);
      continue;
    }
    await e2.schreibJson(schluessel, inhalt);
    console.log(`+ ${schluessel}`);
  }
  console.log("\nRegistry-Struktur steht.");
}

async function liste(e2) {
  for (const stufe of STUFEN) {
    const objekte = await e2.liste(`models/${stufe}/`);
    const modelle = new Map();
    for (const objekt of objekte) {
      const rest = objekt.schluessel.slice(`models/${stufe}/`.length);
      const name = rest.split("/")[0];
      if (!name || name.startsWith(".")) continue;
      const eintrag = modelle.get(name) || { dateien: 0, bytes: 0 };
      eintrag.dateien += 1;
      eintrag.bytes += objekt.groesse;
      modelle.set(name, eintrag);
    }
    console.log(`\n## ${stufe} (${modelle.size} Modelle)`);
    if (!modelle.size) {
      console.log("   (leer)");
      continue;
    }
    for (const [name, wert] of [...modelle].sort()) {
      const manifest = await e2.liesJson(`models/${stufe}/${name}/manifest.json`);
      const status = manifest?.status || "OHNE MANIFEST";
      console.log(`   ${name.padEnd(30)} ${lesbar(wert.bytes).padStart(11)}  ${String(wert.dateien).padStart(3)} Dateien  [${status}]`);
    }
  }
}

async function zeige(e2, pfad) {
  if (!/^[a-z]+\/[\w.-]+$/.test(pfad)) throw new Error("Aufruf: zeige <stufe>/<name>");
  const manifest = await e2.liesJson(`models/${pfad}/manifest.json`);
  if (!manifest) throw new Error(`kein manifest.json unter models/${pfad}/`);
  console.log(JSON.stringify(manifest, null, 2));
  const summen = await e2.lies(`models/${pfad}/sha256.txt`);
  console.log(`\nsha256.txt: ${summen ? `${summen.trim().split("\n").length} Zeilen` : "FEHLT"}`);
}

/** Kostenwahrheit: was liegt im Eimer und was kostet es im Monat. */
async function kosten(e2) {
  const bereiche = ["models/", "model-files/", "webhooks/", "logs/"];
  let gesamt = 0;
  console.log("Lagerstand (gemessen, nicht geschaetzt):\n");
  for (const bereich of bereiche) {
    const objekte = await e2.liste(bereich, { maxSeiten: 200 });
    const bytes = objekte.reduce((summe, o) => summe + o.groesse, 0);
    gesamt += bytes;
    console.log(`  ${bereich.padEnd(16)} ${lesbar(bytes).padStart(11)}  ${String(objekte.length).padStart(5)} Objekte   ~${preis(bytes)}`);
  }
  console.log(`\n  ${"SUMME".padEnd(16)} ${lesbar(gesamt).padStart(11)}                    ~${preis(gesamt)}`);
  console.log(`\n(Rechengrundlage: ${USD_JE_TB_MONAT} USD je TB und Monat.)`);
}

function preis(bytes) {
  const tb = bytes / 1e12;
  return `${(tb * USD_JE_TB_MONAT).toFixed(2)} USD/Monat`;
}

function lesbar(bytes) {
  const einheiten = ["B", "KiB", "MiB", "GiB", "TiB"];
  let wert = bytes;
  let i = 0;
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024;
    i += 1;
  }
  return `${wert.toFixed(i ? 2 : 0)} ${einheiten[i]}`;
}

/** Laedt die e2-Zugangsdaten aus der lokalen, geschuetzten Env-Datei. */
function ladeLokaleUmgebung() {
  const pfad = process.env.SMEJJ_LOCAL_ENV_FILE || path.join(process.env.HOME || WURZEL, ".config/smejj.com/env.local");
  if (!fs.existsSync(pfad)) return;
  for (const zeile of fs.readFileSync(pfad, "utf8").split(/\r?\n/)) {
    const gekuerzt = zeile.trim();
    if (!gekuerzt || gekuerzt.startsWith("#")) continue;
    const trenner = gekuerzt.indexOf("=");
    if (trenner <= 0) continue;
    const name = gekuerzt.slice(0, trenner);
    if (!process.env[name]) process.env[name] = gekuerzt.slice(trenner + 1);
  }
}
