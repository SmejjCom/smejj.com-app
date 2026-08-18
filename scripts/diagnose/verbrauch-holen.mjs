#!/usr/bin/env node
// smejj.com — den Messschrieb aus dem laufenden Control-Dienst holen.
//
// Der Server schreibt je Anfrage eine Zeile "[verbrauch] {...}" nach stdout.
// Zeabur bewahrt sie als Laufzeit-Log. Dieses Werkzeug holt sie heraus, ohne
// dass sich jemand am Adminbereich anmelden muss.
//
// Aufruf:
//   node scripts/diagnose/verbrauch-holen.mjs             -> Rohzeilen nach stdout
//   node scripts/diagnose/verbrauch-holen.mjs 40 | npm run verbrauch:bericht
// Die Zahl sind SEITEN a 100 Logzeilen, nicht Stunden: Zeabur gibt je Abfrage
// 100 Zeilen und blaettert ueber einen Zeitstempel-Cursor zurueck.
//
// ZWEI FALLEN, beide gemessen am 2026-08-18:
//   1. `searchRuntimeLogs` sieht passender aus, antwortet aber verlaesslich mit
//      "Failed to search runtime logs" — egal ob mit oder ohne Klammern im
//      Suchwort. Der schlichte `runtimeLogs`-Weg mit eigenem Filter geht.
//   2. Beide liefern [RuntimeLog!]! — eine LISTE, KEIN Umschlag mit total/logs.
//      Eine Feldauswahl { total logs {...} } quittiert Zeabur mit HTTP 422.
//      Bei 422 nicht die Anfrage raten, sondern das Schema fragen.
import { zeaburAbfrage } from "./zeabur-api.mjs";
import { findeDienst } from "../deploy/zeabur-umgebung-setzen.mjs";

const DIENST = "smejj-control";
const MARKE = "[verbrauch]";
const seiten = Math.max(1, Math.min(100, Number(process.argv[2] || 10)));

const dienst = await findeDienst(DIENST);
const gesehen = new Set();
const treffer = [];
let cursor;

for (let seite = 0; seite < seiten; seite += 1) {
  const antwort = await zeaburAbfrage(
    `query($s:ObjectID!,$e:ObjectID,$c:Time){
       runtimeLogs(serviceID:$s, environmentID:$e, timestampCursor:$c){ message timestamp }
     }`,
    { s: dienst.serviceId, e: dienst.environmentId, ...(cursor ? { c: cursor } : {}) }
  );
  const zeilen = Array.isArray(antwort?.runtimeLogs) ? antwort.runtimeLogs : [];
  if (zeilen.length === 0) break;

  for (const zeile of zeilen) {
    const text = String(zeile.message || "");
    if (!text.includes(MARKE)) continue;
    const schluessel = `${zeile.timestamp}|${text}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    treffer.push(text.trimEnd());
  }

  const aeltester = zeilen.map((zeile) => zeile.timestamp).sort()[0];
  if (!aeltester || aeltester === cursor) break;
  cursor = aeltester;
}

if (treffer.length === 0) {
  console.error("Keine [verbrauch]-Zeilen gefunden.");
  console.error("Moegliche Gruende: seit dem Neubau lief noch keine Chat-Anfrage,");
  console.error("oder SMEJJ_VERBRAUCH_LOG steht auf \"aus\".");
  process.exit(1);
}
for (const zeile of treffer) console.log(zeile);
console.error(`${treffer.length} Messzeilen aus bis zu ${seiten} Logseiten.`);
