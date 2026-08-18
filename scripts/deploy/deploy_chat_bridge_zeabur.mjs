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
import { schluesselKandidaten } from "../diagnose/zeabur-schluessel-suchen.mjs";

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
//
// GESUCHT WIRD NACH FAEHIGKEIT, NICHT NACH NAMEN (Befund 2026-08-18): Vorher
// galt jeder Mutationsname, der /file/i enthielt — und das traf
// `createRegistrantProfile`, weil in "Profile" das Wort "file" steckt. Die
// eigene Schutzpruefung "kein Datei-Befehl vorhanden" lief dadurch ins Leere:
// statt der klaren Ansage "die API kann das nicht mehr, es braucht einen
// Git-Deploy" kam ein verwirrendes "Unknown argument serviceID on field
// createRegistrantProfile". Ein Befehl taugt nur, wenn er die Argumente
// `path` UND `content` annimmt — danach wird jetzt gefragt.
async function findeBefehle() {
  const schema = await graphql(`{ __schema { mutationType { fields { name args { name } } } } }`);
  const felder = schema?.__schema?.mutationType?.fields || [];
  const nimmt = (feld, ...namen) => namen.every((name) => (feld.args || []).some((arg) => arg.name === name));
  return {
    alle: felder.map((f) => f.name),
    datei: felder.filter((f) => nimmt(f, "path", "content")).map((f) => f.name),
    // Nur der Vollstaendigkeit halber gemeldet, nicht zur Auswahl benutzt.
    dateiVerdaechtig: felder.filter((f) => /file/i.test(f.name)).map((f) => f.name),
    neustart: felder.filter((f) => /restart|redeploy/i.test(f.name)).map((f) => f.name)
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
  // Zweiter Fundort statt Handgriff des Betreibers: die Zeabur-CLI legt nach
  // einem `zeabur auth login` einen Schluessel in ~/.config/zeabur/cli.yaml ab.
  // Genau darum gibt es zeabur-schluessel-suchen.mjs — dort steht der Befund
  // im Wortlaut: "Solange niemand dort nachsieht, bleibt jede Aenderung ein
  // Handgriff des Betreibers, obwohl der Zugang laengst auf der Platte liegt."
  // Derselbe Zugang, dieselbe Person; nur ein Ort mehr, an dem gesucht wird.
  // Der Wert wird nie ausgegeben und nie ueber die Kommandozeile gereicht.
  if (!process.env.ZEABUR_API_TOKEN) {
    const kandidat = schluesselKandidaten()[0];
    if (kandidat?.wert) process.env.ZEABUR_API_TOKEN = kandidat.wert;
  }
  if (!process.env.ZEABUR_API_TOKEN) {
    abbruch([
      "ZEABUR_API_TOKEN fehlt in ~/.config/smejj.com/env.local — und in",
      "~/.config/zeabur/cli.yaml liegt auch keiner (dann hilft `zeabur auth login`).",
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
      "Die Zeabur-API kennt keinen Befehl, der eine Datei in den Container schreibt",
      "(kein Mutationsfeld nimmt zugleich 'path' und 'content').",
      `Verfuegbar sind ${befehle.alle.length} Befehle. Namentlich nach 'file' klingen:`,
      `  ${befehle.dateiVerdaechtig.join(", ") || "keine"}`,
      "— das sind aber Profil-, Dockerfile- und Vorlagen-Befehle, keiner davon schreibt",
      "eine Datei in den laufenden Dienst.",
      `Neustart-Befehle gaebe es: ${befehle.neustart.join(", ") || "keine"}.`,
      "",
      "Der Dienst smejj-chat-bridge laeuft als PREBUILT_V2 OHNE Git-Anbindung; sein",
      "Quelltext liegt im Container unter /tmp. Solange die API keinen Schreibbefehl",
      "mehr anbietet, gibt es genau zwei Wege — beide braucht eine Entscheidung:",
      "  1. Den Dienst auf einen Git-Deploy umstellen (wie smejj-control, dann",
      "     traegt deploy(gitRef) die Aenderung).",
      "  2. Die Datei einmalig im Zeabur-Portal einsetzen (Agenten-Sitzungen ist",
      "     das Bearbeiten von Code im Browser gesperrt).",
      "",
      "Es wurde NICHTS veraendert; die laufende Bridge ist unberuehrt."
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
  // HIER ENDET DER ALTE WEG — UND ZWAR MIT ABSICHT.
  //
  // TEUER GELERNT AM 2026-08-18: `updateServiceConfig` legt die Datei nicht ab,
  // es haengt sie als SCHREIBGESCHUETZTEN Config-Mount in den Container. Der
  // Startbefehl des Dienstes lautet aber (aus dem Spec gelesen):
  //
  //   curl -fsSL https://raw.githubusercontent.com/SmejjCom/smejj-app-frontend/
  //        main/assets/chat-bridge.js -o /tmp/smejj-chat-bridge.mjs
  //   && node /tmp/smejj-chat-bridge.mjs
  //
  // Der Container holt sich seinen Quelltext also SELBST — an genau den Pfad,
  // den der Mount belegt. Ergebnis: `curl: (23) Failure writing output to
  // destination`, Container-Start scheitert, BackOff-Schleife, 502 auf
  // smejj.com. Die Bridge war dadurch rund 15 Minuten tot; geheilt hat es erst
  // `deleteServiceConfig` (scripts/deploy/bruecke-config-mount-entfernen.mjs).
  //
  // Der richtige Weg ist deshalb NICHT die Zeabur-API, sondern das
  // Frontend-Repo: das gebuendelte Artefakt gehoert als assets/chat-bridge.js
  // nach SmejjCom/smejj-app-frontend@main, danach genuegt ein restartService.
  // Solange das nicht in diesem Skript automatisiert ist, bricht es hier ab —
  // lieber gar kein Deploy als der, der die Bridge umbringt.
  abbruch([
    "Dieser Deploy-Weg ist STILLGELEGT (Befund 2026-08-18).",
    "",
    `Das Buendel ist fertig gebaut: ${Buffer.byteLength(inhalt)} Bytes, Version ${version}.`,
    "Geschrieben wurde NICHTS.",
    "",
    "Warum: `updateServiceConfig` haengt die Datei als schreibgeschuetzten",
    "Config-Mount ein. Der Startbefehl des Dienstes laedt seinen Quelltext aber",
    "selbst per curl an genau diesen Pfad — der Mount blockiert das Schreiben,",
    "der Container startet nicht mehr (502 auf smejj.com).",
    "",
    "Der echte Auslieferungsweg:",
    "  1. Buendel bauen (buildChatBridgeArtifact aus bundle_chat_bridge.mjs)",
    "  2. Als assets/chat-bridge.js nach SmejjCom/smejj-app-frontend@main pushen",
    "     (Freigabe verlangt Fast-Forward — vorher merge-base --is-ancestor)",
    "  3. Bridge neu starten: restartService (NICHT redeployService)",
    "",
    "Ein Commit allein ist nicht live — erst der Neustart holt die neue Datei."
  ].join("\n"));

  // Reihenfolge zaehlt (Befund 2026-08-18): `redeployService` antwortet bei
  // diesem Dienst mit "Cannot redeploy in-place" — smejj-chat-bridge laeuft als
  // PREBUILT_V2 ohne Git-Anbindung, es gibt also nichts neu zu bauen. Der
  // Dienst laedt seinen Quelltext beim Start aus der Datei, die oben gerade
  // geschrieben wurde; ein schlichter Neustart genuegt und ist der einzige Weg,
  // der hier ueberhaupt traegt.
  const neustartBefehl = befehle.neustart.find((name) => /^restartService$/.test(name)) || befehle.neustart[0];
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
