#!/usr/bin/env node
// smejj.com — nur den Trainer-CODE in der laufenden Salad-Gruppe erneuern.
//
// Trockenlauf (Standard, schreibt nichts):
//   node scripts/deploy/update_lora_trainer_bundle.mjs
// Wirklich schreiben:
//   CONFIRM_TRAINER_BUNDLE=YES node scripts/deploy/update_lora_trainer_bundle.mjs
//
// WARUM EIN EIGENES SKRIPT NEBEN create_lora_trainer_group.mjs:
// Jenes Skript baut die Umgebung aus lokalen Variablen neu auf. Fehlt lokal
// eine davon (etwa SMEJJ_LORA_BASIS_HF_REPO), faellt sie aus dem Aufruf heraus —
// und weil Salad die Umgebung ERSETZT statt sie zu mischen, waere sie danach im
// Dienst geloescht. Am 2026-08-02 hat genau das schon einmal das Code-Buendel
// samt allen anderen Werten entfernt.
//
// Deshalb hier strikt: LESEN — ERGAENZEN — GANZ ZURUECKSCHREIBEN — GEGENLESEN.
// Geaendert wird ausschliesslich SMEJJ_TRAINER_BUNDLE_B64.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { ABBILD, startBefehl } from "./lora_trainer_rezept.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRUPPE = process.env.SMEJJ_TRAINER_GRUPPE || "smejj-lora-trainer";

loadSecureLocalEnv();

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt`);
  return wert;
}

const API_KEY = pflicht("SALAD_API_KEY");
const BASIS = `https://api.salad.com/api/public/organizations/${pflicht("SALAD_ORGANIZATION_NAME")}`
  + `/projects/${pflicht("SALAD_PROJECT_NAME")}/containers`;

async function api(pfad, methode = "GET", koerper = null) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": API_KEY,
      accept: "application/json",
      // PATCH verlangt merge-patch+json; mit application/json antwortet die
      // API HTTP 415 (gemessen 2026-08-01).
      ...(koerper ? { "content-type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined
  });
  const text = await antwort.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch { /* Rohtext genuegt */ }
  return { ok: antwort.ok, status: antwort.status, daten, text };
}

function baueBuendel() {
  const roh = execFileSync(
    "tar",
    ["czf", "-", "--exclude", "README.md", "--exclude", "__pycache__", "smejj-lora-trainer"],
    { cwd: path.join(REPO, "workers"), maxBuffer: 8 * 1024 * 1024 }
  );
  return roh.toString("base64");
}

/**
 * Fingerabdruck ueber den QUELLTEXT, nicht ueber das Archiv.
 *
 * Gemessen am 2026-08-03: `tar czf -` schreibt in eine Pipe blockweise aufgefuellt
 * (hier immer 20480 Byte) und gzip traegt einen Zeitstempel ein. Das Archiv ist
 * damit bei JEDEM Aufruf anders und gleichzeitig immer gleich lang — als
 * Aenderungsanzeige taugt es in beide Richtungen nicht. Der Hash ueber die
 * Dateiinhalte ist stabil und sagt zusaetzlich, welcher Stand wirklich laeuft.
 */
function quellAbdruck() {
  const wurzel = path.join(REPO, "workers", "smejj-lora-trainer");
  const dateien = readdirSync(wurzel).filter((n) => n.endsWith(".py")).sort();
  const hash = createHash("sha256");
  for (const name of dateien) {
    hash.update(name);
    hash.update(readFileSync(path.join(wurzel, name)));
  }
  return `${hash.digest("hex").slice(0, 16)}:${dateien.length}`;
}

/**
 * Liest die Gruppe zurueck, bis der erwartete Abdruck erscheint.
 * Gibt nach der letzten Runde den zuletzt gelesenen Stand zurueck — auch wenn
 * er nicht passt, denn dann SOLL der Aufrufer die Abweichung melden.
 */
// 20 x 3 s = bis zu einer Minute. Gemessen am 2026-08-03: 12 Sekunden waren zu
// kurz, der neue Stand erschien erst danach. Lieber eine Minute warten als eine
// gelungene Aenderung faelschlich als gescheitert melden.
async function gegenlese(erwarteterAbdruck, versuche = 20, pauseMs = 3000) {
  let letzter = null;
  for (let runde = 1; runde <= versuche; runde += 1) {
    letzter = await api(`/${GRUPPE}`);
    const gelesen = letzter.daten?.container?.environment_variables?.SMEJJ_TRAINER_CODE_ABDRUCK;
    if (gelesen === erwarteterAbdruck) {
      if (runde > 1) console.log(`(Abdruck erst im ${runde}. Leseversuch sichtbar — die API antwortet verzoegert.)`);
      return letzter;
    }
    if (runde < versuche) await new Promise((fertig) => setTimeout(fertig, pauseMs));
  }
  return letzter;
}

async function main() {
  const vorher = await api(`/${GRUPPE}`);
  if (!vorher.ok) {
    console.error(`Gruppe ${GRUPPE} nicht lesbar: HTTP ${vorher.status}`);
    process.exitCode = 1;
    return;
  }

  const alteUmgebung = vorher.daten?.container?.environment_variables || {};
  const alterAbdruck = alteUmgebung.SMEJJ_TRAINER_CODE_ABDRUCK || "(unbekannt)";
  const neuerAbdruck = quellAbdruck();
  const neuesBuendel = baueBuendel();

  // Die vollstaendige alte Umgebung, mit genau zwei ausgetauschten Werten.
  const neueUmgebung = {
    ...alteUmgebung,
    SMEJJ_TRAINER_BUNDLE_B64: neuesBuendel,
    SMEJJ_TRAINER_CODE_ABDRUCK: neuerAbdruck
  };

  const altesAbbild = vorher.daten?.container?.image || "";
  const alterBefehl = vorher.daten?.container?.command || [];
  const neuerBefehl = startBefehl();
  const abbildWechselt = altesAbbild !== ABBILD;
  const befehlWechselt = JSON.stringify(alterBefehl) !== JSON.stringify(neuerBefehl);

  console.log(`Gruppe:    ${GRUPPE} (Zustand ${vorher.daten?.current_state?.status || "?"})`);
  console.log(`Abdruck:   ${alterAbdruck} -> ${neuerAbdruck}`);
  console.log(`Abbild:    ${abbildWechselt ? `${altesAbbild}\n           -> ${ABBILD}` : `${ABBILD} (unveraendert)`}`);
  console.log(`Startbefehl: ${befehlWechselt ? "GEAENDERT" : "unveraendert"}`);
  console.log(`Buendel:   ${neuesBuendel.length} Zeichen base64`);
  console.log(`Variablen: ${Object.keys(neueUmgebung).length} (unveraendert bis auf Buendel und Abdruck)`);
  if (alterAbdruck === neuerAbdruck && !abbildWechselt && !befehlWechselt
      && process.env.SMEJJ_TRAINER_ERZWINGEN !== "YES") {
    console.log("\nQuelltext, Abbild und Startbefehl unveraendert — nichts zu tun."
      + " Erzwingen: SMEJJ_TRAINER_ERZWINGEN=YES");
    return;
  }

  if (process.env.CONFIRM_TRAINER_BUNDLE !== "YES") {
    console.log("\nTrockenlauf — nichts geschrieben. Zum Schreiben: CONFIRM_TRAINER_BUNDLE=YES");
    return;
  }

  const geschrieben = await api(`/${GRUPPE}`, "PATCH", {
    container: { image: ABBILD, command: neuerBefehl, environment_variables: neueUmgebung }
  });
  if (!geschrieben.ok) {
    console.error(`FEHLER HTTP ${geschrieben.status}: ${geschrieben.text.slice(0, 600)}`);
    process.exitCode = 1;
    return;
  }

  // Gegenlesen ist Pflicht: die Salad-API bestaetigt Schreibvorgaenge auch dann
  // mit 200, wenn sie nichts geaendert hat — und sie hat schon einmal eine
  // Startsonde von selbst wieder eingesetzt. Geprueft wird deshalb nicht nur
  // das Buendel, sondern dass KEIN anderer Wert verlorenging.
  //
  // MIT WARTEN UND WIEDERHOLUNG, gemessen am 2026-08-03: ein GET unmittelbar
  // nach dem PATCH liefert noch den ALTEN Stand. Ohne diese Schleife meldet das
  // Skript "NICHT uebernommen", obwohl der Schreibvorgang gelungen ist — eine
  // Falschmeldung, die zu einem zweiten, unnoetigen Deploy verleitet.
  const nachher = await gegenlese(neuerAbdruck);
  const jetzt = nachher.daten?.container?.environment_variables || {};
  const unveraenderlich = new Set(["SMEJJ_TRAINER_BUNDLE_B64", "SMEJJ_TRAINER_CODE_ABDRUCK"]);
  const verloren = Object.keys(alteUmgebung).filter((k) => !(k in jetzt));
  const veraendert = Object.keys(alteUmgebung).filter(
    (k) => !unveraenderlich.has(k) && jetzt[k] !== alteUmgebung[k]
  );

  console.log(`\nZurueckgelesen: ${Object.keys(jetzt).length} Variablen`);
  console.log(`Abbild jetzt:   ${nachher.daten?.container?.image || "(fehlt)"}`
    + ` (${nachher.daten?.container?.image === ABBILD ? "UEBERNOMMEN" : "NICHT uebernommen"})`);
  console.log(`Befehl jetzt:   ${JSON.stringify(nachher.daten?.container?.command || []) === JSON.stringify(neuerBefehl) ? "UEBERNOMMEN" : "NICHT uebernommen"}`);
  console.log(`Abdruck jetzt:  ${jetzt.SMEJJ_TRAINER_CODE_ABDRUCK || "(fehlt)"}`);
  console.log(`Buendel jetzt:  ${(jetzt.SMEJJ_TRAINER_BUNDLE_B64 || "").length} Zeichen`
    + ` (${jetzt.SMEJJ_TRAINER_BUNDLE_B64 === neuesBuendel ? "UEBERNOMMEN" : "NICHT uebernommen"})`);
  console.log(`Startsonde:     ${nachher.daten?.startup_probe ? "vorhanden" : "keine"}`);
  if (verloren.length) console.log(`WARNUNG verlorene Variablen: ${verloren.join(", ")}`);
  if (veraendert.length) console.log(`WARNUNG veraenderte Variablen: ${veraendert.join(", ")}`);
  if (!verloren.length && !veraendert.length) console.log("Alle uebrigen Variablen unveraendert.");

  if (jetzt.SMEJJ_TRAINER_BUNDLE_B64 !== neuesBuendel) process.exitCode = 1;
}

main().catch((fehler) => {
  console.error(`FEHLER: ${String(fehler?.stack || fehler)}`);
  process.exitCode = 1;
});
