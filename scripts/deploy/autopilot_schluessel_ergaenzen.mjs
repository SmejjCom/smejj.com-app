#!/usr/bin/env node
// smejj.com — EINE Kennung in SMEJJ_AUTOPILOT_KEYS ergaenzen (lokal + Zeabur),
// ohne bestehende Eintraege anzufassen.
//
// ANLASS 2026-08-24: Die Betriebswache (Kennung oberflaechenwache) lief zum
// ersten Mal, konnte aber keinen Herzschlag senden — in
// ~/.config/smejj.com/autopilot-keys.env fehlte ihre Kennung, und damit auch
// im Control-Server (der Wert dort wurde am 23.08. aus GENAU dieser Datei
// gesetzt: scripts/deploy/autopilot_schluessel_setzen.mjs — Server und Mac
// muessen denselben Wert kennen).
//
// - Der Schluessel wird HIER gewuerfelt und nie ausgegeben (nur Laenge und
//   SHA-256-Prefix). Ein Geheimnis, das durch eine Sitzung reist, ist keines.
// - Lokal: die Zeile wird ergaenzt, alle bestehenden Kennungen bleiben
//   wortgleich. Vorher Sicherung nach autopilot-keys.env.bak-<datum>.
// - Server: updateSingleEnvironmentVariable — NIE updateEnvironmentVariable
//   (die Map-Form ERSETZT die ganze Umgebung, Vorfall 2026-08-14).
// - FAIL-CLOSED: bricht ab, wenn die Kennung lokal schon steht, wenn der
//   Server gar keinen Wert traegt (dann ist setzen.mjs der richtige Weg)
//   oder wenn der Eingang nicht wie erwartet antwortet.
// - Wirkt erst nach einem NEUBAU (ein Neustart zieht keine neue Umgebung):
//   CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs
//
// Aufruf:
//   CONFIRM_AUTOPILOT_KEYS=YES node scripts/deploy/autopilot_schluessel_ergaenzen.mjs <kennung>
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // Projekt "untitled", production
const CONTROL_ID = "6a697bf60d0b094201bcc1ee";   // smejj-control
const EINGANG = "https://smejj-control.zeabur.app/api/autopilot/heartbeat";
const QUELLE = path.join(os.homedir(), ".config", "smejj.com", "autopilot-keys.env");

const abdruck = (wert) =>
  `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;

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
  const kennung = String(process.argv[2] || "").trim();
  if (!/^[a-z][a-z0-9-]{2,60}$/.test(kennung)) {
    console.error("Abbruch: Kennung fehlt oder unbrauchbar (erwartet z. B. oberflaechenwache).");
    process.exitCode = 1;
    return;
  }

  const inhalt = fs.readFileSync(QUELLE, "utf8");
  const zeilen = inhalt.split("\n");
  const idx = zeilen.findIndex((z) => z.startsWith("SMEJJ_AUTOPILOT_KEYS="));
  const wert = idx >= 0 ? zeilen[idx].slice("SMEJJ_AUTOPILOT_KEYS=".length).trim() : "";
  if (!wert || !wert.includes(":")) {
    console.error("Abbruch: kein brauchbarer Wert in " + QUELLE);
    process.exitCode = 1;
    return;
  }
  if (wert.split(",").some((p) => p.split(":")[0] === kennung)) {
    console.error(`Abbruch: Kennung ${kennung} steht bereits in ${QUELLE} — nichts zu tun.`);
    process.exitCode = 1;
    return;
  }

  const vorher = await eingangStand();
  if (vorher.fehlt) {
    console.error("Abbruch: der Server traegt GAR KEINEN Wert (503 autopilot_keys_missing) —");
    console.error("das ist der Fall fuer autopilot_schluessel_setzen.mjs, nicht fuer dieses Skript.");
    process.exitCode = 1;
    return;
  }
  console.log(`Eingang vorher: HTTP ${vorher.status} (Wert vorhanden — Kennung wird ergaenzt).`);

  // Serverseitig muss die Variable existieren, sonst waere update ein create.
  const daten = await zeaburAbfrage(
    `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key } } }`,
    { s: CONTROL_ID, e: UMGEBUNG_ID }
  );
  const namen = new Set((daten?.service?.variables || []).map((v) => v.key));
  if (!namen.has("SMEJJ_AUTOPILOT_KEYS")) {
    console.error("Abbruch: SMEJJ_AUTOPILOT_KEYS existiert auf dem Server nicht — setzen.mjs nutzen.");
    process.exitCode = 1;
    return;
  }

  // base64url: enthaelt weder ":" noch "," — beides sind Trennzeichen im Wert.
  const schluessel = crypto.randomBytes(24).toString("base64url");
  const neuerWert = `${wert},${kennung}:${schluessel}`;

  const sicherung = QUELLE + ".bak-" + new Date().toISOString().slice(0, 10);
  fs.copyFileSync(QUELLE, sicherung);
  zeilen[idx] = "SMEJJ_AUTOPILOT_KEYS=" + neuerWert;
  fs.writeFileSync(QUELLE, zeilen.join("\n"), { mode: 0o600 });
  console.log(`Lokal ergaenzt (${kennung}): ${abdruck(neuerWert)}, ${neuerWert.split(",").length} Kennungen. Sicherung: ${path.basename(sicherung)}`);

  try {
    await zeaburAbfrage(
      `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
        updateSingleEnvironmentVariable(serviceID: $s, environmentID: $e, oldKey: $k, newKey: $k, value: $v) { key }
      }`,
      { s: CONTROL_ID, e: UMGEBUNG_ID, k: "SMEJJ_AUTOPILOT_KEYS", v: neuerWert }
    );
  } catch (fehler) {
    // Manche Listen-Rueckgaben vertragen keine Feldauswahl — einmal ohne probieren.
    if (!String(fehler?.message || "").includes("422")) throw fehler;
    await zeaburAbfrage(
      `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
        updateSingleEnvironmentVariable(serviceID: $s, environmentID: $e, oldKey: $k, newKey: $k, value: $v)
      }`,
      { s: CONTROL_ID, e: UMGEBUNG_ID, k: "SMEJJ_AUTOPILOT_KEYS", v: neuerWert }
    );
  }
  console.log(`Gesetzt bei smejj-control: SMEJJ_AUTOPILOT_KEYS (${abdruck(neuerWert)}).`);
  console.log("Wirkt erst nach dem Neubau: CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs");
}

main().catch((fehler) => {
  console.error("FEHLER: " + (fehler?.message || fehler));
  process.exitCode = 1;
});
