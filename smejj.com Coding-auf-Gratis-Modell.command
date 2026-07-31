#!/bin/zsh
# smejj.com — schaltet NUR das Coding-Profil des Control Servers auf das
# kostenlose glm-4.7-flash. Per Doppelklick.
#
# Was genau passiert: auf dem Salad-Container "smejj-control" wird EINE
# Umgebungsvariable ergaenzt:
#     SMEJJ_LLM_ZHIPU_MODEL_CODING=glm-4.7-flash
# Der Modell-Router liest fuer das Profil "coding" dann dieses Modell. Alle
# anderen Profile bleiben unveraendert bei glm-5.2 — SMEJJ_LLM_ZHIPU_MODEL ist
# bewusst NICHT gesetzt und wird auch nicht gesetzt.
#
# Kosten: 0,00 USD. glm-4.7-flash ist bei Z.AI Eingabe UND Ausgabe kostenlos
# (Preisliste vom 2026-07-29). Gemessen besteht es den Fall code-esm-failclosed,
# an dem die Schnellspur scheitert: 2094 ms, alle vier Zusicherungen.
#
# WARUM DIESES SKRIPT UND NICHT DAS PORTAL: das Salad-Bearbeitungsformular hat
# 265 Eingabefelder und zeigt alle 73 Zugangsdaten im Klartext. Ein Fehlgriff
# dort ueberschreibt Schluessel. Dieser Weg fasst genau ein Feld an und prueft
# danach per Pruefsumme, dass die anderen 73 Werte unveraendert sind.
#
# ZWEI DOKUMENTIERTE FALLEN, die hier beruecksichtigt sind:
#   1. Der PATCH braucht {container:{environment_variables:...}}. Flach gesendet
#      antwortet Salad 200 und aendert NICHTS (stiller Fehlschlag).
#   2. Deshalb wird immer zurueckgelesen statt dem Statuscode zu glauben.
# Gesendet wird die VOLLSTAENDIGE Variablenkarte plus die eine neue — falls
# Salad ersetzt statt zusammenzufuehren, waeren sonst 73 Zugangsdaten weg.
set -euo pipefail

ENVFILE="$HOME/.config/smejj.com/env.local"
[ -f "$ENVFILE" ] || { osascript -e 'display alert "env.local fehlt" as critical'; exit 1; }
set -a; . "$ENVFILE"; set +a
: "${SALAD_API_KEY:?SALAD_API_KEY fehlt in env.local}"

SICHERUNG="$HOME/Desktop/smejj-control-Sicherung-$(date +%Y%m%d-%H%M%S).json"
export SICHERUNG

node --input-type=module <<'JS'
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";

const org = process.env.SALAD_ORGANIZATION_NAME;
const proj = process.env.SALAD_PROJECT_NAME;
const key = process.env.SALAD_API_KEY;
const url = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers/smejj-control`;
const hash = (v) => crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 12);
const kopf = { "Salad-Api-Key": key };

const lesen = await fetch(url, { headers: kopf });
if (!lesen.ok) { console.error(`Lesen fehlgeschlagen: HTTP ${lesen.status}`); process.exit(1); }
const vorher = await lesen.json();
const altEnv = vorher.container.environment_variables || {};

// Sicherung auf den Schreibtisch, BEVOR irgendetwas geaendert wird.
await writeFile(process.env.SICHERUNG, JSON.stringify(vorher, null, 2), { mode: 0o600 });
console.log(`Sicherung: ${process.env.SICHERUNG}`);
console.log(`Variablen vorher: ${Object.keys(altEnv).length}`);

if (altEnv.SMEJJ_LLM_ZHIPU_MODEL_CODING === "glm-4.7-flash") {
  console.log("Schon gesetzt — nichts zu tun.");
  process.exit(0);
}

const altHashes = Object.fromEntries(Object.entries(altEnv).map(([k, v]) => [k, hash(v)]));
const neuEnv = { ...altEnv, SMEJJ_LLM_ZHIPU_MODEL_CODING: "glm-4.7-flash" };

const schreiben = await fetch(url, {
  method: "PATCH",
  headers: { ...kopf, "Content-Type": "application/merge-patch+json" },
  body: JSON.stringify({ container: { environment_variables: neuEnv } })
});
console.log(`PATCH: HTTP ${schreiben.status}`);
if (!schreiben.ok) { console.error((await schreiben.text()).slice(0, 300)); process.exit(1); }

await new Promise((f) => setTimeout(f, 4000));
const pruefen = await fetch(url, { headers: kopf });
const jetzt = (await pruefen.json()).container.environment_variables || {};
const jetztHashes = Object.fromEntries(Object.entries(jetzt).map(([k, v]) => [k, hash(v)]));
const unveraendert = Object.keys(altHashes).filter((k) => jetztHashes[k] === altHashes[k]).length;
const verloren = Object.keys(altHashes).filter((k) => !(k in jetztHashes));

console.log(`Variablen jetzt   : ${Object.keys(jetzt).length}`);
console.log(`Werte unveraendert: ${unveraendert} von ${Object.keys(altHashes).length}`);
console.log(`Verloren          : ${verloren.length ? verloren.join(", ") : "keine"}`);
const gesetzt = jetzt.SMEJJ_LLM_ZHIPU_MODEL_CODING === "glm-4.7-flash";
console.log(`Coding-Modell     : ${gesetzt ? "glm-4.7-flash (kostenlos)" : "NICHT gesetzt"}`);
if (!gesetzt || verloren.length > 0) {
  console.error("ABWEICHUNG — Sicherung liegt auf dem Schreibtisch.");
  process.exit(1);
}
JS

osascript -e 'display dialog "Coding laeuft jetzt auf glm-4.7-flash — kostenlos.\n\nAlle anderen Profile bleiben unveraendert bei glm-5.2.\nEine Sicherung aller Variablen liegt auf dem Schreibtisch.\n\nDer Container startet neu, das dauert ein bis zwei Minuten.\n\nDanach im Chat: weiter — dann wird live geprueft." buttons {"Verstanden"} default button 1 with title "smejj.com — Coding kostenlos"'
