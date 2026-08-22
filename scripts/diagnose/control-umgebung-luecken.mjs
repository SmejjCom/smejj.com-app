#!/usr/bin/env node
// smejj.com — welche Umgebungswerte erwartet der Code, und welche traegt der
// laufende Dienst wirklich?
//
// WARUM ES DAS GIBT (Befund 2026-08-17): Der Dienst smejj-control trug nur noch
// 35 Umgebungswerte; am 2026-08-14 waren es 101. Gemerkt hat das niemand, weil
// jede fehlende Variable an einer ANDEREN Stelle einen anderen Fehler ausloest:
// der Maus-Lauf meldete "budget_gate_blockiert", der Artefakt-Abruf
// "rate_limit_not_enabled", und beides sah nach einem Fehler im jeweiligen
// Fachgebiet aus. Wer eine Luecke einzeln jagt, jagt wochenlang.
//
// Dieses Werkzeug stellt die Frage EINMAL fuer alle: es liest die
// SMEJJ_-/bekannten Schluesselnamen aus dem Quelltext und haelt sie gegen die
// Zeabur-Umgebung. Werte werden nie ausgegeben — nur Namen und "da/fehlt".
//
// Aufruf:  node scripts/diagnose/control-umgebung-luecken.mjs [dienstname]
// Exit-Code 0 = keine Luecke, 2 = Luecken gefunden (fail-closed fuer CI).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { zeaburAbfrage } from "./zeabur-api.mjs";
import { findeDienst } from "../deploy/zeabur-umgebung-setzen.mjs";

const QUELLEN = ["src", "control-server/src", "gatekeeper", "workers/maus-engine"];
// Nur Praefixe, die wirklich Serverkonfiguration sind. Ohne diese Einschraenkung
// faengt der Scan auch NODE_ENV, PATH und jede Testattrappe ein.
// Vier Schreibweisen, nicht eine. Das alte Muster verlangte einen Punkt direkt
// hinter `env` — und uebersah damit `env?.NAME`. Genau so ist der Ausfall vom
// 15.08. durchgerutscht: opsAutopiloten.js liest `env?.SMEJJ_AUTOPILOT_KEYS`,
// der Schluessel fehlte sieben Tage im Dienst, und dieser Pruefer nannte ihn
// nie — wegen eines Fragezeichens. Klammer-Zugriffe kommen dazu, weil sie in
// Schleifen ueber Namenslisten ueblich sind.
const MUSTER = /\benv\??\.([A-Z][A-Z0-9_]{4,})\b|\benv\??\[["'`]([A-Z][A-Z0-9_]{4,})["'`]\]/g;
const RELEVANT = /^(SMEJJ_|IDRIVE_|STRIPE_|GOOGLE_|PRESIGN_|FREE_DEMO_)/;

// DIE PFLICHTLISTE — bewusst kurz. 177 fehlende Namen ohne Gewichtung sind
// Rauschen; eine Liste, in der alles steht, sagt nichts, und genau deshalb hat
// sieben Tage lang niemand hingesehen. Hier stehen nur Werte, deren Fehlen
// GEMESSEN eine Funktion stilllegt — jeder mit Folge und Beleg. Wer erweitert,
// bringt einen Beleg mit, keine Vermutung.
export const PFLICHT = Object.freeze([
  {
    name: "SMEJJ_AUTOPILOT_KEYS",
    folge: "Kein Autopilot kann sich melden — die ganze Ampel im Adminbereich ist blind.",
    beleg: "2026-08-22: Herzschlag-Endpunkt antwortet auf JEDE ID mit 503 autopilot_keys_missing, "
      + "21 Meldungen stauten sich seit dem 15.08. in der Warteschlange, die Laeufe selbst waren gruen."
  },
  {
    name: "SMEJJ_SESSION_SECRET",
    folge: "Keine Sitzung laesst sich ausstellen oder pruefen — Anmeldung und Mess-Token sind tot.",
    beleg: "Der Qualitaets-Messlauf bricht ohne ihn ab (qualitaets-messlauf.yml: 'es wurde NICHTS gemessen')."
  }
]);

function dateien(wurzel) {
  const gefunden = [];
  const lauf = (pfad) => {
    let eintraege;
    try { eintraege = readdirSync(pfad); } catch { return; }
    for (const name of eintraege) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const voll = join(pfad, name);
      if (statSync(voll).isDirectory()) lauf(voll);
      else if (/\.(js|mjs)$/.test(name) && !/\.test\./.test(name)) gefunden.push(voll);
    }
  };
  lauf(wurzel);
  return gefunden;
}

/** Alle Konfigurationsnamen, die der Quelltext liest. */
export function erwarteteSchluessel(wurzeln = QUELLEN) {
  const namen = new Set();
  for (const wurzel of wurzeln) {
    for (const datei of dateien(wurzel)) {
      const text = readFileSync(datei, "utf8");
      for (const treffer of text.matchAll(MUSTER)) {
        const name = treffer[1] || treffer[2];
        if (RELEVANT.test(name)) namen.add(name);
      }
    }
  }
  return [...namen].sort();
}

// Der Hauptteil laeuft NUR beim direkten Aufruf. Vorher stand er nackt in der
// Datei: schon ein `import` fuer einen Test fragte damit die Produktion ab und
// beendete den Prozess mit exit(2) — ein Werkzeug, das man nicht pruefen kann,
// ohne es auszufuehren, wird nicht geprueft.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dienstName = process.argv[2] || "smejj-control";
  const dienst = await findeDienst(dienstName, zeaburAbfrage);
  const daten = await zeaburAbfrage(
    `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key } } }`,
    { s: dienst.serviceId, e: dienst.environmentId }
  );
  const vorhanden = new Set((daten?.service?.variables || []).map((v) => v.key));
  const erwartet = erwarteteSchluessel();
  const fehlend = erwartet.filter((k) => !vorhanden.has(k));

  const kritischFehlend = fehlend.filter((k) => PFLICHT.some((pf) => pf.name === k));

  console.log(`${dienstName}: ${vorhanden.size} gesetzt, ${erwartet.length} im Quelltext gelesen.`);
  console.log(`Pflichtwerte: ${PFLICHT.length - kritischFehlend.length}/${PFLICHT.length} vorhanden.`);

  if (fehlend.length) {
    console.log(`\n${fehlend.length} Schluessel werden gelesen, sind aber NICHT gesetzt.`);
    console.log("Die meisten davon sind optional und haben einen Standard — deshalb sind sie");
    console.log("ein Hinweis und kein Urteil. Vollstaendige Liste mit --alle.");
    if (process.argv.includes("--alle")) for (const k of fehlend) console.log(`  ${k}`);
  }

  if (!kritischFehlend.length) {
    console.log("\nAlle Pflichtwerte sind gesetzt.");
    process.exit(0);
  }

  console.log(`\nFEHLENDE PFLICHTWERTE (${kritischFehlend.length}) — hier steht Betrieb still:`);
  for (const k of kritischFehlend) {
    const eintrag = PFLICHT.find((pf) => pf.name === k);
    console.log(`  ${k}`);
    console.log(`    ohne ihn: ${eintrag.folge}`);
    console.log(`    gemessen: ${eintrag.beleg}`);
  }
  console.log("\nSetzen NUR ueber die Zeabur-Oberflaeche: updateEnvironmentVariable ERSETZT");
  console.log("die ganze Umgebung und hat am 2026-08-14 genau diesen Schaden angerichtet.");
  process.exit(2);
}
