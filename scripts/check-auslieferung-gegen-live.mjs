#!/usr/bin/env node
// smejj.com — Waechter gegen die Drift zwischen QUELLE und AUSLIEFERUNG.
//
// WARUM ES DIESEN WAECHTER GIBT (Befund 2026-08-19):
// public/ai/chat-stream.js hatte 580 Zeilen, die ausgelieferte Fassung unter
// https://smejj.com/assets/ai/chat-stream.js hatte 750. Rund 170 Zeilen LIVE-
// Funktionen existierten NUR in der Auslieferung, weil Parallelsitzungen direkt
// in den assets/-Kopien des Deploy-Repos gearbeitet hatten: Stopp-Knopf,
// Stille-Wache (90-s-Abbruch), Gratis-Stufe 0 (./lokalesModell.js) und die
// Abriss-Politur fuer Bild-/Video-Stroeme.
//
// Die Gefahr daran ist nicht die Drift selbst, sondern ihre STILLE: ein
// regulaerer Bau aus der Quelle haette all das kommentarlos geloescht, und KEIN
// Test waere rot geworden — die gesamte Testsuite liest die Quelle, nie die
// Auslieferung. Das ist dasselbe Muster wie beim verschwundenen Glas-Design
// (Memory: "Artefakt ersetzt NIE die Quelle") und bei den 81 CSS-Regeln, die
// nur im ausgelieferten Buendel standen ("Artefakt: die WERTE weichen ab").
//
// WAHRHEIT IST DIE AUSLIEFERUNG, nicht der lokale Stand: geprueft wird gegen
// die echte URL, weil nur sie zeigt, was der Nutzer wirklich bekommt. Ein
// lokales Deploy-Repo kann veraltet oder ungepusht sein.
//
// Drei Befundarten, alle fail-closed (Exit-Code 1):
//   1. DRIFT        — Quelle und Auslieferung unterscheiden sich byte-genau.
//   2. FEHLT-QUELLE — die Auslieferung importiert ein Modul, das die Quelle gar
//                     nicht hat (genau so fiel lokalesModell.js auf).
//   3. NICHT-LIVE   — die Quelldatei ist unter ihrer /assets/-Adresse nicht
//                     erreichbar (404), wird also nie ausgeliefert.
//
// Aufruf:
//   node scripts/check-auslieferung-gegen-live.mjs
//   node scripts/check-auslieferung-gegen-live.mjs --uebernehmen   (Live -> Quelle)
//
// Netzfehler gelten ABSICHTLICH als rot. Ein Waechter, der bei fehlender
// Verbindung still gruen wird, ist genau der Schutz, der im Ernstfall nicht
// da ist — davon hat dieses Projekt schon genug gesehen.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const LIVE_BASIS = process.env.SMEJJ_LIVE_BASIS || "https://smejj.com/assets/";

// Beobachtete Ordner unter public/. Bewusst NICHT das ganze public/: sw.js und
// die Startseiten-Buendel haben eigene, aeltere Wege (Buendelbau, Cache-Marke)
// und wuerden den Waechter dauerhaft rot faerben, ohne dass jemand handeln
// koennte. Diese Liste waechst, sobald ein Bereich sauber ist.
const BEOBACHTETE_ORDNER = ["ai"];

// ANGEMELDETE DRIFT — Dateien, deren Rueckfuehrung an einer Sperre haengt.
//
// public/config.js steht im Start-Lock (docs/frontend/start-lock-manifest.json).
// Die Auslieferung ist dort um zwei Dinge voraus, die am 2026-08-19 gefunden
// wurden: die Maus-Route `mausRun: "/api/maus/run"` und den verstaendlichen
// Offline-Satz im Chat. Beides zurueckzuholen heisst, eine gesperrte Datei zu
// aendern — das geht laut Lock-Prozess NUR mit schriftlicher Bestaetigung des
// Betreibers und einem neu eingefrorenen Manifest. Bis dahin bleibt der Befund
// SICHTBAR statt weggeschaltet.
//
// Die Ausnahme ist an den Hash der ausgelieferten Fassung gebunden: aendert
// sich live auch nur ein Byte, ist sie ungueltig und der Waechter wird rot.
// Sonst waere sie ein Freifahrtschein fuer jede spaetere Drift in derselben
// Datei — genau das Muster, das dieser Waechter verhindern soll.
const ANGEMELDETE_DRIFT = new Map([
  ["config.js", {
    liveHash: "6f2cc54cb595530dceb18b039a17af0b47fe00c1565944429048031a713966ca",
    grund: "Start-Lock: Rueckfuehrung braucht schriftliche Freigabe des Betreibers (gefunden 2026-08-19)"
  }]
]);

/** SHA-256 wie im Start-Lock, damit Hashes zwischen den Waechtern vergleichbar bleiben. */
export function hashe(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Alle .js-Dateien eines Ordners, rekursiv, als Pfade relativ zu public/. */
export function sammleDateien(wurzel, ordner) {
  const start = join(wurzel, ordner);
  if (!existsSync(start)) return [];
  const gefunden = [];
  for (const eintrag of readdirSync(start, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...sammleDateien(wurzel, pfad));
    else if (eintrag.name.endsWith(".js")) gefunden.push(pfad);
  }
  return gefunden.sort();
}

/**
 * Relative Importziele eines Moduls, aufgeloest am eigenen Ordner.
 * Gebraucht fuer Befundart 2: die AUSGELIEFERTE Fassung wird gelesen, damit ein
 * Import, den nur sie kennt, sofort auffaellt.
 * @param {string} quelltext Inhalt der ausgelieferten Datei
 * @param {string} relativerPfad z.B. "ai/chat-stream.js"
 * @returns {string[]} Pfade relativ zu public/, z.B. ["ai/lokalesModell.js"]
 */
export function importZiele(quelltext, relativerPfad) {
  const ziele = [];
  const muster = /(?:^|[\s(])(?:import|export)[^'"\n]*?from\s*["'](\.[^"']+)["']/g;
  for (const treffer of quelltext.matchAll(muster)) {
    const ohneVersion = treffer[1].split("?")[0];
    if (!ohneVersion.endsWith(".js")) continue;
    ziele.push(normalize(join(dirname(relativerPfad), ohneVersion)));
  }
  return ziele;
}

/**
 * Bewertet EIN Dateipaar. Reine Funktion ohne Netz und ohne Dateisystem, damit
 * der TUEV sie mit einer kaputten UND einer gesunden Probe pruefen kann
 * (Memory: "Waechter-TUEV").
 * @param {{pfad: string, quelle: string|null, live: string|null}} paar
 * @returns {{art: string, pfad: string, text: string}[]}
 */
export function bewerte({ pfad, quelle, live }) {
  const befunde = [];
  if (live === null) {
    befunde.push({
      art: "NICHT-LIVE",
      pfad,
      text: `${pfad} liegt in der Quelle, ist unter ${LIVE_BASIS}${pfad} aber nicht erreichbar.`
    });
    return befunde;
  }
  if (quelle === null) {
    befunde.push({
      art: "FEHLT-QUELLE",
      pfad,
      text: `${pfad} wird ausgeliefert (${zeilen(live)} Zeilen), fehlt aber in public/ — ein Bau aus der Quelle wuerde es loeschen.`
    });
    return befunde;
  }
  if (quelle !== live) {
    const angemeldet = ANGEMELDETE_DRIFT.get(pfad);
    if (angemeldet && angemeldet.liveHash === hashe(live)) {
      befunde.push({
        art: "ANGEMELDET",
        pfad,
        text: `${pfad}: Drift bekannt und unveraendert — ${angemeldet.grund}.`
      });
      return befunde;
    }
    befunde.push({
      art: "DRIFT",
      pfad,
      text: angemeldet
        ? `${pfad}: die Auslieferung hat sich seit der Anmeldung GEAENDERT — die Ausnahme gilt nicht mehr.`
        : `${pfad}: Quelle ${zeilen(quelle)} Zeilen, ausgeliefert ${zeilen(live)} Zeilen — die Fassungen sind nicht identisch.`
    });
  } else if (ANGEMELDETE_DRIFT.has(pfad)) {
    befunde.push({
      art: "ERLEDIGT",
      pfad,
      text: `${pfad} ist wieder identisch — den Eintrag aus ANGEMELDETE_DRIFT entfernen.`
    });
  }
  return befunde;
}

// Schluss-Zeilenumbruch nicht mitzaehlen — sonst meldet der Waechter 751, wo
// `wc -l` 750 sagt, und die Zahl in der Meldung passt zu keiner Nachmessung.
function zeilen(text) {
  return String(text).replace(/\n$/, "").split("\n").length;
}

// Drei Versuche, weil das Netz des Betreibers messbar wackelt (google.com
// braucht von diesem Mac 2 s). Ein einzelnes "fetch failed" darf einen ganzen
// Pruefdurchlauf nicht kippen — aber wenn auch der dritte Versuch scheitert,
// bleibt es rot: geraten wird hier nichts.
async function holeLive(pfad, versuche = 3) {
  let letzterFehler;
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    try {
      const antwort = await fetch(`${LIVE_BASIS}${pfad}`, { cache: "no-store" });
      if (antwort.status === 404) return null;
      if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`);
      return await antwort.text();
    } catch (fehler) {
      letzterFehler = fehler;
      if (versuch < versuche) await new Promise((weiter) => setTimeout(weiter, 800 * versuch));
    }
  }
  throw new Error(`${pfad}: ${letzterFehler?.message || "unbekannt"}`);
}

async function main() {
  const uebernehmen = process.argv.includes("--uebernehmen");
  const wurzel = "public";
  // Warteschlange, damit Befundart 2 transitiv wirkt: ein nur live existierendes
  // Modul kann selbst weitere Module importieren, die ebenfalls fehlen.
  const offen = BEOBACHTETE_ORDNER.flatMap((ordner) => sammleDateien(wurzel, ordner));
  const gesehen = new Set();
  const befunde = [];
  let geprueft = 0;

  while (offen.length) {
    const pfad = offen.shift();
    if (gesehen.has(pfad)) continue;
    gesehen.add(pfad);

    const dateiPfad = join(wurzel, pfad);
    const quelle = existsSync(dateiPfad) ? readFileSync(dateiPfad, "utf8") : null;
    let live;
    try {
      live = await holeLive(pfad);
    } catch (fehler) {
      console.error(`check:auslieferung-gegen-live FAILED — Auslieferung nicht lesbar: ${fehler.message}`);
      console.error("Ohne Blick auf die echte Auslieferung kann dieser Waechter nichts zusagen.");
      process.exit(1);
    }
    geprueft += 1;

    const neue = bewerte({ pfad, quelle, live });
    if (uebernehmen && live !== null && quelle !== live && !ANGEMELDETE_DRIFT.has(pfad)) {
      writeFileSync(dateiPfad, live);
      console.log(`uebernommen: ${pfad} (${zeilen(live)} Zeilen aus der Auslieferung)`);
    } else {
      befunde.push(...neue);
    }

    // Importe der AUSGELIEFERTEN Fassung mitverfolgen — nur so faellt ein Modul
    // auf, das die Quelle ueberhaupt nicht kennt.
    if (live !== null) for (const ziel of importZiele(live, pfad)) if (!gesehen.has(ziel)) offen.push(ziel);
  }

  const hinweise = befunde.filter((b) => b.art === "ANGEMELDET" || b.art === "ERLEDIGT");
  const fehler = befunde.filter((b) => !hinweise.includes(b));
  // Hinweise IMMER ausgeben, auch im gruenen Lauf: eine Ausnahme, die niemand
  // mehr sieht, ist eine Ausnahme, die nie wieder aufgeraeumt wird.
  for (const hinweis of hinweise) console.log(`  ! [${hinweis.art}] ${hinweis.text}`);
  if (!fehler.length) {
    console.log(`check:auslieferung-gegen-live OK — ${geprueft} Dateien geprueft, ${hinweise.length} angemeldete Ausnahme(n).`);
    return;
  }
  console.error(`check:auslieferung-gegen-live FAILED (${fehler.length} Befunde):`);
  for (const befund of fehler) console.error(`  - [${befund.art}] ${befund.text}`);
  console.error("");
  console.error("Die Auslieferung ist die Wahrheit. Uebernehmen mit:");
  console.error("  node scripts/check-auslieferung-gegen-live.mjs --uebernehmen");
  process.exit(1);
}

// Direktaufruf erkennen: pathToFileURL, weil der Projektpfad Leerzeichen
// enthaelt und ein roher String-Vergleich dort nie greift.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((fehler) => {
    console.error(`check:auslieferung-gegen-live FAILED — ${fehler.message}`);
    process.exit(1);
  });
}
