// smejj.com — haelt die AUSGELIEFERTE Kopie unter public/assets/ mit den
// Quelldateien in public/ im Gleichklang.
//
// DER BEFUND, DER DIESES SKRIPT AUSGELOEST HAT (gemessen 2026-08-22):
// Die App laedt jede Datei aus `/assets/…` — index.html Zeile 69
// (`/assets/start-styles.css`), premium-surfaces.js Zeile 183, jedes
// `loadStyles()`. Der Ordner public/assets/ ist aber eine von Hand gepflegte
// KOPIE: kein Skript, kein npm-Befehl und kein Hook hat sie je aktualisiert.
//
// Folge, an drei echten Faellen belegt:
//   - 8d2a8dd3 "die Flaeche ist schmaler als das Fenster" (vier behobene
//     Fehler) stand NUR in public/ — live lief weiter der alte Stand.
//   - 262c195b "32 Ziele am Handy auf 44 px" ebenso.
//   - Bei settings-surface.js war die Drift EINE Zeile: die CSS-Marke stand
//     in der Quelle auf b46, in assets auf b45. Die Marke war also erhoeht
//     worden, um genau diesen Cache-Effekt zu vermeiden — und wurde selbst
//     nie ausgeliefert.
// Insgesamt wichen 20 Dateien der obersten Ebene plus die Sprachdateien ab,
// public/sw.js stand auf v639 gegen v633 in assets.
//
// Das Tueckische daran ist nicht der Fehler, sondern seine STILLE: nichts
// wird rot, keine Anfrage schlaegt fehl, die Tests lesen die Quelle. Die
// Arbeit ist einfach unsichtbar. Genau dagegen ist --check gedacht.
//
// ZWEI REGELN, die dieses Skript bewusst einhaelt:
//
// 1. Es legt NIE eine neue Datei in assets/ an. Was ausgeliefert wird, ist
//    eine Entscheidung (Seitengewicht, Precache-Liste, oeffentliche
//    Sichtbarkeit) — keine Ableitung aus dem Dateisystem. Neue Quelldateien
//    ohne Gegenstueck werden nur GEMELDET.
// 2. Die Ausnahmeliste unten schuetzt Dateien, die in assets absichtlich
//    anders aussehen. Sie zu ueberschreiben waere ein Rueckschritt, kein Sync
//    — siehe den Kommentar an jedem Eintrag.
//
// Aufruf:
//   node scripts/build/sync-assets.mjs           # kopieren
//   node scripts/build/sync-assets.mjs --check   # nur pruefen (CI, Waechter)
//   node scripts/build/sync-assets.mjs --nur <name> [<name> …]  # gezielt

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUELLE = join(ROOT, "public");
const ZIEL = join(QUELLE, "assets");

// Dateien, die in assets/ ABSICHTLICH von der Quelle abweichen.
export const AUSNAHMEN = Object.freeze({
  // Die Chat-Bruecke laeuft als Node-Dienst auf Zeabur, nicht im Browser.
  // Im Frontend-Repo ist assets/chat-bridge.js das GEBUENDELTE Artefakt
  // (bundle_chat_bridge.mjs inlined 21 Module); wer dort die Quelle
  // hinkopiert, crasht den Dienst mit ERR_MODULE_NOT_FOUND, weil die
  // relativen Importe ins Leere zeigen. Dieser Sync darf sich der Familie
  // deshalb gar nicht erst naehern. Deploy-Weg: npm run bundle:bridge.
  "chat-bridge.js": "gebuendeltes Artefakt — nur ueber bundle:bridge",
  "chat-bridge-strom.js": "gehoert zum Bruecken-Buendel",
  "chat-bridge-rag.js": "gehoert zum Bruecken-Buendel",
  "chat-bridge-weather.js": "gehoert zum Bruecken-Buendel",
  "chat-bridge-vision.js": "gehoert zum Bruecken-Buendel",
  "chat-bridge-bilder.js": "gehoert zum Bruecken-Buendel",
  "chat-bridge-evolution.js": "gehoert zum Bruecken-Buendel"
});

// Sammelt alle Dateien unter public/assets/ als Pfade RELATIV zu assets/.
// Nur diese Menge wird abgeglichen — siehe Regel 1 im Kopf.
async function ausgelieferteDateien(verzeichnis = ZIEL) {
  const gefunden = [];
  for (const eintrag of await readdir(verzeichnis, { withFileTypes: true })) {
    const voll = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) {
      gefunden.push(...(await ausgelieferteDateien(voll)));
    } else if (eintrag.isFile()) {
      gefunden.push(relative(ZIEL, voll).split(sep).join("/"));
    }
  }
  return gefunden;
}

// Vergleicht Quelle und Auslieferung. Liefert die Befunde, schreibt nichts.
export async function pruefe(nurDiese = null) {
  const namen = await ausgelieferteDateien();
  const abweichend = [];
  const ohneQuelle = [];
  const uebersprungen = [];

  for (const name of namen.sort()) {
    if (nurDiese && !nurDiese.includes(name)) continue;
    if (AUSNAHMEN[name]) { uebersprungen.push(name); continue; }

    const quellPfad = join(QUELLE, name);
    const zielPfad = join(ZIEL, name);
    const quellStat = await stat(quellPfad).catch(() => null);
    if (!quellStat) { ohneQuelle.push(name); continue; }

    const [q, z] = await Promise.all([
      readFile(quellPfad),
      readFile(zielPfad)
    ]);
    if (!q.equals(z)) abweichend.push(name);
  }

  return { gesamt: namen.length, abweichend, ohneQuelle, uebersprungen };
}

// Kopiert die abweichenden Dateien von public/ nach public/assets/.
export async function synchronisiere(nurDiese = null) {
  const { abweichend } = await pruefe(nurDiese);
  for (const name of abweichend) {
    await writeFile(join(ZIEL, name), await readFile(join(QUELLE, name)));
  }
  return abweichend;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumente = process.argv.slice(2);
  const nurIndex = argumente.indexOf("--nur");
  const nurDiese = nurIndex === -1 ? null : argumente.slice(nurIndex + 1).filter((a) => !a.startsWith("--"));

  if (argumente.includes("--check")) {
    const { gesamt, abweichend, ohneQuelle } = await pruefe(nurDiese);
    if (abweichend.length) {
      console.error(
        `assets NICHT aktuell — ${abweichend.length} von ${gesamt} Dateien weichen von public/ ab.\n` +
        `Die App laedt aus /assets/: diese Aenderungen sind LIVE unwirksam.\n`
      );
      for (const name of abweichend) console.error(`  ${name}`);
      console.error(`\nHeilung: npm run build:assets`);
      process.exit(1);
    }
    if (ohneQuelle.length) {
      console.log(`Hinweis: ${ohneQuelle.length} Datei(en) in assets/ ohne Quelle in public/ — nicht abgeglichen.`);
    }
    console.log(`assets aktuell — ${gesamt} Dateien geprueft.`);
  } else {
    const kopiert = await synchronisiere(nurDiese);
    if (!kopiert.length) {
      console.log("assets waren bereits aktuell — nichts zu tun.");
    } else {
      console.log(`assets aktualisiert — ${kopiert.length} Datei(en) kopiert:`);
      for (const name of kopiert) console.log(`  ${name}`);
    }
  }
}
