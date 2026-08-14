#!/usr/bin/env node
// smejj.com — die AI Evolution Engine scharfschalten: Melde-Schluessel setzen,
// Bruecken-Buendel ausrollen, und am Ende MESSEN, ob es wirklich wirkt.
//
// WARUM DIESES SKRIPT DEN SCHLUESSEL SELBST WUERFELT: Ein Geheimnis, das durch
// eine Assistenten-Sitzung, ein Chatfenster oder eine Zwischenablage reist, ist
// kein Geheimnis mehr. Hier entsteht der Wert im Prozess, geht direkt an Zeabur
// und wird danach vergessen. Ausgegeben werden nur Laenge und SHA-256-Prefix —
// genug, um zwei Dienste zu vergleichen, zu wenig, um damit etwas anzufangen.
//
// WARUM createEnvironmentVariable UND NICHT updateEnvironmentVariable(data: Map):
// die Map-Form ERSETZT die Umgebung des Dienstes. Sie zu benutzen hiesse, alle
// bestehenden Geheimnisse zu lesen, zu mischen und zurueckzuschreiben — und ein
// Fehler dabei nimmt den Dienst mit (die Lehre aus dem Salad-PATCH, der die
// Umgebung ersetzte statt sie zu ergaenzen). Der Einzel-Setzer fasst nichts
// anderes an.
//
// Aufruf:
//   CONFIRM_EVOLUTION_SCHARF=YES node scripts/deploy/evolution_melder_scharfschalten.mjs
//
// Fail-closed: ohne Bestaetigung passiert nichts. Jeder Schritt meldet, ob er
// gelungen ist; am Ende steht eine MESSUNG, keine Behauptung.
import crypto from "node:crypto";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // Projekt "untitled", production
const DIENSTE = [
  { name: "smejj-control", id: "6a697bf60d0b094201bcc1ee" },
  { name: "smejj-chat-bridge", id: "6a6680070d0b094201bb9ce4" }
];
const CONTROL_MELDEWEG = "https://smejj-control.zeabur.app/api/evolution/aktion";
const BRUECKE_GESUNDHEIT = "https://smejj-chat-bridge.zeabur.app/health";

function abdruck(wert) {
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

/** Der Melde-Eingang OHNE Schluessel: 503 = nicht konfiguriert, 401 = scharf. */
async function meldewegStand() {
  try {
    const antwort = await fetch(CONTROL_MELDEWEG, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ art: "text" }),
      signal: AbortSignal.timeout(20_000)
    });
    return antwort.status;
  } catch (fehler) {
    return `nicht erreichbar (${String(fehler?.message || fehler).slice(0, 60)})`;
  }
}

async function setzeSchluessel(wert) {
  const ergebnisse = [];
  for (const dienst of DIENSTE) {
    try {
      // Die Mutation liefert ein OBJEKT zurueck, also braucht sie eine
      // Feldauswahl — ohne sie antwortet Zeabur mit HTTP 422 (gemessen
      // 2026-08-14, erster Versuch). Ausgewaehlt wird NUR `key`: das Feld
      // `value` gaebe den Schluessel im Klartext zurueck.
      await zeaburAbfrage(
        `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
          createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
        }`,
        { s: dienst.id, e: UMGEBUNG_ID, k: "SMEJJ_EVOLUTION_TOKEN", v: wert }
      );
      ergebnisse.push({ dienst: dienst.name, ok: true });
    } catch (fehler) {
      ergebnisse.push({ dienst: dienst.name, ok: false, grund: String(fehler?.message || fehler).slice(0, 120) });
    }
  }
  return ergebnisse;
}

async function main() {
  if (String(process.env.CONFIRM_EVOLUTION_SCHARF || "").toUpperCase() !== "YES") {
    console.error("Ohne CONFIRM_EVOLUTION_SCHARF=YES wird nichts geaendert.");
    process.exit(1);
  }

  console.log(`Vorher — Melde-Eingang antwortet: HTTP ${await meldewegStand()}  (503 = Schluessel fehlt)`);

  const wert = crypto.randomBytes(24).toString("base64url");
  console.log(`Neuer Melde-Schluessel gewuerfelt: ${abdruck(wert)}`);

  for (const e of await setzeSchluessel(wert)) {
    console.log(e.ok ? `  ${e.dienst}: gesetzt` : `  ${e.dienst}: FEHLGESCHLAGEN — ${e.grund}`);
  }

  // Zeabur startet nach einer Variablenaenderung selbst neu. Wir warten und
  // MESSEN statt zu behaupten: der Eingang muss von 503 auf 401 springen.
  console.log("\nWarte auf den Neustart des Control-Servers (bis zu 4 Minuten) …");
  let stand = null;
  for (let versuch = 1; versuch <= 16; versuch += 1) {
    await new Promise((weiter) => { setTimeout(weiter, 15_000); });
    stand = await meldewegStand();
    process.stdout.write(`  Versuch ${versuch}: HTTP ${stand}\n`);
    if (stand === 401) break;
  }

  if (stand === 401) {
    console.log("\nCONTROL IST SCHARF: der Melde-Eingang verlangt jetzt den Schluessel (401 statt 503).");
  } else {
    console.log(`\nNOCH NICHT SCHARF (zuletzt ${stand}). Der Dienst startet vermutlich noch — spaeter erneut pruefen mit:`);
    console.log(`  curl -s -o /dev/null -w "%{http_code}\\n" -X POST ${CONTROL_MELDEWEG} -H "Content-Type: application/json" -d '{"art":"text"}'`);
  }

  console.log("\nBruecke: der Schluessel ist gesetzt, aber sie meldet erst nach dem Ausrollen ihres Buendels.");
  console.log("Stand der Bruecke (Feld evolutionMelder erscheint erst mit dem neuen Buendel):");
  try {
    const antwort = await fetch(BRUECKE_GESUNDHEIT, { signal: AbortSignal.timeout(20_000) });
    const daten = await antwort.json();
    console.log(`  version=${daten.version} evolutionMelder=${JSON.stringify(daten.evolutionMelder || null)}`);
  } catch (fehler) {
    console.log(`  nicht erreichbar (${String(fehler?.message || fehler).slice(0, 60)})`);
  }
}

main().catch((fehler) => {
  console.error(`Abbruch: ${String(fehler?.message || fehler).slice(0, 200)}`);
  process.exit(1);
});
