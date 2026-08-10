#!/usr/bin/env node
// smejj.com — die Speicher-Werte der Fragen-Erfassung setzen (Teil 3, letzter Schritt).
//
// Die Erfassungsroute ist live, kann aber nicht ablegen: auf `smejj-control`
// fehlen alle sechs IDRIVE_E2_TRAINING_*-Werte. Sie antwortet darum ehrlich 503
// statt Erfolg zu melden, den es nicht gibt. Dieses Skript schliesst die Luecke.
//
// WAS ES NICHT TUT:
//   - Es erfindet keine Zugangsdaten. Zugangsschluessel entstehen bei IDrive,
//     nicht hier.
//   - Es zeigt keinen Schluesselwert an — weder im Erfolgs- noch im Fehlerfall.
//   - Es ersetzt nicht die Umgebung. Gelesen, ergaenzt, ganz zurueckgeschrieben.
//   - Es schaltet die Erfassung NICHT von selbst ein. Speicher bereitstellen und
//     anfangen zu erfassen sind zwei Entscheidungen; sie werden hier nicht zu
//     einer. Dafuer gibt es --erfassung-einschalten.
//
// DIE ZUGANGSDATEN-FRAGE, und sie ist der eigentliche Grund fuer die Sorgfalt:
// Auf dem Container liegen bereits allgemeine IDrive-Zugangsdaten
// (IDRIVE_E2_ACCESS_KEY/SECRET_KEY). Man KOENNTE sie in die TRAINING_*-Felder
// kopieren — dann duerfte der Erfassungs-Schreiber alles, was diese Daten
// duerfen, einschliesslich der Eimer mit den Release-Artefakten. Ein eigener,
// auf ein Praefix beschraenkter Schluessel ist die richtige Loesung. Darum ist
// das Wiederverwenden nicht der Standardweg, sondern verlangt --gleiche-zugangsdaten
// und eine ausdrueckliche Bestaetigung.
//
// GEPRUEFT WIRD VOR DEM SCHREIBEN: eine signierte Auflistung gegen Eimer und
// Praefix. Sie schreibt nichts und beweist trotzdem, dass Endpunkt, Region,
// Eimer und Zugangsdaten zusammenpassen. Werte zu setzen, die nicht
// funktionieren, hiesse den 503 nur zu verschieben.
//
// Aufruf:
//   node scripts/deploy/set_training_storage_env.mjs --pruefen
//   node scripts/deploy/set_training_storage_env.mjs --setzen
//   node scripts/deploy/set_training_storage_env.mjs --setzen --erfassung-einschalten
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { signedS3List } from "../../control-server/src/storage/s3Signer.js";

const GRUPPE = "smejj-control";
// ZWEI Praefixe, kommagetrennt — und das ist der Punkt, an dem eine falsche
// Annahme teuer geworden waere:
//
//   training/consents/v1/  gehoert dem EINWILLIGUNGS-Ledger
//   training/fragen/       gehoert der Erfassung
//
// Der Ledger benutzt dieselben IDRIVE_E2_TRAINING_*-Werte wie die Erfassung
// (createIdriveConsentLedger ruft readTrainingIdriveConfig auf) und prueft, ob
// seine eigene Wurzel erlaubt ist. Waere hier nur `training/fragen/` gesetzt,
// haette die Erfassung funktioniert und die EINWILLIGUNG waere mit
// `consent_idrive_prefix_not_allowed` gestorben — also genau die Schutzschicht,
// um derentwillen es die Erfassung ueberhaupt gibt.
//
// Abschliessender Schraegstrich ist Pflicht: ohne ihn lehnt
// readTrainingIdriveConfig mit `training_idrive_prefix_invalid` ab (gemessen).
// Er ist auch inhaltlich richtig — "training/fragen" passte sonst auch auf
// "training/fragenarchiv".
const PREFIX_EINWILLIGUNG = "training/consents/v1/";
const PREFIX_FRAGEN = "training/fragen/";
const PREFIX = `${PREFIX_EINWILLIGUNG},${PREFIX_FRAGEN}`;
const MIN_ENV = 10;

const args = new Set(process.argv.slice(2));
const setzen = args.has("--setzen");
const gleicheZugangsdaten = args.has("--gleiche-zugangsdaten");
const erfassungEinschalten = args.has("--erfassung-einschalten");
if (!setzen && !args.has("--pruefen")) {
  console.error("Aufruf: --pruefen (nur ansehen) oder --setzen (schreiben).");
  process.exit(1);
}

loadSecureLocalEnv();
const ORG = process.env.SALAD_ORGANIZATION_NAME;
const PROJEKT = process.env.SALAD_PROJECT_NAME;
if (!process.env.SALAD_API_KEY || !ORG || !PROJEKT) {
  console.error("SALAD_API_KEY, SALAD_ORGANIZATION_NAME und SALAD_PROJECT_NAME fehlen.");
  process.exit(1);
}
const BASIS = `/organizations/${ORG}/projects/${PROJEKT}/containers/${GRUPPE}`;

async function salad(methode, pfad, koerper) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      ...(koerper ? { "Content-Type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined
  });
  if (!antwort.ok) {
    console.error(`Salad ${methode} -> ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
    process.exit(1);
  }
  return antwort.status === 204 ? {} : antwort.json();
}

function abbruch(zeilen) {
  console.error(["", ...zeilen, ""].join("\n"));
  process.exit(1);
}

const gruppe = await salad("GET", BASIS);
const bestehend = gruppe?.container?.environment_variables || {};
if (Object.keys(bestehend).length < MIN_ENV) {
  abbruch([`Unerwartet kleine Env-Map (${Object.keys(bestehend).length}) — Abbruch, nichts geaendert.`]);
}

// Endpunkt, Region und Eimer folgen dem, was auf dem Container schon steht —
// zwei Quellen fuer dieselbe Tatsache waeren zwei Quellen, die driften koennen.
const endpoint = process.env.IDRIVE_E2_TRAINING_ENDPOINT || bestehend.IDRIVE_E2_ENDPOINT;
const region = process.env.IDRIVE_E2_TRAINING_REGION || bestehend.IDRIVE_E2_REGION;
const bucket = process.env.IDRIVE_E2_TRAINING_BUCKET || bestehend.IDRIVE_E2_BUCKET;

let accessKey = process.env.IDRIVE_E2_TRAINING_ACCESS_KEY || "";
let secretKey = process.env.IDRIVE_E2_TRAINING_SECRET_KEY || "";
let herkunft = "eigener Trainings-Schluessel (aus env.local)";

if (!accessKey || !secretKey) {
  if (!gleicheZugangsdaten) {
    abbruch([
      "Es fehlen eigene Zugangsdaten fuer die Erfassung.",
      "",
      "Der empfohlene Weg — ein Schluessel, der NUR das darf, was die Erfassung",
      "braucht:",
      "  1. Bei IDrive e2 einen neuen Access Key anlegen, beschraenkt auf",
      `     Schreiben unter  ${bucket || "<eimer>"}/training/`,
      "  2. In ~/.config/smejj.com/env.local eintragen:",
      // Platzhalter bewusst als DREI PUNKTE, nicht als typografisches "…":
      // Die Release-Waechter (release:guard UND check:security) erlauben nach
      // ACCESS_KEY=/SECRET_KEY= nur `replace_me`, `<set>` oder Leere — jedes
      // andere Zeichen gilt als echter Schluessel. Das fruehere `...` liess
      // check:security passieren, faerbte aber release:guard rot (zwei Waechter,
      // zwei Erlaubt-Listen; Befund 2026-08-10). `<set>` besteht beide.
      "       IDRIVE_E2_TRAINING_ACCESS_KEY=<set>",
      "       IDRIVE_E2_TRAINING_SECRET_KEY=<set>",
      "  3. Dieses Skript erneut aufrufen.",
      "",
      "Der schnelle Weg: --gleiche-zugangsdaten verwendet die allgemeinen",
      "Zugangsdaten des Containers weiter.",
      "",
      "Ehrlich eingeordnet, weil es nachgemessen ist: der Schreiber selbst weist",
      "jeden Schluessel ausserhalb des Praefix ab (training_idrive_prefix_denied),",
      "noch bevor eine Netzverbindung entsteht. Ein Griff nach den",
      "Release-Artefakten ist damit nicht einfach so moeglich.",
      "",
      "Der Unterschied bleibt trotzdem: bei einem eigenen Schluessel liegt die",
      "Schranke bei IDrive und gilt auch dann, wenn dieser Code sich einmal",
      "aendert. Bei --gleiche-zugangsdaten liegt sie ausschliesslich in unserem",
      "eigenen Code. Zwei Schranken sind besser als eine — und Rechte, die man",
      "einmal vergibt, nimmt spaeter niemand zurueck."
    ]);
  }
  accessKey = bestehend.IDRIVE_E2_ACCESS_KEY || "";
  secretKey = bestehend.IDRIVE_E2_SECRET_KEY || "";
  herkunft = "ALLGEMEINE Container-Zugangsdaten (mehr Recht als noetig)";
}

const fehlend = Object.entries({ endpoint, region, bucket, accessKey, secretKey })
  .filter(([, w]) => !String(w || "").trim()).map(([n]) => n);
if (fehlend.length > 0) abbruch([`Unvollstaendig: ${fehlend.join(", ")}`]);

console.log("Speicher fuer die Fragen-Erfassung");
console.log(`  Endpunkt      ${endpoint}`);
console.log(`  Region        ${region}`);
console.log(`  Eimer         ${bucket}`);
console.log(`  Praefixe      ${PREFIX}`);
console.log(`  Zugangsdaten  ${herkunft}`);

// Erreichbarkeitsprobe: signierte Auflistung, schreibt nichts.
try {
  const liste = await signedS3List({ endpoint, region, accessKey, secretKey, bucket, prefix: PREFIX_FRAGEN, timeoutMs: 15_000 });
  const anzahl = Array.isArray(liste?.keys) ? liste.keys.length : 0;
  console.log(`\nProbe: Auflistung erfolgreich — ${anzahl} Objekt(e) unter ${PREFIX_FRAGEN}`);
} catch (fehler) {
  abbruch([
    "ABBRUCH — die Probe ist fehlgeschlagen, nichts geaendert.",
    `  ${String(fehler?.message || fehler).slice(0, 200)}`,
    "",
    "Endpunkt, Region, Eimer und Zugangsdaten passen nicht zusammen. Diese Werte",
    "jetzt zu setzen, wuerde den 503 nur verschieben statt ihn zu beheben."
  ]);
}

const neu = {
  IDRIVE_E2_TRAINING_ENDPOINT: endpoint,
  IDRIVE_E2_TRAINING_REGION: region,
  IDRIVE_E2_TRAINING_BUCKET: bucket,
  IDRIVE_E2_TRAINING_ACCESS_KEY: accessKey,
  IDRIVE_E2_TRAINING_SECRET_KEY: secretKey,
  IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: PREFIX
};
if (erfassungEinschalten) neu.SMEJJ_TRAINING_CAPTURE_ENABLED = "YES";

console.log("\nWas gesetzt wuerde:");
for (const [name, wert] of Object.entries(neu)) {
  const zeige = name.includes("KEY") && !name.includes("KEY_ID") ? `(gesetzt, ${String(wert).length} Zeichen)` : wert;
  console.log(`  ${name.padEnd(38)} ${bestehend[name] === wert ? "unveraendert" : "NEU"}  ${zeige}`);
}
if (!erfassungEinschalten) {
  console.log("\n  SMEJJ_TRAINING_CAPTURE_ENABLED bleibt AUS.");
  console.log("  Die Route antwortet weiter 503 capture_disabled, bis --erfassung-einschalten");
  console.log("  mitgegeben wird. Speicher bereitstellen und erfassen sind zwei Entscheidungen.");
}

if (!setzen) {
  console.log("\nNur geprueft, nichts geschrieben. Zum Schreiben: --setzen");
  process.exit(0);
}

await salad("PATCH", BASIS, { container: { environment_variables: { ...bestehend, ...neu } } });
const danach = (await salad("GET", BASIS))?.container?.environment_variables || {};
const nichtAngekommen = Object.keys(neu).filter((n) => danach[n] !== neu[n]);
console.log(JSON.stringify({
  ok: nichtAngekommen.length === 0,
  gruppe: GRUPPE,
  variablenVorher: Object.keys(bestehend).length,
  variablenNachher: Object.keys(danach).length,
  nichtAngekommen,
  erfassungEingeschaltet: danach.SMEJJ_TRAINING_CAPTURE_ENABLED === "YES",
  hinweis: erfassungEinschalten
    ? "Salad rollt neu aus. Danach POST /api/training/capture angemeldet pruefen — nicht mehr 503."
    : "Salad rollt neu aus. Die Route bleibt bei 503 capture_disabled, bis die Erfassung eingeschaltet wird."
}, null, 2));
if (nichtAngekommen.length > 0) process.exitCode = 1;
