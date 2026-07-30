#!/usr/bin/env node
// smejj.com — Maus-Direktlauf: einen fertigen Plan OHNE Control-Server direkt
// an die Maus-Engine schicken.
//
// Warum es das gibt: Wenn ein Maus-Auftrag ueber die App scheitert, gibt es
// zwei voneinander unabhaengige Verdaechtige — den Control-Server (Token,
// Planer, Budget-Gate) und die Engine selbst (Browser, Schritte, e2-Upload).
// Solange beide im selben Aufruf stecken, ist jede Aussage eine Vermutung.
// Dieses Skript nimmt den Control-Server aus der Kette: ein handgeschriebener
// Plan geht direkt an /run. Laeuft er durch, ist die Engine bewiesen gesund
// und der Fehler liegt zwingend davor.
//
// Es braucht KEINEN Planer und KEIN Modell (maxPlannerRoundtrips: 0) und
// erzeugt damit auch keine Modellkosten.
//
// Sicherheitsregeln dieses Skripts:
//   - Es zeigt NIEMALS einen Geheimwert. Der Token wird aus der lokalen
//     Ablage geladen (loadSecureLocalEnv) und nur als Kopfzeile gesendet.
//   - Es schreibt nichts in die Konfiguration und nichts in bestehende
//     Datenbestaende. Die Engine legt lediglich neue Lauf-Artefakte an.
//   - Nur Plaene aus workers/maus-engine/plaene/ werden akzeptiert; kein
//     freier Pfad, damit von aussen kein beliebiger Plan untergeschoben wird.
//
// Aufruf:
//   node scripts/diagnose/maus-direktlauf.mjs
//   node scripts/diagnose/maus-direktlauf.mjs selbsttest-imild-com-v1
//   SMEJJ_MAUS_ENGINE_WORKER_URL=https://... node scripts/diagnose/maus-direktlauf.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { belegeZusammenfassen, laufBefund } from "./maus-befund.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PLAN_ORDNER = path.resolve(HIER, "../../workers/maus-engine/plaene");
// Oeffentliche Adresse des Zeabur-Dienstes — kein Geheimnis. Sie ist nur der
// Rueckfall; SMEJJ_MAUS_ENGINE_WORKER_URL hat immer Vorrang.
const STANDARD_URL = "https://smejj-maus-engine.zeabur.app";
const STANDARD_PLAN = "selbsttest-smejj-com-v1";
// Das Zeitbudget im Plan darf bis 420 s gehen; der Aufruf braucht Luft darueber,
// sonst bricht das Skript einen Lauf ab, der noch sauber zu Ende gegangen waere.
const ANTWORT_ZEITGRENZE_MS = 480_000;

function planLaden(name) {
  const sicher = String(name).replace(/[^a-zA-Z0-9._-]/g, "");
  if (!sicher || sicher !== String(name)) {
    throw new Error(`Planname unzulaessig: ${name}`);
  }
  const datei = path.join(PLAN_ORDNER, sicher.endsWith(".json") ? sicher : `${sicher}.json`);
  if (!fs.existsSync(datei)) {
    const vorhanden = fs.readdirSync(PLAN_ORDNER).filter((d) => d.endsWith(".json")).join(", ");
    throw new Error(`Plan nicht gefunden: ${datei}\nVorhanden: ${vorhanden}`);
  }
  return { datei, plan: JSON.parse(fs.readFileSync(datei, "utf8")) };
}

// Vorab-Anklopfen: die Engine ist bewusst "single-run". Laeuft dort schon eine
// Aufgabe, antwortet /run mit 429 — dann ist ein Fehlschlag kein Befund,
// sondern ein Terminkonflikt. Das vorher zu wissen ist billiger als es
// hinterher zu deuten.
async function gesundheit(url) {
  try {
    const antwort = await fetch(`${url}/health`, { signal: AbortSignal.timeout(20_000) });
    const koerper = await antwort.json().catch(() => null);
    return { erreichbar: antwort.ok, status: antwort.status, aktiv: koerper?.running === true };
  } catch (fehler) {
    return { erreichbar: false, grund: String(fehler?.message || fehler).slice(0, 140) };
  }
}

loadSecureLocalEnv();

const planName = process.argv[2] || STANDARD_PLAN;
const url = String(process.env.SMEJJ_MAUS_ENGINE_WORKER_URL || STANDARD_URL).trim().replace(/\/$/, "");
const token = String(process.env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
if (!token) {
  console.error("SMEJJ_MAUS_ENGINE_TOKEN fehlt in der lokalen Ablage (~/.config/smejj.com/env.local).");
  process.exit(1);
}

const { datei, plan } = planLaden(planName);
console.log(`Maus-Direktlauf — Engine ${url}`);
console.log(`Plan: ${plan.planId} (${plan.steps?.length ?? 0} Schritte) aus ${path.relative(process.cwd(), datei)}`);
console.log(`Capsule: ${plan.capsuleRef}`);

const vorab = await gesundheit(url);
console.log(`\n/health -> ${vorab.erreichbar ? `HTTP ${vorab.status}, laeuft gerade: ${vorab.aktiv}` : `nicht erreichbar (${vorab.grund})`}`);
if (!vorab.erreichbar) process.exit(1);
if (vorab.aktiv) {
  console.error("Die Engine bearbeitet gerade eine andere Aufgabe (single-run). Spaeter erneut messen.");
  process.exit(3);
}

const beginn = Date.now();
let antwort;
let ergebnis;
try {
  antwort = await fetch(`${url}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan }),
    signal: AbortSignal.timeout(ANTWORT_ZEITGRENZE_MS)
  });
  ergebnis = await antwort.json().catch(() => null);
} catch (fehler) {
  console.error(`\nLauf abgebrochen: ${String(fehler?.message || fehler).slice(0, 200)}`);
  process.exit(1);
}
const dauerS = ((Date.now() - beginn) / 1000).toFixed(1);

console.log(`\nHTTP ${antwort.status} nach ${dauerS} s`);
if (antwort.status === 401 || antwort.status === 403) {
  console.log("-> Der LOKALE Token wird von der Engine abgelehnt. Beide Seiten gleichsetzen.");
  process.exit(2);
}
if (!ergebnis || typeof ergebnis !== "object") {
  console.log("-> Antwort war kein JSON. Das ist ein Infrastrukturfehler, kein Lauf-Befund.");
  process.exit(1);
}
if (ergebnis.rejected === true) {
  console.log(`-> Plan abgelehnt: ${(ergebnis.errors || []).slice(0, 5).join(" | ")}`);
  process.exit(2);
}

const protokoll = Array.isArray(ergebnis.actionLog) ? ergebnis.actionLog : [];
const fehlgeschlagen = protokoll.filter((s) => s && s.ok === false);
const belege = belegeZusammenfassen(ergebnis.manifest);

console.log(`\nLauf:`);
console.log(`  ok:                ${ergebnis.ok}`);
console.log(`  Stufe:             ${ergebnis.stage ?? "-"}`);
console.log(`  Schritte gelaufen: ${protokoll.length} von ${plan.steps?.length ?? "?"}`);
console.log(`  davon nicht ok:    ${fehlgeschlagen.length}${fehlgeschlagen.length ? ` (${fehlgeschlagen.map((s) => s.id).slice(0, 8).join(", ")})` : ""}`);
console.log(`  abgebrochen:       ${ergebnis.aborted === true}${ergebnis.abortReason ? ` — ${ergebnis.abortReason}` : ""}`);
console.log(`  Fehlerschritt:     ${ergebnis.failedStep ?? "-"}`);

console.log(`\nBeweise auf IDrive e2 (${ergebnis.uploaded ? "hochgeladen" : "NICHT hochgeladen"}):`);
console.log(`  Objekte:     ${belege.objekte}`);
console.log(`  Screenshots: ${belege.screenshots}`);
console.log(`  Praefix:     ${belege.praefix ?? "-"}`);
if (belege.schluessel.length) console.log(`  Dateien:     ${belege.schluessel.join(", ")}`);

const befund = laufBefund({ ok: ergebnis.ok === true, objekte: belege.objekte });
const TEXT = {
  engine_vollstaendig: [
    "Die Engine arbeitet vollstaendig: Browser, Schritte und e2-Upload sind bewiesen.",
    "Scheitert ein Auftrag ueber die App, liegt die Ursache VOR der Engine."
  ],
  ohne_beweise: ["Schritte liefen, aber es wurden keine Beweise abgelegt — e2-Konfiguration der Engine pruefen."],
  lauf_gescheitert: ["Der Lauf selbst ist gescheitert. Ab hier ist es ein Engine-Befund, nicht der Control-Server."]
};
console.log("\nBefund:");
for (const zeile of TEXT[befund]) console.log(`  ${zeile}`);
// Fail-closed: nur ein vollstaendig gelungener Lauf mit Beweisen ist ein Erfolg.
process.exit(befund === "engine_vollstaendig" ? 0 : 2);
