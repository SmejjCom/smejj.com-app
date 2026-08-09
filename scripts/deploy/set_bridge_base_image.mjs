#!/usr/bin/env node
// smejj.com — Basis-Abbild der Chat-Bruecke schlanker machen (Startzeit senken).
//
// WARUM (gemessen am 2026-08-09, nicht vermutet): Der Bruecken-Waechter hat
// einen Ausfall von 23:16:44 bis 23:20:44 aufgezeichnet — vier Minuten HTTP 503.
// Die Salad-Instanz war 42 Sekunden vorher neu gestartet worden. Der Ausfall
// war also kein Absturz, sondern die HOCHFAHRZEIT nach einer Neuzuteilung.
//
// Wo die Zeit hingeht: NICHT ins Code-Buendel (551 KB, laedt in 0,18 s),
// sondern ins Basis-Abbild. `node:22-bookworm` sind 389 MB komprimiert und
// muessen bei jeder Neuzuteilung auf einen frischen Knoten geladen werden.
// `node:22-alpine` sind 55 MB — 86 % weniger.
//
// Warum wget statt curl: Alpine bringt kein curl mit, aber busybox-wget. Die
// Bruecke selbst laeuft unveraendert — sie benutzt ausschliesslich
// Node-Bordmittel (node:crypto, node:http, node:zlib), keine nativen Module.
// Am 2026-08-09 lokal bewiesen: `docker run node:22-alpine` mit genau diesem
// Befehl antwortete nach 2 Sekunden mit v125 und 758 geladenen Wissensabschnitten.
//
// GEFAHR, die dieses Skript entschaerft (Memory: Salad-PATCH ersetzt die
// Umgebung): Ein PATCH auf `container` ersetzt die environment_variables
// KOMPLETT statt sie zu mergen. Ein Aufruf mit nur `image` wuerde alle
// Modell-Zugaenge der Bruecke loeschen. Deshalb: lesen, ergaenzen, GANZ
// zurueckschreiben — und vorher zaehlen.
//
// Aufruf:
//   CONFIRM_BRIDGE_IMAGE_SWITCH=YES node scripts/deploy/set_bridge_base_image.mjs
//   (optional SMEJJ_BRIDGE_IMAGE=node:22-bookworm-slim fuer den Rueckweg)
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = process.env.SMEJJ_BRIDGE_GROUP || "smejj-chat-bridge-v88b-live";
const ZIEL_ABBILD = process.env.SMEJJ_BRIDGE_IMAGE || "node:22-alpine";
const BUENDEL = "https://raw.githubusercontent.com/SmejjCom/smejj-app-frontend/main/assets/chat-bridge.js";

function fail(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

async function saladApi(methode, pfad, koerper) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      ...(koerper ? { "Content-Type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined
  });
  if (!antwort.ok) fail(`Salad ${methode} ${pfad} -> ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`);
  return antwort.status === 204 ? {} : antwort.json();
}

/** Alpine hat kein curl; busybox-wget kann dasselbe. */
function startbefehl(abbild) {
  const holen = abbild.includes("alpine")
    ? `wget -qO /tmp/smejj-chat-bridge.mjs ${BUENDEL}`
    : `curl -fsSL ${BUENDEL} -o /tmp/smejj-chat-bridge.mjs`;
  return ["sh", "-lc", `${holen} && node /tmp/smejj-chat-bridge.mjs`];
}

async function main() {
  if (process.env.CONFIRM_BRIDGE_IMAGE_SWITCH !== "YES") {
    fail("Sicherung: CONFIRM_BRIDGE_IMAGE_SWITCH=YES erforderlich — das Umstellen startet die Bruecke neu.");
  }
  loadSecureLocalEnv();
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const projekt = process.env.SALAD_PROJECT_NAME;
  if (!process.env.SALAD_API_KEY || !org || !projekt) fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");

  const pfad = `/organizations/${org}/projects/${projekt}/containers/${GRUPPE}`;
  const vorher = await saladApi("GET", pfad);
  const behaelter = vorher?.container || {};
  const umgebung = behaelter.environment_variables || {};
  const anzahlVorher = Object.keys(umgebung).length;

  // Schutz gegen das versehentliche Wegpatchen: eine gesunde Bruecke traegt
  // ein Dutzend Werte (2026-08-09: 14, darunter alle Modell-Zugaenge).
  if (anzahlVorher < 5) fail(`Unerwartet kleine Umgebung (${anzahlVorher} Werte) — Abbruch, nichts geaendert.`);
  if (behaelter.image === ZIEL_ABBILD) {
    console.log(JSON.stringify({ ok: true, unveraendert: true, image: behaelter.image }, null, 2));
    return;
  }

  await saladApi("PATCH", pfad, {
    container: {
      image: ZIEL_ABBILD,
      command: startbefehl(ZIEL_ABBILD),
      // Die volle Abbildung zurueckschreiben — sonst loescht Salad sie.
      environment_variables: { ...umgebung }
    }
  });

  // Salads Rueckgabe ist VERZOEGERT KONSISTENT: unmittelbar nach dem Schreiben
  // meldet die Gruppe noch den alten Stand. Am 2026-08-09 selbst hineingelaufen
  // — das Skript meldete `ok:false` und "abbildNachher: node:22-bookworm",
  // obwohl die Umstellung angekommen war (20 s spaeter stand Version 16 mit
  // alpine da). Wer hier ohne Pause gegenliest, diagnostiziert ein Phantom und
  // patcht womoeglich ein zweites Mal.
  await new Promise((fertig) => setTimeout(fertig, 15_000));
  const nachher = await saladApi("GET", pfad);
  const jetzt = nachher?.container || {};
  const anzahlNachher = Object.keys(jetzt.environment_variables || {}).length;
  console.log(JSON.stringify({
    ok: jetzt.image === ZIEL_ABBILD && anzahlNachher === anzahlVorher,
    gruppe: GRUPPE,
    version: nachher?.version ?? null,
    abbildVorher: behaelter.image,
    abbildNachher: jetzt.image,
    umgebungswerte: `${anzahlVorher} -> ${anzahlNachher} (muessen gleich sein)`,
    startbefehl: (jetzt.command || []).slice(-1)[0],
    hinweis: "Salad rollt jetzt neu aus. Danach /health der Bruecke pruefen und die Startzeit messen."
  }, null, 2));
}

await main();
