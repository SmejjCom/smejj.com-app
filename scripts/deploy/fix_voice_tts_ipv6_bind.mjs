#!/usr/bin/env node
// smejj.com — Startbefehl der XTTS-Gruppe auf IPv6-Bind umstellen (2026-08-03).
//
// Befund (Instanz-Logs, Portal): "Uvicorn running on http://0.0.0.0:80" —
// die Anwendung lauscht NUR auf IPv4. SaladCloud verbindet das Container-
// Gateway aber ausschliesslich ueber IPv6; der Server war deshalb seit dem
// Anlegen der Gruppe (2026-07-20) trotz RUNNING+READY nie erreichbar
// (Gateway-503/404 bei laufender Anwendung). Fix: uvicorn-Host "::".
//
// Sicherheitsmodell: merge-PATCH aendert NUR container.command; die
// Umgebungsvariablen werden vorher und nachher gezaehlt und verglichen
// (Salad-Ersetzungs-Falle). Fail-closed: jede Abweichung bricht ab.
//
// Aufruf: CONFIRM_VOICE_TTS_FIX=YES node scripts/deploy/fix_voice_tts_ipv6_bind.mjs
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = "smejj-voice-tts";
const NEUES_KOMMANDO = ["uvicorn", "main:app", "--host", "::", "--port", "80"];

function abbruch(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

loadSecureLocalEnv();
if (process.env.CONFIRM_VOICE_TTS_FIX !== "YES") abbruch("CONFIRM_VOICE_TTS_FIX=YES fehlt.");
const org = process.env.SALAD_ORGANIZATION_NAME;
const projekt = process.env.SALAD_PROJECT_NAME;
const schluessel = process.env.SALAD_API_KEY;
if (!org || !projekt || !schluessel) abbruch("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");

const basis = `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers/${GRUPPE}`;
const kopf = { "Salad-Api-Key": schluessel, "Content-Type": "application/merge-patch+json" };

const vorher = await (await fetch(basis, { headers: kopf })).json();
const envVorher = Object.keys(vorher.container?.environment_variables || {}).length;
console.log("cmd vorher:", JSON.stringify(vorher.container?.command));
console.log("env-anzahl vorher:", envVorher);
if (envVorher < 1) abbruch("Umgebung unerwartet leer — Abbruch.");

const antwort = await fetch(basis, {
  method: "PATCH",
  headers: kopf,
  body: JSON.stringify({ container: { command: NEUES_KOMMANDO } })
});
if (!antwort.ok) abbruch(`PATCH fehlgeschlagen: ${antwort.status}`);

const nachher = await (await fetch(basis, { headers: kopf })).json();
const envNachher = Object.keys(nachher.container?.environment_variables || {}).length;
console.log("cmd nachher:", JSON.stringify(nachher.container?.command));
console.log("env-anzahl nachher:", envNachher);
if (envNachher !== envVorher) abbruch("WARNUNG: Umgebungs-Anzahl veraendert — pruefen!");
console.log(JSON.stringify({ ok: true, gruppe: GRUPPE, ipv6Bind: true }));
