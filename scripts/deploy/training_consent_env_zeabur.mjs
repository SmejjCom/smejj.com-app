#!/usr/bin/env node
// smejj.com — die fuenf Einwilligungs-Pflichtwerte auf ZEABUR (smejj-control)
// setzen. Nachfolger von set_training_consent_env.mjs, das noch auf das alte
// Salad-Hosting zielt.
//
// ANLASS 2026-08-24: Seit der geloeschten Control-Umgebung (14.08.) fehlen
//   SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64 / _ID
//   SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64 / _ID
//   SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256
// Folge, live gemessen (Betriebswache 23./24.08.): /api/training/consent/notice
// antwortet 503 consent_configuration_incomplete, der Einwilligungs-Schalter im
// Konto springt zurueck ("Einwilligung derzeit nicht moeglich").
//
// DIE REIHENFOLGE-SICHERUNG bleibt wie im Salad-Vorgaenger: Der Hash beschreibt
// die Datenschutzerklaerung, gegen die ein Nutzer einwilligt. Dieses Skript holt
// die LIVE-Seite (https://smejj.com/datenschutz.html) und rechnet den Hash
// selbst — es kann also nie den Hash einer unveroeffentlichten Fassung setzen.
//
// WAS ES NICHT TUT:
//   - Es zeigt keine Schluesselwerte an (nur 32-Byte-Fingerabdruecke).
//   - Es ueberschreibt keinen bestehenden Wert: steht ein Name schon in der
//     Zeabur-Umgebung, wird er uebersprungen. Ein Schluesseltausch entwertet
//     alle erteilten Einwilligungen — das passiert nie nebenbei.
//   - createEnvironmentVariable je Wert — NIE updateEnvironmentVariable
//     (die Map-Form ERSETZT die ganze Umgebung, Vorfall 2026-08-14).
// - Wirkt erst nach einem NEUBAU (ein Neustart zieht keine neue Umgebung):
//   CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs
//
// Aufruf:
//   node scripts/deploy/training_consent_env_zeabur.mjs --pruefen   (nur ansehen)
//   node scripts/deploy/training_consent_env_zeabur.mjs --setzen
import crypto from "node:crypto";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // Projekt "untitled", production
const CONTROL_ID = "6a697bf60d0b094201bcc1ee";   // smejj-control
const NOTICE_URL = "https://smejj.com/datenschutz.html";
const MIN_ENV = 30; // deutlich weniger Variablen = Umgebung sieht kaputt aus, nichts anfassen

const args = new Set(process.argv.slice(2));
const setzen = args.has("--setzen");
if (!setzen && !args.has("--pruefen")) {
  console.error("Aufruf: --pruefen (nur ansehen) oder --setzen (schreiben).");
  process.exit(1);
}

const fingerabdruck = (wert) => crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8);
// Format wie src/training/consent.js decode32ByteKey erwartet: 32 Byte, Standard-Base64.
const neuerSchluessel = () => crypto.randomBytes(32).toString("base64");

async function liveNoticeHash() {
  const antwort = await fetch(NOTICE_URL, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
  if (!antwort.ok) throw new Error(`${NOTICE_URL} -> HTTP ${antwort.status}`);
  return crypto.createHash("sha256").update(Buffer.from(await antwort.arrayBuffer())).digest("hex");
}

async function main() {
  const daten = await zeaburAbfrage(
    `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key } } }`,
    { s: CONTROL_ID, e: UMGEBUNG_ID }
  );
  const vorhanden = new Set((daten?.service?.variables || []).map((v) => v.key));
  if (vorhanden.size < MIN_ENV) {
    console.error(`Abbruch: nur ${vorhanden.size} Variablen auf dem Dienst — das sieht nach einer beschaedigten Umgebung aus.`);
    process.exitCode = 1;
    return;
  }

  const hashLive = await liveNoticeHash();
  console.log(`Datenschutzerklaerung live: ${hashLive.slice(0, 16)}…`);

  const signatur = neuerSchluessel();
  const bindung = neuerSchluessel();
  if (signatur === bindung) throw new Error("Signatur- und Bindungsschluessel waeren identisch.");

  const neu = {
    SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: hashLive,
    SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v2",
    SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: signatur,
    SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v2",
    SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: bindung
  };

  console.log(`\nUmgebung traegt ${vorhanden.size} Variablen. Plan:`);
  const zuSetzen = [];
  for (const [name, wert] of Object.entries(neu)) {
    const steht = vorhanden.has(name);
    const zeige = name.endsWith("_B64") ? `(32 Byte, Fingerabdruck ${fingerabdruck(wert)})` : wert;
    console.log(`  ${name.padEnd(42)} ${steht ? "STEHT SCHON — bleibt unangetastet" : "NEU  " + zeige}`);
    if (!steht) zuSetzen.push([name, wert]);
  }
  if (!vorhanden.has("SMEJJ_TRAINING_CONSENT_API_ENABLED")) {
    console.log(`  ${"SMEJJ_TRAINING_CONSENT_API_ENABLED".padEnd(42)} NEU  YES`);
    zuSetzen.push(["SMEJJ_TRAINING_CONSENT_API_ENABLED", "YES"]);
  }

  if (!setzen) {
    console.log("\nNur geprueft, nichts geschrieben. Zum Schreiben: --setzen");
    return;
  }
  if (!zuSetzen.length) {
    console.log("\nNichts zu setzen — alle Namen stehen bereits.");
    return;
  }
  for (const [name, wert] of zuSetzen) {
    await zeaburAbfrage(
      `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
        createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
      }`,
      { s: CONTROL_ID, e: UMGEBUNG_ID, k: name, v: wert }
    );
    console.log("Gesetzt: " + name);
  }
  console.log("\nWirkt erst nach dem Neubau: CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs");
}

main().catch((fehler) => {
  console.error("FEHLER: " + (fehler?.message || fehler));
  process.exitCode = 1;
});
