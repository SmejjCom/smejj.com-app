#!/usr/bin/env node
// smejj.com — den Anbieter-Credential-Tresor scharfschalten (Betreiber
// 2026-08-17: Cline-Key liess sich nicht speichern — "Der verschluesselte
// Credential-Vault ist serverseitig noch nicht konfiguriert").
//
// Muster wie evolution_melder_scharfschalten.mjs: das Skript WUERFELT das
// Tresor-Geheimnis selbst (ein Geheimnis, das durch eine Assistenten-Sitzung
// reist, ist keines mehr), setzt es per createEnvironmentVariable NUR fuer
// smejj-control und misst danach. createEnvironmentVariable statt der
// Map-Form, die die ganze Umgebung ERSETZT (Salad-Lehre).
//
// Gesetzt werden die beiden Variablen aus providerCredentialVault.js:
//   SMEJJ_PROVIDER_CREDENTIAL_KEY_ID   (Kennung, sichtbar unkritisch)
//   SMEJJ_PROVIDER_CREDENTIAL_KEY_B64  (32-Byte-Schluessel, base64)
//
// Aufruf:
//   CONFIRM_TRESOR_SCHARF=YES node scripts/deploy/provider_tresor_scharfschalten.mjs
import crypto from "node:crypto";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // Projekt "untitled", production
const CONTROL = { name: "smejj-control", id: "6a697bf60d0b094201bcc1ee" };
const GESUNDHEIT = "https://smejj-control.zeabur.app/health";

function abdruck(wert) {
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

async function setze(schluessel, wert) {
  // Feldauswahl NUR `key` — `value` gaebe das Geheimnis im Klartext zurueck.
  await zeaburAbfrage(
    `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
      createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
    }`,
    { s: CONTROL.id, e: UMGEBUNG_ID, k: schluessel, v: wert }
  );
}

async function gesundheit() {
  try {
    const antwort = await fetch(GESUNDHEIT, { signal: AbortSignal.timeout(15_000) });
    return antwort.status;
  } catch (fehler) {
    return `nicht erreichbar (${String(fehler?.message || fehler).slice(0, 60)})`;
  }
}

async function main() {
  if (String(process.env.CONFIRM_TRESOR_SCHARF || "").toUpperCase() !== "YES") {
    console.error("Ohne CONFIRM_TRESOR_SCHARF=YES wird nichts geaendert.");
    process.exit(1);
  }

  const keyId = `tresor-${new Date().toISOString().slice(0, 10)}`;
  const keyB64 = crypto.randomBytes(32).toString("base64");
  console.log(`Tresor-Schluessel gewuerfelt: ${abdruck(keyB64)} (keyId ${keyId})`);

  try {
    await setze("SMEJJ_PROVIDER_CREDENTIAL_KEY_ID", keyId);
    console.log("  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: gesetzt");
    await setze("SMEJJ_PROVIDER_CREDENTIAL_KEY_B64", keyB64);
    console.log("  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: gesetzt");
  } catch (fehler) {
    console.error(`FEHLGESCHLAGEN: ${String(fehler?.message || fehler).slice(0, 200)}`);
    process.exit(1);
  }

  // Zeabur rollt nach einer Variablenaenderung selbst neu aus (beim
  // Evolution-Lauf 2026-08-14 live gemessen). Wir warten auf den Dienst.
  console.log("\nWarte auf den Neustart des Control-Servers (bis zu 4 Minuten) …");
  let stand = null;
  for (let versuch = 1; versuch <= 16; versuch += 1) {
    await new Promise((weiter) => { setTimeout(weiter, 15_000); });
    stand = await gesundheit();
    process.stdout.write(`  Versuch ${versuch}: HTTP ${stand}\n`);
    if (stand === 200 && versuch >= 4) break; // erst nach ~1 min glauben: alter Prozess antwortet sonst noch
  }
  console.log(stand === 200
    ? "\nControl laeuft. Ob der Tresor greift, zeigt die Einstellungen-Seite: der rote Hinweis muss weg sein."
    : `\nControl antwortet noch nicht sauber (zuletzt ${stand}) — in ein paar Minuten die Einstellungen-Seite pruefen.`);
}

main();
