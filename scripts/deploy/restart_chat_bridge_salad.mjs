#!/usr/bin/env node
// smejj.com — Chat-Bridge auf Salad neu starten, damit sie das neue Buendel zieht.
//
// Warum Stop/Start und NIE ein Env-PATCH: ein PATCH auf die Umgebung ERSETZT bei
// Salad die gesamte Umgebung — ein einzelner gesetzter Wert loescht alle anderen
// samt Code-Buendel (teuer gelernt am 2026-08-01, siehe
// docs/memory/Memory_Bank.md). Der Container laedt sein Buendel beim Start von
// https://smejj.com/assets/chat-bridge.js; ein Neustart genuegt also vollstaendig.
//
// Aufruf:
//   CONFIRM_BRIDGE_RESTART=YES node scripts/deploy/restart_chat_bridge_salad.mjs
//
// Fail-closed: ohne Bestaetigung, ohne Zugangsdaten oder bei jedem Fehler wird
// nichts angefasst. Die laufende Bridge bleibt dann unveraendert.
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = process.env.SMEJJ_CHAT_BRIDGE_GROUP || "smejj-chat-bridge-v88b-live";
const GESUNDHEIT = process.env.SMEJJ_CHAT_BRIDGE_HEALTH
  || "https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud/health";

function abbruch(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) abbruch(`${name} fehlt in ~/.config/smejj.com/env.local — nichts geaendert.`);
  return wert;
}

async function saladApi(methode, pfad) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    method: methode,
    headers: { "Salad-Api-Key": process.env.SALAD_API_KEY, Accept: "application/json" }
  });
  const text = await antwort.text();
  if (!antwort.ok) abbruch(`Salad-API ${methode} ${pfad}: HTTP ${antwort.status} ${text.slice(0, 200)}`);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** Wartet, bis /health die erwartete Version meldet. */
async function warteAufVersion(erwartet, versuche = 30) {
  for (let i = 1; i <= versuche; i += 1) {
    await new Promise((r) => setTimeout(r, 10_000));
    const daten = await fetch(GESUNDHEIT, { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (daten?.version === erwartet) return { ok: true, versuche: i, daten };
    console.log(`  ${i}/${versuche} — noch ${daten?.version || "(keine Antwort)"}`);
  }
  return { ok: false };
}

async function main() {
  if (process.env.CONFIRM_BRIDGE_RESTART !== "YES") {
    abbruch("Sicherung: CONFIRM_BRIDGE_RESTART=YES erforderlich (bewusster Live-Neustart).");
  }
  const erwartet = process.argv[2];
  if (!erwartet) abbruch("Aufruf: ... restart_chat_bridge_salad.mjs <erwartete-version>");
  loadSecureLocalEnv();
  pflicht("SALAD_API_KEY");
  const org = pflicht("SALAD_ORGANIZATION_NAME");
  const projekt = pflicht("SALAD_PROJECT_NAME");
  const basis = `/organizations/${org}/projects/${projekt}/containers/${GRUPPE}`;

  const vorher = await fetch(GESUNDHEIT).then((r) => r.json()).catch(() => ({}));
  console.log(`Vorher live: ${vorher.version || "(keine Antwort)"}`);
  if (vorher.version === erwartet) {
    console.log("Bereits auf dem Zielstand — kein Neustart noetig.");
    return;
  }

  console.log(`Stoppe ${GRUPPE} ...`);
  await saladApi("POST", `${basis}/stop`);
  await new Promise((r) => setTimeout(r, 8_000));
  console.log("Starte ...");
  await saladApi("POST", `${basis}/start`);

  console.log(`Warte auf ${erwartet} (Gateway-503-Flattern in den ersten Minuten ist normal) ...`);
  const ergebnis = await warteAufVersion(erwartet);
  if (!ergebnis.ok) abbruch(`Neustart ausgeloest, aber ${erwartet} kam nicht im Zeitfenster hoch.`);
  console.log(`LIVE: ${erwartet} nach ${ergebnis.versuche * 10} s.`);
  console.log(`  Schnellspur: ${ergebnis.daten.fastLaneModel}`);
  console.log(`  Projektwissen: ${JSON.stringify(ergebnis.daten.projektwissen)}`);
}

main().catch((fehler) => abbruch(`Unerwarteter Fehler: ${fehler?.message || fehler}`));
