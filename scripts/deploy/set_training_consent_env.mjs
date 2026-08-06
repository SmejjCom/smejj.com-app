#!/usr/bin/env node
// smejj.com — die sechs Einwilligungs-Werte auf der Salad-Gruppe smejj-control
// setzen. Ein Kommando statt sechs Formularfelder.
//
// WARUM ES DIESES SKRIPT GIBT (gemessen am 2026-08-05):
// Die Werte waren von Hand gesetzt worden und kamen trotzdem nicht auf dem
// Container an — `smejj-control` trug danach unveraendert 85 Variablen, keine
// davon SMEJJ_TRAINING_*. Ein Formular, das man ausfuellt und das nichts
// meldet, ist die schlechteste Art von Fehler. Dieses Skript sagt hinterher,
// was wirklich steht.
//
// WAS ES NICHT TUT:
//   - Es zeigt keine Schluesselwerte an. Weder im Erfolgs- noch im Fehlerfall.
//   - Es ueberschreibt keinen bestehenden Schluessel. Steht ein Wert schon,
//     bleibt er stehen (ausser mit --neue-schluessel ausdruecklich gewollt).
//   - Es ersetzt nicht die Umgebung. Gelesen, ergaenzt, ganz zurueckgeschrieben
//     — ein Teil-PATCH loescht bei Salad ALLE anderen Variablen.
//
// DIE REIHENFOLGE-SICHERUNG, und sie ist der eigentliche Grund fuer die
// Sorgfalt hier: Der Hash beschreibt die Datenschutzerklaerung, gegen die ein
// Nutzer einwilligt. Steht in der Umgebung der Hash einer Fassung, die live
// noch gar nicht abrufbar ist, willigt jemand gegen einen Text ein, den er
// nicht lesen kann. Serverseitig faellt das NIE auf — nichts liest die Seite
// nach. Darum holt dieses Skript die LIVE-Seite und rechnet den Hash selbst
// aus. Passt er nicht, bricht es ab.
//
// Aufruf:
//   node scripts/deploy/set_training_consent_env.mjs --pruefen     (nur ansehen)
//   node scripts/deploy/set_training_consent_env.mjs --setzen
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = "smejj-control";
const NOTICE_URL = "https://smejj.com/datenschutz.html";
const MIN_ENV = 10;

const args = new Set(process.argv.slice(2));
const setzen = args.has("--setzen");
const neueSchluessel = args.has("--neue-schluessel");
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

/** Der Hash der Fassung, die WIRKLICH abrufbar ist. */
async function liveNoticeHash() {
  const antwort = await fetch(NOTICE_URL, { headers: { "cache-control": "no-cache" } });
  if (!antwort.ok) throw new Error(`${NOTICE_URL} -> HTTP ${antwort.status}`);
  return crypto.createHash("sha256").update(Buffer.from(await antwort.arrayBuffer())).digest("hex");
}

const fingerabdruck = (wert) => crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8);
const neuerSchluessel = () => crypto.randomBytes(32).toString("base64");

const gruppe = await salad("GET", BASIS);
const bestehend = gruppe?.container?.environment_variables || {};
if (Object.keys(bestehend).length < MIN_ENV) {
  console.error(`Unerwartet kleine Env-Map (${Object.keys(bestehend).length}) — Abbruch, nichts geaendert.`);
  process.exit(1);
}

const hashLive = await liveNoticeHash();
console.log(`Datenschutzerklaerung live: ${hashLive.slice(0, 16)}…`);

const gesetzt = process.env.SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256_ERWARTET;
if (gesetzt && gesetzt !== hashLive) {
  console.error([
    "",
    "ABBRUCH — Reihenfolge stimmt nicht.",
    `  live abrufbar: ${hashLive}`,
    `  erwartet:      ${gesetzt}`,
    "",
    "Die neue Datenschutzerklaerung ist noch nicht veroeffentlicht. Wuerde der",
    "Hash jetzt gesetzt, willigten Nutzer gegen einen Text ein, den sie nicht",
    "lesen koennen. Erst das Frontend ausrollen, dann dieses Skript."
  ].join("\n"));
  process.exit(1);
}

// Schluessel nur erzeugen, wenn keiner dasteht. Ein Schluesseltausch entwertet
// alle bereits erteilten Einwilligungen — das passiert nie nebenbei.
const sigVorhanden = Boolean(bestehend.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64);
const bindVorhanden = Boolean(bestehend.SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64);
if ((sigVorhanden || bindVorhanden) && !neueSchluessel) {
  console.log("Es stehen bereits Schluessel — sie bleiben unveraendert.");
}

const signatur = sigVorhanden && !neueSchluessel ? bestehend.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64 : neuerSchluessel();
const bindung = bindVorhanden && !neueSchluessel ? bestehend.SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64 : neuerSchluessel();
if (signatur === bindung) {
  console.error("ABBRUCH: Signatur- und Bindungsschluessel waeren identisch.");
  process.exit(1);
}

const neu = {
  SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES",
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: hashLive,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: bestehend.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID || "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: signatur,
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: bestehend.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID || "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: bindung
};

console.log("\nWas gesetzt wuerde:");
for (const [name, wert] of Object.entries(neu)) {
  const zeige = name.endsWith("_B64") ? `(32 Byte, Fingerabdruck ${fingerabdruck(wert)})` : wert;
  console.log(`  ${name.padEnd(42)} ${bestehend[name] === wert ? "unveraendert" : "NEU"}  ${zeige}`);
}

if (!setzen) {
  console.log("\nNur geprueft, nichts geschrieben. Zum Schreiben: --setzen");
  process.exit(0);
}

await salad("PATCH", BASIS, { container: { environment_variables: { ...bestehend, ...neu } } });
const danach = (await salad("GET", BASIS))?.container?.environment_variables || {};
const fehlend = Object.keys(neu).filter((n) => danach[n] !== neu[n]);
console.log(JSON.stringify({
  ok: fehlend.length === 0,
  gruppe: GRUPPE,
  variablenVorher: Object.keys(bestehend).length,
  variablenNachher: Object.keys(danach).length,
  fehlend,
  hinweis: "Salad rollt jetzt neu aus. Danach /api/training/consent/notice pruefen — 200 statt 503."
}, null, 2));
if (fehlend.length > 0) process.exitCode = 1;
