#!/usr/bin/env node
// smejj.com — Maus-Abgleich: stimmen Control-Server (Salad) und Maus-Engine
// (Zeabur) ueberein? NUR LESEND.
//
// Warum es das gibt: Ein Token-Unterschied zwischen beiden Seiten sah in der
// App wie "planner_budget_erschoepft" aus und hat mehrere Runden gekostet
// (job_maus_sichtbarkeit_20260728). Raten ist teuer, Messen ist billig.
//
// Sicherheitsregel dieses Skripts: Es zeigt NIEMALS einen Geheimwert. Von
// Secrets werden ausschliesslich Laenge und die ersten 8 Hex-Zeichen des
// SHA-256 ausgegeben. Das reicht fuer "gleich oder ungleich" und verraet den
// Wert nicht. Geschrieben wird nichts — kein PATCH, kein Formular.
//
// Aufruf:  node scripts/diagnose/maus-abgleich.mjs
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const SALAD_GRUPPE = "smejj-control";
// Diese Werte sind keine Geheimnisse und duerfen im Klartext erscheinen.
const OFFEN = [
  "SMEJJ_MAUS_ENGINE_WORKER_URL",
  "SMEJJ_MAUS_ENGINE_ENABLED",
  "IDRIVE_E2_BUCKET",
  "IDRIVE_E2_CAPSULES_BUCKET",
  "IDRIVE_E2_REGION",
  "IDRIVE_E2_ENDPOINT"
];
// Diese nie im Klartext — nur Fingerabdruck.
const GEHEIM = ["SMEJJ_MAUS_ENGINE_TOKEN", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY"];

function fingerabdruck(wert) {
  const s = String(wert ?? "");
  return {
    vorhanden: s.length > 0,
    laenge: s.length,
    sha8: s ? crypto.createHash("sha256").update(s).digest("hex").slice(0, 8) : "-",
    sauber: s === s.trim()
  };
}

function zeile(name, a, b) {
  const gleich = a.vorhanden && b.vorhanden && a.laenge === b.laenge && a.sha8 === b.sha8;
  console.log(`  ${name}`);
  console.log(`    salad: laenge=${a.laenge} sha=${a.sha8} ohne_leerzeichen=${a.sauber}`);
  console.log(`    lokal: laenge=${b.laenge} sha=${b.sha8} ohne_leerzeichen=${b.sauber}`);
  console.log(`    -> ${gleich ? "IDENTISCH" : "UNTERSCHIEDLICH"}`);
  return gleich;
}

async function saladEnv() {
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const projekt = process.env.SALAD_PROJECT_NAME;
  if (!org || !projekt || !process.env.SALAD_API_KEY) {
    throw new Error("SALAD_API_KEY / SALAD_ORGANIZATION_NAME / SALAD_PROJECT_NAME fehlen");
  }
  const antwort = await fetch(
    `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers/${SALAD_GRUPPE}`,
    { headers: { "Salad-Api-Key": process.env.SALAD_API_KEY } }
  );
  if (!antwort.ok) throw new Error(`Salad API -> HTTP ${antwort.status}`);
  const gruppe = await antwort.json();
  return {
    env: gruppe?.container?.environment_variables || {},
    version: gruppe?.version ?? null,
    zustand: gruppe?.current_state?.status ?? null
  };
}

// Der entscheidende Test: nimmt die Engine den lokal hinterlegten Token an?
// Ein leerer Plan ist Absicht — die Engine lehnt ihn mit 422 ab, NACHDEM sie
// die Anmeldung geprueft hat. 401 = Token falsch, 422 = Token richtig.
async function engineTokenProbe(workerUrl, token) {
  if (!workerUrl || !token) return { pruefbar: false };
  try {
    const antwort = await fetch(`${workerUrl.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
      signal: AbortSignal.timeout(25_000)
    });
    return { pruefbar: true, status: antwort.status, akzeptiert: antwort.status !== 401 && antwort.status !== 403 };
  } catch (fehler) {
    return { pruefbar: false, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

loadSecureLocalEnv();

let salad;
try {
  salad = await saladEnv();
} catch (fehler) {
  console.error(`Control-Server nicht lesbar: ${fehler.message}`);
  process.exit(1);
}

console.log(`Control-Server (Salad, ${SALAD_GRUPPE}) — Version ${salad.version}, Zustand ${salad.zustand}\n`);
console.log("Offene Werte (keine Geheimnisse):");
for (const name of OFFEN) console.log(`  ${name} = ${salad.env[name] ?? "(nicht gesetzt)"}`);

console.log("\nGeheimnisse — nur Fingerabdruck, Salad gegen lokale Ablage:");
const gleichheit = GEHEIM.map((name) =>
  zeile(name, fingerabdruck(salad.env[name]), fingerabdruck(process.env[name]))
);

const workerUrl = salad.env.SMEJJ_MAUS_ENGINE_WORKER_URL;
console.log("\nEngine-Gegenprobe (nimmt die Engine den lokalen Token an?):");
const lokal = await engineTokenProbe(workerUrl, process.env.SMEJJ_MAUS_ENGINE_TOKEN);
console.log(`  lokaler Token -> ${lokal.pruefbar ? `HTTP ${lokal.status} (${lokal.akzeptiert ? "akzeptiert" : "ABGELEHNT"})` : `nicht pruefbar: ${lokal.grund ?? "kein Token/keine URL"}`}`);

// Zweiter, unabhaengiger Fehler: die Engine kann laufen und trotzdem in einen
// ANDEREN Eimer schreiben als der Control-Server liest. Dann erscheint nie ein
// neuer Ordner, und die Wiedergabe meldet "Artefakt nicht ladbar". Das sah
// lange wie ein Konto-Problem aus, ist aber ein Eimer-Name.
const capsulesEimer = salad.env.IDRIVE_E2_CAPSULES_BUCKET || salad.env.IDRIVE_E2_BUCKET || null;
const lokalerEimer = process.env.IDRIVE_E2_BUCKET || null;
console.log("\nEimer fuer Maus-Artefakte:");
console.log(`  Control-Server liest aus: ${capsulesEimer ?? "(nicht gesetzt)"}`);
console.log(`  lokale Ablage zeigt auf:  ${lokalerEimer ?? "(nicht gesetzt)"}`);
if (capsulesEimer && lokalerEimer && capsulesEimer !== lokalerEimer) {
  console.log(`  -> ACHTUNG: verschiedene Eimer. Traegt der Zeabur-Dienst denselben`);
  console.log(`     IDRIVE_E2_BUCKET wie hier (${lokalerEimer}), landen die Artefakte`);
  console.log(`     dort, wo der Control-Server (${capsulesEimer}) NICHT nachsieht.`);
}

const tokenGleich = gleichheit[0];
console.log("\nBefund:");
if (tokenGleich) {
  console.log("  SMEJJ_MAUS_ENGINE_TOKEN ist auf beiden Seiten gleich.");
} else {
  console.log("  SMEJJ_MAUS_ENGINE_TOKEN unterscheidet sich zwischen Control-Server und lokaler Ablage.");
  if (lokal.pruefbar && lokal.akzeptiert) {
    console.log("  Die Engine akzeptiert den LOKALEN Wert. Der Control-Server sendet also einen anderen");
    console.log("  -> jeder Maus-Auftrag ueber die App endet an der Engine mit HTTP 401 nicht_autorisiert.");
  }
}
// Fail-closed: Unterschied ist ein Befund, kein Erfolg.
process.exit(gleichheit.every(Boolean) ? 0 : 2);
