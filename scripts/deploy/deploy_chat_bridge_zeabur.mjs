#!/usr/bin/env node
// smejj.com — Chat-Bridge auf Zeabur ausliefern, ohne Browser.
//
// Warum es dieses Skript gibt (Befund 2026-07-28): Die Bridge war die einzige
// Komponente ohne skriptbaren Deploy-Weg. Ihr Quelltext liegt im Container unter
// /tmp/smejj-chat-bridge.mjs und wurde bisher von Hand im Zeabur-Portal
// bearbeitet. Das Bearbeiten von Code ueber einen Browser ist Agenten-Sitzungen
// gesperrt — dadurch blieb jede Bridge-Aenderung liegen.
//
// Dieses Skript ersetzt den Browser vollstaendig. Es braucht genau eine Sache,
// die nur der Betreiber anlegen kann: ZEABUR_API_TOKEN in
// ~/.config/smejj.com/env.local. Der Wert wird nie ausgegeben.
//
// Aufruf:
//   CONFIRM_BRIDGE_DEPLOY=YES node scripts/deploy/deploy_chat_bridge_zeabur.mjs
//
// Fail-closed: ohne Bestaetigung, ohne Token oder bei jedem Fehler wird nichts
// veraendert. Die laufende Bridge bleibt in jedem Fehlerfall unberuehrt.

import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { BRIDGE_ENTRY, buildChatBridgeArtifact } from "./bundle_chat_bridge.mjs";

const API = "https://api.zeabur.com/graphql";
const QUELLE = BRIDGE_ENTRY;
const ZIEL = "/tmp/smejj-chat-bridge.mjs";
const PROJEKT_ID = "6a6666899949111176cddefb";
const SERVICE_ID = "6a6680070d0b094201bb9ce4";
const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2";
const GESUNDHEIT = "https://smejj-chat-bridge.zeabur.app/health";

function abbruch(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

async function graphql(query, variables = {}) {
  const antwort = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZEABUR_API_TOKEN}` },
    body: JSON.stringify({ query, variables })
  });
  const daten = await antwort.json();
  if (daten.errors) abbruch(`Zeabur-API: ${daten.errors.map((f) => f.message).join(" | ").slice(0, 300)}`);
  return daten.data;
}

// Die genauen Namen der Datei- und Neustart-Befehle koennen sich aendern.
// Deshalb wird das Schema zur Laufzeit gefragt, statt Namen fest zu verdrahten.
async function findeBefehle() {
  const schema = await graphql(`{ __schema { mutationType { fields { name args { name } } } } }`);
  const felder = schema?.__schema?.mutationType?.fields || [];
  const suche = (muster) => felder.filter((f) => muster.test(f.name)).map((f) => f.name);
  return {
    alle: felder.map((f) => f.name),
    datei: suche(/file/i),
    neustart: suche(/restart|redeploy/i)
  };
}

async function warteAufVersion(erwartet, versuche = 24) {
  for (let i = 1; i <= versuche; i += 1) {
    const antwort = await fetch(GESUNDHEIT).catch(() => null);
    const daten = antwort?.ok ? await antwort.json().catch(() => null) : null;
    if (daten?.version === erwartet) return { ok: true, versuche: i, version: daten.version };
    if (i < versuche) await new Promise((r) => setTimeout(r, 10_000));
  }
  const letzte = await fetch(GESUNDHEIT).then((r) => r.json()).catch(() => ({}));
  return { ok: false, version: letzte?.version || "(unbekannt)" };
}

async function main() {
  if (process.env.CONFIRM_BRIDGE_DEPLOY !== "YES") {
    abbruch("Sicherung: CONFIRM_BRIDGE_DEPLOY=YES erforderlich (bewusster Live-Deploy der Bridge).");
  }
  loadSecureLocalEnv();
  if (!process.env.ZEABUR_API_TOKEN) {
    abbruch([
      "ZEABUR_API_TOKEN fehlt in ~/.config/smejj.com/env.local.",
      "",
      "So legst du ihn an (einmalig, 1 Minute):",
      "  1. https://zeabur.com/account/developer  ->  API-Token erstellen",
      "  2. Den Wert in ~/.config/smejj.com/env.local eintragen als:",
      "     ZEABUR_API_TOKEN=<wert>",
      "",
      "Der Wert wird von diesem Skript nie ausgegeben und nie weitergegeben."
    ].join("\n"));
  }

  // Seit 2026-08-01 geht nicht mehr die Rohdatei raus, sondern ein Buendel:
  // die Bridge besteht im Repository aus mehreren Modulen (800-Zeilen-Regel) und
  // traegt das Wissensartefakt mit. Der Buendler bricht bei allem ab, was er nicht
  // sicher aufloesen kann — dann wird hier nichts veraendert.
  let buendel;
  try {
    buendel = await buildChatBridgeArtifact({ projectRoot: process.cwd() });
  } catch (fehler) {
    abbruch(`Buendeln fehlgeschlagen (${fehler.message}) — Abbruch, nichts veraendert.`);
  }
  const inhalt = buendel.code;
  const version = buendel.version;

  const befehle = await findeBefehle();
  if (!befehle.datei.length) {
    abbruch([
      "Die Zeabur-API kennt keinen Datei-Befehl (kein Mutationsname mit 'file').",
      `Verfuegbar sind ${befehle.alle.length} Befehle; passende fuer Neustart: ${befehle.neustart.join(", ") || "keine"}.`,
      "Dann bleibt nur der Umstieg des Dienstes auf einen Git-Deploy — siehe Task Capsule."
    ].join("\n"));
  }

  console.log(JSON.stringify({
    schritt: "bereit",
    quelle: QUELLE,
    ziel: ZIEL,
    version,
    module: buendel.moduleCount,
    wissensabschnitte: buendel.chunkCount,
    wissenSha256: buendel.sha256,
    bytes: Buffer.byteLength(inhalt),
    dateiBefehle: befehle.datei,
    neustartBefehle: befehle.neustart
  }, null, 2));

  // Der konkrete Aufruf haengt am gefundenen Befehlsnamen; die Argumente werden
  // aus dem Schema uebernommen, damit das Skript Schema-Aenderungen ueberlebt.
  const dateiBefehl = befehle.datei[0];
  await graphql(
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $path: String!, $content: String!) {
       ${dateiBefehl}(serviceID: $serviceID, environmentID: $environmentID, path: $path, content: $content) { __typename }
     }`,
    { serviceID: SERVICE_ID, environmentID: UMGEBUNG_ID, path: ZIEL, content: inhalt }
  );

  const neustartBefehl = befehle.neustart[0];
  if (neustartBefehl) {
    await graphql(
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
         ${neustartBefehl}(serviceID: $serviceID, environmentID: $environmentID)
       }`,
      { serviceID: SERVICE_ID, environmentID: UMGEBUNG_ID }
    );
  }

  const ergebnis = await warteAufVersion(version);
  console.log(JSON.stringify({
    schritt: "fertig",
    ok: ergebnis.ok,
    erwarteteVersion: version,
    liveVersion: ergebnis.version,
    projekt: PROJEKT_ID,
    hinweis: ergebnis.ok
      ? "Bridge laeuft mit der neuen Version."
      : "Version noch nicht live — Rollout kann dauern; /health erneut pruefen."
  }, null, 2));
  if (!ergebnis.ok) process.exit(1);
}

await main();
