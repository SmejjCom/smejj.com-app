#!/usr/bin/env node
// smejj.com — Reparatur: den Config-Mount von /tmp/smejj-chat-bridge.mjs wieder
// entfernen und die Bridge neu starten.
//
// WAS PASSIERT IST (2026-08-18, selbst verursacht):
// deploy_chat_bridge_zeabur.mjs schrieb das Buendel per `updateServiceConfig`
// nach /tmp/smejj-chat-bridge.mjs. Dieser Befehl legt die Datei aber nicht
// einfach ab — er haengt sie als SCHREIBGESCHUETZTEN Config-Mount in den
// Container. Der Startbefehl des Dienstes laedt seinen Quelltext jedoch selbst
// per curl an genau diesen Pfad. Ergebnis im Log:
//   curl: (23) Failure writing output to destination
//   -> Container-Start scheitert -> BackOff-Schleife -> 502 auf /health.
//
// Der Mount muss also weg, damit der Startbefehl wieder schreiben darf. Danach
// laeuft die Bridge wie vor dem Versuch — mit ihrem alten Quelltext, den sie
// sich beim Start selbst holt.
//
// Aufruf:
//   CONFIRM_BRIDGE_REPAIR=YES node scripts/deploy/bruecke-config-mount-entfernen.mjs
//
// Fail-closed: ohne Bestaetigung passiert nichts. Der Pfad ist fest verdrahtet,
// damit dieses Skript nichts anderes entfernen kann als genau diesen einen
// Mount.
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const SERVICE_ID = "6a6680070d0b094201bb9ce4";
const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2";
const PFAD = "/tmp/smejj-chat-bridge.mjs";
const GESUNDHEIT = "https://smejj-chat-bridge.zeabur.app/health";

if (process.env.CONFIRM_BRIDGE_REPAIR !== "YES") {
  console.error("Sicherung: CONFIRM_BRIDGE_REPAIR=YES erforderlich.");
  process.exit(1);
}

async function configPfade() {
  try {
    const daten = await zeaburAbfrage(
      `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ configPaths(environmentID:$e) } }`,
      { s: SERVICE_ID, e: UMGEBUNG_ID }
    );
    return daten?.service?.configPaths || [];
  } catch (fehler) {
    return [`(nicht lesbar: ${fehler.message})`];
  }
}

console.log("configPaths vorher:", JSON.stringify(await configPfade()));

const entfernt = await zeaburAbfrage(
  `mutation($s:ObjectID!,$e:ObjectID!,$p:String!){ deleteServiceConfig(serviceID:$s, environmentID:$e, path:$p) }`,
  { s: SERVICE_ID, e: UMGEBUNG_ID, p: PFAD }
);
console.log("deleteServiceConfig:", JSON.stringify(entfernt));
console.log("configPaths nachher:", JSON.stringify(await configPfade()));

// Neustart: `restartService` traegt bei diesem PREBUILT_V2-Dienst,
// `redeployService` antwortet mit "Cannot redeploy in-place".
const neustart = await zeaburAbfrage(
  `mutation($s:ObjectID!,$e:ObjectID!){ restartService(serviceID:$s, environmentID:$e) }`,
  { s: SERVICE_ID, e: UMGEBUNG_ID }
);
console.log("restartService:", JSON.stringify(neustart));

for (let versuch = 1; versuch <= 30; versuch += 1) {
  await new Promise((r) => setTimeout(r, 10_000));
  const antwort = await fetch(GESUNDHEIT, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const daten = antwort?.ok ? await antwort.json().catch(() => null) : null;
  if (daten?.ok) {
    console.log(`WIEDER OBEN nach ${versuch * 10} s — Version: ${daten.version}`);
    process.exit(0);
  }
  console.log(`${versuch * 10} s: noch ${antwort ? `HTTP ${antwort.status}` : "keine Antwort"}`);
}
console.error("Bridge ist nach 5 Minuten nicht wieder oben — Logs pruefen.");
process.exit(1);
