#!/usr/bin/env node
// smejj.com — die Umgebung von smejj-control aus der lokalen Ablage zurueckholen.
//
// WARUM ES DIESES SKRIPT GIBT (Vorfall 2026-08-14, 18:38 Uhr):
// Ein Aufruf, der EINEN Wert setzen wollte (den Maus-Token), benutzte Zeaburs
// updateEnvironmentVariable(data: Map). Diese Form ERSETZT die Umgebung. Damit
// verschwanden am Dienst smejj-control alle uebrigen Werte auf einen Schlag:
// Sitzungsgeheimnis, Modellschluessel, Speicherzugang. Folge: jeder Nutzer
// abgemeldet (die Sitzungen sind mit dem Geheimnis unterschrieben) und die KI
// aus (kein Modellschluessel). Der ausloesende Aufruf sah voellig harmlos aus.
//
// Die Ursache ist seit demselben Tag gesperrt (zeabur-umgebung-setzen.mjs
// verweigert die Sammel-Form). Dieses Skript raeumt die Folgen auf.
//
// ES SETZT NUR, WAS ES LOKAL BELEGEN KANN. Werte, die in
// ~/.config/smejj.com/env.local fehlen, werden NICHT geraten und NICHT
// angefasst — sie werden am Ende namentlich aufgezaehlt, damit klar ist, was
// noch von Hand gehoert. Ein halb geratener Schluessel ist schlimmer als ein
// fehlender: er scheitert spaeter und woanders.
//
// Aufruf:
//   CONFIRM_CONTROL_RESTORE=YES node scripts/deploy/control_umgebung_wiederherstellen.mjs
//
// Werte werden NIE ausgegeben — nur Name, Laenge und SHA-256-Prefix.
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const SERVICE_ID = "6a697bf60d0b094201bcc1ee"; // smejj-control
const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2"; // production

/**
 * Was der Control-Server braucht, um seine Kernaufgaben zu tun. Bewusst NICHT
 * "alles, was env.local kennt": lokale Entwicklerwerte (CONFIRM_*, Salad-Reste)
 * gehoeren nicht in einen Produktionsdienst.
 */
const GEBRAUCHT = Object.freeze([
  // Ohne das hier ist JEDE Sitzung ungueltig — das ist der Abmelde-Effekt.
  { name: "SMEJJ_SESSION_SECRET", wofuer: "Anmeldung: alle Sitzungen sind damit unterschrieben" },
  // Ohne das hier antwortet die KI nicht.
  { name: "SMEJJ_LLM_ZHIPU_API_KEY", wofuer: "Modellzugang GLM (Standardmodell)" },
  { name: "SMEJJ_LLM_GROQ_API_KEY", wofuer: "Modellzugang Groq (Schnellspur, Ohr)" },
  // Ohne das hier ist jede Ablage stumm: Verlauf, Aufgaben, Kennzahlen.
  { name: "IDRIVE_E2_ACCESS_KEY", wofuer: "Speicher (Verlauf, Aufgaben, Kennzahlen)" },
  { name: "IDRIVE_E2_SECRET_KEY", wofuer: "Speicher" },
  { name: "IDRIVE_E2_BUCKET", wofuer: "Speicher" },
  { name: "IDRIVE_E2_ENDPOINT", wofuer: "Speicher" },
  { name: "IDRIVE_E2_REGION", wofuer: "Speicher" },
  { name: "SMEJJ_SEARCH_TAVILY_API_KEY", wofuer: "Websuche (Recherche, Konkurrenz-Radar)" },
  { name: "SMEJJ_ADMIN_OWNER_EMAILS", wofuer: "Betreiber-Zugang zur Konsole" },
  { name: "GOOGLE_ALLOWED_EMAIL", wofuer: "Anmeldung ueber Google" }
]);

function abdruck(wert) {
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

async function vorhandeneSchluessel() {
  const d = await zeaburAbfrage(
    "query($s: ObjectID!, $e: ObjectID!){ service(_id: $s) { variables(environmentID: $e) { key } } }",
    { s: SERVICE_ID, e: UMGEBUNG_ID }
  );
  return new Set((d?.service?.variables || []).map((v) => v.key));
}

async function setzeEinzeln(schluessel, wert) {
  // EINZELN, niemals als Map — genau die Form, die den Vorfall ausgeloest hat.
  // Die Mutation liefert ein Objekt zurueck und braucht eine Feldauswahl;
  // ausgewaehlt wird nur `key`, nie `value`.
  await zeaburAbfrage(
    `mutation Setze($s: ObjectID!, $e: ObjectID!, $k: String!, $v: String!) {
      createEnvironmentVariable(serviceID: $s, environmentID: $e, key: $k, value: $v) { key }
    }`,
    { s: SERVICE_ID, e: UMGEBUNG_ID, k: schluessel, v: wert }
  );
}

async function main() {
  if (String(process.env.CONFIRM_CONTROL_RESTORE || "").toUpperCase() !== "YES") {
    console.error("Ohne CONFIRM_CONTROL_RESTORE=YES wird nichts geaendert.");
    process.exit(1);
  }
  loadSecureLocalEnv();

  const schonDa = await vorhandeneSchluessel();
  console.log(`smejj-control hat aktuell ${schonDa.size} Variablen.`);

  const gesetzt = [];
  const uebersprungen = [];
  const fehlend = [];

  for (const eintrag of GEBRAUCHT) {
    if (schonDa.has(eintrag.name)) { uebersprungen.push(eintrag.name); continue; }
    const wert = String(process.env[eintrag.name] || "").trim();
    if (!wert) { fehlend.push(eintrag); continue; }
    try {
      await setzeEinzeln(eintrag.name, wert);
      gesetzt.push(`${eintrag.name} (${abdruck(wert)})`);
    } catch (fehler) {
      fehlend.push({ ...eintrag, grund: String(fehler?.message || fehler).slice(0, 100) });
    }
  }

  console.log(`\nGESETZT (${gesetzt.length}):`);
  for (const z of gesetzt) console.log(`  ${z}`);
  if (uebersprungen.length) console.log(`\nSCHON VORHANDEN, nicht angefasst: ${uebersprungen.join(", ")}`);

  if (fehlend.length) {
    console.log(`\nNICHT WIEDERHERSTELLBAR (${fehlend.length}) — diese Werte liegen nicht lokal vor:`);
    for (const f of fehlend) console.log(`  ${f.name} — ${f.wofuer}${f.grund ? ` (Fehler: ${f.grund})` : ""}`);
    console.log("\nDiese gehoeren von Hand ins Zeabur-Portal. Geraten wird hier nichts.");
  }

  console.log("\nZeabur startet nach einer Variablenaenderung NICHT von selbst neu.");
  console.log("Neustart anstossen:");
  console.log("  node -e \"import('./scripts/diagnose/zeabur-api.mjs').then(async({zeaburAbfrage})=>{"
    + "await zeaburAbfrage('mutation($s:ObjectID!,$e:ObjectID!){restartService(serviceID:$s,environmentID:$e)}',"
    + `{s:'${SERVICE_ID}',e:'${UMGEBUNG_ID}'});console.log('neu gestartet')})"`);
  console.log("\nDanach pruefen: curl -s https://smejj-control.zeabur.app/api/health  (ai muss true sein)");
}

main().catch((fehler) => {
  console.error(`Abbruch: ${String(fehler?.message || fehler).slice(0, 200)}`);
  process.exit(1);
});
