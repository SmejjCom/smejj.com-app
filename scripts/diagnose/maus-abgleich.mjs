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
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { signedS3Request } from "../../workers/glm-salad/s3.js";
import { fingerabdruck, gleicherWert, deuteEimerStatus, handlungsanweisung } from "./maus-befund.mjs";

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

function zeile(name, a, b) {
  const gleich = gleicherWert(a, b);
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

// Der entscheidende Test: nimmt die Engine diesen Token an?
// Ein leerer Plan ist Absicht — die Engine lehnt ihn mit 422 ab, NACHDEM sie
// die Anmeldung geprueft hat. 401 = Token falsch, 422 = Token richtig.
//
// Er wird mit BEIDEN Token gefahren: mit dem lokalen UND mit dem des
// Control-Servers. Nur die zweite Probe beweist unmittelbar, was der
// Control-Server im Ernstfall erlebt — vorher war das ein Rueckschluss aus
// zwei Fingerabdruecken, und ein Rueckschluss ist kein Beweis.
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

// Eimer-Gegenprobe: In WELCHEM Eimer liegen die Lauf-Artefakte wirklich?
// Der Eimername ist kein Geheimnis, deshalb darf er im Klartext erscheinen.
// Gelesen wird mit den LOKALEN Zugangsdaten; ein 403 heisst "anderes Konto",
// ein 404 heisst "dieses Konto, aber dort nicht abgelegt". Beides ist ein
// Befund, keines ist ein Fehler des Skripts.
// Gemessen 2026-07-29: Die Engine schrieb nach smejj-model-files, der
// Control-Server liest smejj-app — der Lauf war fehlerfrei und trotzdem
// unsichtbar ("Artefakt nicht ladbar (404)" in der Wiedergabe).
async function eimerGegenprobe(kandidaten, schluessel) {
  const befunde = [];
  for (const eimer of kandidaten.filter(Boolean)) {
    const config = {
      idrive: {
        endpoint: process.env.IDRIVE_E2_ENDPOINT || "",
        bucket: eimer,
        region: process.env.IDRIVE_E2_REGION || "us-west-2",
        accessKey: process.env.IDRIVE_E2_ACCESS_KEY || "",
        secretKey: process.env.IDRIVE_E2_SECRET_KEY || ""
      }
    };
    try {
      const manifest = JSON.parse(await signedS3Request(config, "GET", schluessel));
      befunde.push({ eimer, gefunden: true, objekte: manifest?.objects?.length ?? 0 });
    } catch (fehler) {
      const text = String(fehler?.message || fehler);
      const status = text.match(/idrive_get_(\d+)/)?.[1] ?? "?";
      befunde.push({ eimer, gefunden: false, status, deutung: deuteEimerStatus(status) });
    }
  }
  return befunde;
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
console.log("\nEngine-Gegenprobe (welchen Token nimmt die Engine an?):");
const lokal = await engineTokenProbe(workerUrl, process.env.SMEJJ_MAUS_ENGINE_TOKEN);
const vomControl = await engineTokenProbe(workerUrl, salad.env.SMEJJ_MAUS_ENGINE_TOKEN);
const zeigeProbe = (name, probe) =>
  console.log(`  ${name} -> ${probe.pruefbar ? `HTTP ${probe.status} (${probe.akzeptiert ? "akzeptiert" : "ABGELEHNT"})` : `nicht pruefbar: ${probe.grund ?? "kein Token/keine URL"}`}`);
zeigeProbe("lokaler Token         ", lokal);
zeigeProbe("Token des Control-Servers", vomControl);
if (vomControl.pruefbar && !vomControl.akzeptiert) {
  console.log("  -> BEWIESEN: die Engine weist genau den Wert ab, den der Control-Server sendet.");
}

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

// Nachweis am echten Objekt statt an der Konfiguration. Referenzlauf ist der
// Selbsttest aus scripts/diagnose/maus-direktlauf.mjs; ein anderer Praefix
// kann als erstes Argument uebergeben werden.
const referenzPraefix = process.argv[2]
  || "capsules/maus-engine/maus-selbsttest-smejj-com-2026-07-26/result/selbsttest-smejj-com-v1";
console.log(`\nNachweis am Objekt (Referenzlauf ${referenzPraefix.split("/")[2]}):`);
const eimerBefunde = await eimerGegenprobe([lokalerEimer, capsulesEimer], `${referenzPraefix}/manifest.json`);
let liegtIn = null;
for (const b of eimerBefunde) {
  console.log(`  ${b.eimer}: ${b.gefunden ? `GEFUNDEN (${b.objekte} Objekte)` : `nicht lesbar (HTTP ${b.status} — ${b.deutung})`}`);
  if (b.gefunden) liegtIn = b.eimer;
}
if (!eimerBefunde.some((b) => b.gefunden)) {
  console.log("  (kein Referenzlauf vorhanden — erst 'node scripts/diagnose/maus-direktlauf.mjs' laufen lassen)");
}

const tokenGleich = gleichheit[0];
const eimerFalsch = Boolean(liegtIn && capsulesEimer && liegtIn !== capsulesEimer);
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
if (eimerFalsch) {
  console.log(`  Die Lauf-Beweise liegen in ${liegtIn}, der Control-Server liest ${capsulesEimer}.`);
  console.log("  -> Ein fehlerfreier Lauf bleibt unsichtbar; die Wiedergabe meldet 'Artefakt nicht ladbar (404)'.");
}

// Handlungsanweisung (Wortlaut und Reihenfolge in maus-befund.mjs, damit sie
// unter Test steht). Aendern von Zugangsdaten ist Sache des Betreibers.
const schritte = handlungsanweisung({
  tokenGleich,
  eimerFalsch,
  zielEimer: capsulesEimer,
  region: salad.env.IDRIVE_E2_REGION ?? "us-west-2",
  endpoint: salad.env.IDRIVE_E2_ENDPOINT ?? "(siehe oben)"
});
if (schritte.length) {
  console.log("\nZu tun (nur der Betreiber — Zugangsdaten), alles beim Zeabur-Dienst 'smejj-maus-engine':");
  schritte.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log("  Danach erneut: node scripts/diagnose/maus-abgleich.mjs");
}
// Fail-closed: Unterschied ist ein Befund, kein Erfolg.
process.exit(gleichheit.every(Boolean) && !eimerFalsch ? 0 : 2);
