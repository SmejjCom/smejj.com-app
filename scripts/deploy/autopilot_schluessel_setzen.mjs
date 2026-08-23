#!/usr/bin/env node
// smejj.com — SMEJJ_AUTOPILOT_KEYS im Control-Server nachziehen, wenn er fehlt.
//
// BEFUND 2026-08-23: Der Herzschlag-Eingang antwortete auf jede Meldung mit
// 503 autopilot_keys_missing. Die Mac-Jobs (Qualitaets-Pruefer, Code-Sicherung,
// Betriebswache) liefen, ihre Herzschlaege stauten sich seit dem 15.08. in
// ~/.local/share/smejj-qualitaet/herzschlag-warteschlange.jsonl — und die
// Ampel stand auf Grau, ueber ihr "Kein Alarm".
//
// WAS DAS SKRIPT TUT — und was nicht:
// - Es liest den Wert aus ~/.config/smejj.com/autopilot-keys.env (dieselbe
//   Datei, aus der die Mac-Jobs ihren Schluessel nehmen). Nichts wird gewuerfelt,
//   nichts eingegeben: Server und Mac muessen denselben Wert kennen.
// - FAIL-CLOSED: Es setzt NUR, wenn der Eingang gerade 503 autopilot_keys_missing
//   meldet. Ist ein Wert vorhanden (401/403), wird nichts angefasst — ein
//   bestehender Zugang wird nie ueberschrieben (Zugangs-Lock).
// - createEnvironmentVariable, nie updateEnvironmentVariable(data: Map): die
//   Map-Form ERSETZT die Umgebung (Vorfall 2026-08-14).
// - Kein Neustart: Zeabur uebernimmt den Wert beim naechsten Bau. Danach:
//   CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs
// - Der Wert wird NIE ausgegeben, nur Laenge und SHA-256-Prefix.
//
// Aufruf:
//   CONFIRM_AUTOPILOT_KEYS=YES node scripts/deploy/autopilot_schluessel_setzen.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // Projekt "untitled", production
const CONTROL_ID = "6a697bf60d0b094201bcc1ee";   // smejj-control
const EINGANG = "https://smejj-control.zeabur.app/api/autopilot/heartbeat";
const QUELLE = path.join(os.homedir(), ".config", "smejj.com", "autopilot-keys.env");

function abdruck(wert) {
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

/** Der Eingang mit einem Probe-Schluessel: 503 = kein Wert gesetzt, 403 = Wert da. */
async function eingangStand() {
  const antwort = await fetch(EINGANG, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "qualitaetsmessung", key: "probe", status: "ok" }),
    signal: AbortSignal.timeout(20_000)
  });
  const text = await antwort.text().catch(() => "");
  return { status: antwort.status, fehlt: antwort.status === 503 && text.includes("autopilot_keys_missing") };
}

async function main() {
  if (process.env.CONFIRM_AUTOPILOT_KEYS !== "YES") {
    console.log("Nichts getan. Bestaetigen mit CONFIRM_AUTOPILOT_KEYS=YES.");
    return;
  }
  const zeile = fs.readFileSync(QUELLE, "utf8").split("\n").find((z) => z.startsWith("SMEJJ_AUTOPILOT_KEYS="));
  const wert = zeile ? zeile.slice("SMEJJ_AUTOPILOT_KEYS=".length).trim() : "";
  if (!wert || !wert.includes(":")) {
    console.error("Abbruch: kein brauchbarer Wert in " + QUELLE);
    process.exitCode = 1;
    return;
  }
  console.log("Quelle: " + QUELLE + " → " + abdruck(wert) + ", " + wert.split(",").length + " Kennungen");

  const vorher = await eingangStand();
  console.log("Eingang vorher: HTTP " + vorher.status + (vorher.fehlt ? " (autopilot_keys_missing)" : ""));
  if (!vorher.fehlt) {
    console.log("Nichts gesetzt: der Server hat bereits einen Wert — ein bestehender Zugang wird nicht ueberschrieben.");
    return;
  }
  await zeaburAbfrage(
    `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
      createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
    }`,
    { s: CONTROL_ID, e: UMGEBUNG_ID, k: "SMEJJ_AUTOPILOT_KEYS", v: wert }
  );
  console.log("Gesetzt bei smejj-control: SMEJJ_AUTOPILOT_KEYS (" + abdruck(wert) + "). Wirkt ab dem naechsten Bau/Neustart.");
}

main().catch((fehler) => {
  console.error("Fehler: " + String(fehler?.message || fehler).slice(0, 200));
  process.exitCode = 1;
});
