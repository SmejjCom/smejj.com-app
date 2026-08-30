// smejj.com — Deploy-Abgleich: vergleicht VOR dem Frontend-Kopieren jede
// Quelle in public/ mit dem, was WIRKLICH live ist (origin/main des
// Frontend-Repos). VOR jedem Frontend-Deploy laufen lassen.
//
// Der Vorfall, der zu dieser Datei fuehrte (2026-08-23, Abnahme):
// Zwei Sitzungen deployten am selben Nachmittag ins selbe Frontend-Repo.
// Sitzung A brachte das Einviereck-Design live (start-styles-Marke
// `einviereck-20260823` in index.html). Sitzung B kopierte Minuten spaeter
// IHR index.html darueber — Marke zurueck auf `abnahme2`, und Bestandsnutzer
// bekamen bis zu 10 Minuten das alte Stylesheet aus dem HTTP-Cache. Kein
// Test wurde rot: `git push` meldet keinen inhaltlichen Verlust. Dasselbe
// Muster hatte am selben Tag schon chat-stream.js getroffen (39 Zeilen
// `entferneAbgerisseneMedien` standen NUR live — ein Upload haette sie
// geloescht; Memory smejj-frontend-deploy-live-ist-neuer).
//
// Was dieser Waechter misst — je Datei, Marken ausgeklammert:
//   nur-live  = Zeilen, die live stehen, aber lokal fehlen. Das ist das
//               STOPPSIGNAL: jemand anderes hat seit dem letzten Abgleich
//               deployt. Live-Fassung zur Basis nehmen, die eigene Aenderung
//               daraufsetzen, das Ergebnis in die Quelle zurueckschreiben.
//   nur-lokal = die eigenen Aenderungen. Kein Befund — sie sollen ja live.
//
// Ausgeklammert werden ?v=-Marken und die CACHE_NAME-Nummer: sonst ertrinkt
// der Vergleich in Markenunterschieden und niemand liest ihn mehr
// (Memory smejj-frontend-deploy-live-ist-neuer, "vorher ausklammern").
//
// Verglichen wird gegen origin/main des KLONS (nach `git fetch`), nicht gegen
// dessen Arbeitskopie: mehrere Sitzungen teilen sich den Klon, seine
// Arbeitskopie kann halbkopierte Staende tragen. origin/main ist das, was
// GitHub Pages wirklich baut.
//
// Aufruf:
//   node scripts/check-deploy-abgleich.mjs                 alle Quellen
//   node scripts/check-deploy-abgleich.mjs index.html sw.js   nur diese
//   node scripts/check-deploy-abgleich.mjs --selbsttest    Waechter-TUEV
//   SMEJJ_FRONTEND_KLON=/pfad/zum/klon  (Standard: ~/smejj-app-frontend)
//
// Exit 1 bei Stoppsignal (nur-live-Zeilen ueber der Schwelle) — dann NICHT
// kopieren. Exit 0 heisst: jede Abweichung ist die eigene.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const KLON = process.env.SMEJJ_FRONTEND_KLON || join(homedir(), "smejj-app-frontend");

// Mehr als SCHWELLE nur-live-Zeilen: Stoppsignal. Bis zu SCHWELLE Zeilen
// koennen eigene, gerade erst entfernte Zeilen sein (der haeufige Fall beim
// absichtlichen Loeschen) — sie werden trotzdem GEZEIGT, nur nicht rot.
const SCHWELLE = 3;

/** Marken und Cache-Nummern ausklammern, sonst ist jeder Vergleich rot. */
export function normalisiere(text) {
  return String(text)
    .split("\n")
    .map((zeile) => zeile
      .replace(/\?v=[A-Za-z0-9_.-]+/g, "?v=X")
      .replace(/smejj-shell-v\d+/g, "smejj-shell-vX"));
}

/** Zeilen, die nur in a stehen, und Zeilen, die nur in b stehen (LCS-frei:
 *  ein Vielfachheiten-Vergleich reicht — uns interessiert WAS fehlt, nicht wo). */
export function nurZeilen(a, b) {
  const zaehle = (liste) => {
    const m = new Map();
    for (const z of liste) m.set(z, (m.get(z) || 0) + 1);
    return m;
  };
  const inA = zaehle(a);
  const inB = zaehle(b);
  const nurA = [];
  for (const [zeile, n] of inA) {
    const fehlt = n - (inB.get(zeile) || 0);
    for (let i = 0; i < fehlt; i += 1) if (zeile.trim()) nurA.push(zeile);
  }
  const nurB = [];
  for (const [zeile, n] of inB) {
    const fehlt = n - (inA.get(zeile) || 0);
    for (let i = 0; i < fehlt; i += 1) if (zeile.trim()) nurB.push(zeile);
  }
  return { nurA, nurB };
}

// Begruendete Ausnahmen — jede mit Grund, sonst ist es eine stille Absenkung
// (check:stille-auslassung-Regel). Der Grund wird im Bericht GENANNT.
export const AUSNAHMEN = new Map([
  ["chat-bridge.js", "live liegt das ERZEUGTE Buendel (bundle_chat_bridge.mjs, 919 Wissensabschnitte) — public/ traegt die Quelle; Vergleich waere dauerhaft rot"]
]);

/** public/<pfad> -> Pfad im Frontend-Repo. null = wird nicht abgeglichen. */
export function zielpfad(quelle) {
  if (quelle.startsWith("assets/")) return null; // Spiegel, keine Quelle
  if (AUSNAHMEN.has(quelle)) return null;
  if (quelle === "index.html" || quelle === "sw.js") return quelle;
  return `assets/${quelle}`;
}

function alleQuellen() {
  const liste = [];
  const lauf = (ordner) => {
    for (const name of readdirSync(ordner)) {
      const voll = join(ordner, name);
      if (statSync(voll).isDirectory()) { lauf(voll); continue; }
      liste.push(relative(PUBLIC, voll));
    }
  };
  lauf(PUBLIC);
  return liste;
}

function gitZeige(refPfad) {
  try {
    return execFileSync("git", ["-C", KLON, "show", refPfad], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  } catch {
    return null; // Datei gibt es live (noch) nicht
  }
}

/**
 * Der eigentliche Abgleich.
 * @param {string[]} nurDiese leere Liste = alle Quellen
 * @param {{holen?: boolean, probe?: string}} optionen probe: zusaetzliche
 *   nur-live-Zeile fuer den Selbsttest, wird jeder Live-Fassung angehaengt.
 * @returns {{befunde: Array, geprueft: number, uebersprungen: number}}
 */
export function abgleich(nurDiese = [], { holen = true, probe = "" } = {}) {
  if (!existsSync(join(KLON, ".git"))) {
    throw new Error(`Frontend-Klon fehlt: ${KLON} — anlegen mit\n  git clone --depth 1 https://github.com/SmejjCom/smejj-app-frontend.git ${KLON}\noder SMEJJ_FRONTEND_KLON setzen.`);
  }
  if (holen) execFileSync("git", ["-C", KLON, "fetch", "-q", "origin", "main"], { timeout: 60_000 });
  const quellen = nurDiese.length ? nurDiese : alleQuellen();
  const befunde = [];
  let geprueft = 0;
  let uebersprungen = 0;
  for (const quelle of quellen) {
    const ziel = zielpfad(quelle);
    if (!ziel) { uebersprungen += 1; continue; }
    // Binaerdateien (Bilder, Fonts, Icons): kein Zeilenvergleich moeglich —
    // sie werden byteweise gemeldet, aber nie als Stoppsignal (ein Icon
    // ueberschreibt man bewusst, nicht versehentlich zeilenweise).
    if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp3|mp4|pdf)$/i.test(quelle)) { uebersprungen += 1; continue; }
    const lokalRoh = readFileSync(join(PUBLIC, quelle), "utf8");
    let liveRoh = gitZeige(`origin/main:${ziel}`);
    if (liveRoh === null) { uebersprungen += 1; continue; }
    if (probe) liveRoh += `\n${probe}\n`;
    geprueft += 1;
    const { nurA: nurLive, nurB: nurLokal } = nurZeilen(normalisiere(liveRoh), normalisiere(lokalRoh));
    if (nurLive.length === 0) continue;
    befunde.push({ quelle, ziel, nurLive, nurLokal: nurLokal.length, stopp: nurLive.length > SCHWELLE });
  }
  return { befunde, geprueft, uebersprungen };
}

function bericht({ befunde, geprueft, uebersprungen }) {
  for (const [datei, grund] of AUSNAHMEN) console.log(`  Ausnahme ${datei}: ${grund}`);
  const stopps = befunde.filter((b) => b.stopp);
  for (const b of befunde) {
    const kopf = b.stopp ? "STOPP" : "Hinweis";
    console.log(`  ${kopf}: ${b.quelle} — ${b.nurLive.length} Zeile(n) NUR live (lokal ${b.nurLokal} eigene):`);
    for (const zeile of b.nurLive.slice(0, 5)) console.log(`      ${zeile.trim().slice(0, 100)}`);
    if (b.nurLive.length > 5) console.log(`      … und ${b.nurLive.length - 5} weitere`);
  }
  if (stopps.length) {
    console.log(`\ndeploy-abgleich STOPP — ${stopps.length} Datei(en) sind live NEUER als lokal.`);
    console.log("NICHT kopieren: Live-Fassung zur Basis nehmen, eigene Aenderung daraufsetzen,");
    console.log("das Ergebnis in die Quelle (public/) zurueckschreiben — sonst verschwindet");
    console.log("fremde Arbeit lautlos (Vorfaelle 2026-08-23: einviereck-Marke, chat-stream.js).");
    return 1;
  }
  console.log(`deploy-abgleich OK — ${geprueft} Datei(en) gegen origin/main geprueft, ${uebersprungen} ohne Live-Gegenstueck/binaer/Spiegel; jede Abweichung ist die eigene.`);
  return 0;
}

function selbsttest() {
  // Kaputte Probe: eine erfundene nur-live-Zeile wird jeder Live-Fassung
  // angehaengt (ueber der Schwelle: vier Mal dieselbe waere EIN Eintrag im
  // Vielfachheiten-Vergleich, darum vier VERSCHIEDENE Zeilen).
  const probe = ["/*p1*/", "/*p2*/", "/*p3*/", "/*p4*/"].join("\n");
  const kaputt = abgleich(["index.html"], { probe });
  const trifft = kaputt.befunde.some((b) => b.stopp);
  if (!trifft) {
    console.error("Selbsttest DURCHGEFALLEN: vier eingesetzte nur-live-Zeilen wurden nicht als Stopp erkannt.");
    return 1;
  }
  // Gesunde Probe: die Marken-Normalisierung darf einen reinen
  // Markenunterschied NICHT melden.
  const a = normalisiere('<script src="/assets/app.js?v=b94"></script>');
  const b = normalisiere('<script src="/assets/app.js?v=b99"></script>');
  const { nurA } = nurZeilen(a, b);
  if (nurA.length !== 0) {
    console.error("Selbsttest DURCHGEFALLEN: ein reiner ?v=-Markenunterschied wurde gemeldet.");
    return 1;
  }
  console.log("Selbsttest bestanden: 4 nur-live-Zeilen -> Stopp erkannt; reiner Markenunterschied -> still.");
  return 0;
}

const argumente = process.argv.slice(2);
// pathToFileURL statt Handkonkatenation: der Projektpfad traegt Leerzeichen,
// und `file://${argv[1]}` ist dann NIE gleich import.meta.url — das Skript
// waere still gruen, ohne je zu laufen (beim ersten Lauf genau so passiert).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    if (argumente.includes("--selbsttest")) process.exit(selbsttest());
    const dateien = argumente.filter((a) => !a.startsWith("--"));
    process.exit(bericht(abgleich(dateien)));
  } catch (fehler) {
    console.error(`deploy-abgleich FEHLER: ${fehler.message}`);
    process.exit(1);
  }
}
