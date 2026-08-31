#!/usr/bin/env node
// smejj.com — Konsolen-Dateien in den Frontend-Klon spiegeln (fuer smejj.com/admin).
//
// Warum es diesen Schritt gibt: Die Operations Console liegt als Quelle in
// `control-server/admin-ui/`. Ausgeliefert wird sie seit 2026-08-07 STATISCH
// von smejj.com/admin (GitHub Pages) — so verlangt es die Architekturregel
// "Alles, was statisch ausgeliefert werden kann, wird statisch ausgeliefert".
// Der Control-Server liefert dieselben Dateien weiter aus (Rueckfallweg).
//
// Zwei Orte, EINE Quelle: dieses Skript kopiert, es erfindet nichts. Wer eine
// Datei nur im Frontend-Repo aendert, faellt beim Vergleich unten auf.
//
// Aufruf:
//   node scripts/deploy/sync_admin_console_pages.mjs <pfad-zum-frontend-klon>
//   node scripts/deploy/sync_admin_console_pages.mjs <pfad> --pruefen
//   node scripts/deploy/sync_admin_console_pages.mjs --pruefen      (ohne Klon)
//
// `--pruefen` aendert nichts und endet mit Code 1, sobald etwas abweicht.
//
// OHNE Klon-Pfad prueft `--pruefen` zwei Dinge, die keinen Frontend-Klon
// brauchen und deshalb in `npm run check:all` laufen koennen:
//   1. Hat sich die Quelle seit der letzten Spiegelung geaendert? Der Abgleich
//      laeuft gegen docs/frontend/admin-console-sync.json, das beim Spiegeln
//      mitgeschrieben wird. Schlaegt an, wenn jemand die Konsole aendert und
//      das Spiegeln vergisst — dann waere smejj.com/admin veraltet, ohne dass
//      es irgendwo auffaellt.
//   2. Hat jede in der Konsole registrierte Seite einen Ordner in
//      SEITEN_ORDNER? Fehlt einer, antwortet GitHub Pages auf die Adresse mit
//      404 — und das merkt man sonst erst beim Klicken.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUELLE = path.resolve(fileURLToPath(new URL("../../control-server/admin-ui/", import.meta.url)));
const MANIFEST = path.resolve(fileURLToPath(new URL("../../docs/frontend/admin-console-sync.json", import.meta.url)));

// Jede Konsolen-Seite bekommt auf GitHub Pages einen eigenen Ordner mit einer
// Kopie von index.html — so sind die Adressen ECHTE Pfade (smejj.com/admin/jobs/)
// statt #-Routen. Die Liste entspricht den Registrierungen in console.js und
// den console-stage*.js; wer dort eine Seite ergaenzt, ergaenzt sie HIER —
// sonst antwortet Pages auf die neue Adresse mit 404 und der Fehler faellt
// erst beim Klicken auf. „uebersicht" fehlt bewusst: sie ist /admin/ selbst.
const SEITEN_ORDNER = Object.freeze([
  "nutzer", "rollen", "support", "freigaben", "audit", "compliance",
  "moderation", "dsgvo", "ankuendigungen", "flags",
  "modelle", "jobs", "worker", "deploy", "speicher",
  "schluessel", "ereignisse", "adminverwaltung",
  "abrechnung", "kosten", "api",
  "wissen", "sprachen", "experimente", "email", "analytik", "aufgaben",
  "autopiloten",
  // 2026-08-25 (Vollaudit): "evolution" nachgetragen — die Konsole DIESES
  // Zweigs registriert die Seite laengst, live antwortet sie mit 200; nur
  // dieser Liste fehlte der Eintrag, und der Pruefer meldete einen 404, den
  // es nie gab. Der Ordner kam aus dem Live-Klon mit. Die uebrigen neueren
  // Seiten des Bauzweigs (cockpit, radar, auslieferung, regeln, tagesmappe)
  // registriert erst dessen Konsole — sie kommen mit dem Buendel-Abgleich.
  // 2026-08-31 (Buendel-Abgleich, Betreiber-Freigabe "alle Rechte von A bis
  // z — mach hundert Prozent fertig"): cockpit kommt hinzu (vollstaendige
  // Pruefkette: Ordner, Endpunkte, Ansicht). radar/auslieferung/regeln/
  // tagesmappe bleiben bewusst AUSGENOMMEN — ihre Frontends rufen teils
  // keine Endpunkte bzw. treten auf fehlende Server-Routen (Befund
  // check-admin-konsole 31.08.); eigene Baustelle, kommt spaeter.
  "cockpit",
  "evolution"
]);

function sha256(inhalt) {
  return createHash("sha256").update(inhalt).digest("hex");
}

export function konsolenDateien(quelle = QUELLE) {
  return readdirSync(quelle, { withFileTypes: true })
    // Seit dem Buendel-Abgleich 2026-08-31 liegen in admin-ui/ auch Seiten-
    // ordner (cockpit/ radar/ …) mit je einer index.html — Ordner sind keine
    // Konsolendateien und duerfen weder gespiegelt noch gehasht werden.
    .filter((eintrag) => eintrag.isFile())
    .map((eintrag) => eintrag.name)
    // Tests liegen neben dem Code, gehoeren aber NICHT ins Netz: gespiegelt
    // waeren sie unter smejj.com/admin/<name>.test.js oeffentlich abrufbar.
    // (Der Control-Server liefert sie ohnehin nie aus — seine Dateiliste ist
    // fest. Der Pages-Spiegel hat diesen Schutz nicht, deshalb hier.)
    .filter((name) => !/\.test\.[cm]?js$/.test(name))
    .sort();
}

/**
 * Die Seitenpfade, die sich in der Konsole registrieren.
 *
 * Zwei Fundstellen, weil die Konsole zweigeteilt ist: der Kern fuehrt seine
 * Seiten in SEITEN (`pfad: "nutzer"`), die Stufen-Dateien melden sich ueber ein
 * `seiten`-Objekt an (`nutzer: { id: … }`). Bewusst per Textsuche statt Import:
 * die Dateien sind Browser-Skripte und wuerden in Node ueber `window` stolpern.
 */
export function registrierteSeiten(quelle = QUELLE) {
  const gefunden = new Set();
  for (const name of konsolenDateien(quelle)) {
    if (!/^console.*\.js$/.test(name)) continue;
    const text = readFileSync(path.join(quelle, name), "utf8");
    for (const treffer of text.matchAll(/\bpfad:\s*"([a-z0-9-]+)"/g)) gefunden.add(treffer[1]);
    // Beide Schreibweisen kommen vor: `const seiten = {` (Stufe 4-6) und
    // `seiten: {` innerhalb von window.adminStageN (Stufe 7-9). Deshalb wird
    // die Klammer GEZAEHLT statt die Einrueckung geraten — sonst faellt jede
    // neue Stufe stillschweigend durch.
    for (const schluessel of seitenSchluessel(text)) gefunden.add(schluessel);
  }
  // Die Uebersicht ist /admin/ selbst und braucht keinen eigenen Ordner.
  gefunden.delete("uebersicht");
  return [...gefunden].sort();
}

/** Schluessel der obersten Ebene im `seiten`-Objekt einer Konsolen-Datei. */
function seitenSchluessel(text) {
  const anfang = /(?:const\s+seiten\s*=|\bseiten\s*:)\s*\{/.exec(text);
  if (!anfang) return [];
  const start = anfang.index + anfang[0].length - 1;   // Position der offenen Klammer
  let tiefe = 0;
  let ende = start;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") tiefe += 1;
    else if (text[i] === "}") {
      tiefe -= 1;
      if (tiefe === 0) { ende = i; break; }
    }
  }
  const block = text.slice(start + 1, ende);
  const schluessel = [];
  let ebene = 0;
  for (const treffer of block.matchAll(/([a-zA-Z0-9_-]+)\s*:\s*\{|[{}]/g)) {
    if (treffer[0] === "{") { ebene += 1; continue; }
    if (treffer[0] === "}") { ebene -= 1; continue; }
    if (ebene === 0) schluessel.push(treffer[1]);
    ebene += 1;   // die gerade geoeffnete Klammer des Eintrags
  }
  return schluessel;
}

function manifestSchreiben(quelle) {
  const dateien = {};
  for (const name of konsolenDateien(quelle)) {
    dateien[name] = sha256(readFileSync(path.join(quelle, name)));
  }
  writeFileSync(MANIFEST, `${JSON.stringify({
    hinweis: "Erzeugt von scripts/deploy/sync_admin_console_pages.mjs — nicht von Hand aendern.",
    quelle: "control-server/admin-ui/",
    seitenOrdner: [...SEITEN_ORDNER],
    dateien
  }, null, 2)}\n`);
}

/**
 * Pruefung ohne Frontend-Klon: Quelle gegen das Spiegel-Manifest und die
 * registrierten Seiten gegen SEITEN_ORDNER.
 * @returns {{ok: boolean, befunde: string[]}}
 */
export function pruefeOhneKlon({ quelle = QUELLE } = {}) {
  const befunde = [];

  if (!existsSync(MANIFEST)) {
    befunde.push("Spiegel-Manifest fehlt — einmal spiegeln, damit es entsteht.");
  } else {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const jetzt = konsolenDateien(quelle);
    for (const name of jetzt) {
      const ist = sha256(readFileSync(path.join(quelle, name)));
      if (!manifest.dateien[name]) befunde.push(`${name}: neu, aber nie gespiegelt`);
      else if (manifest.dateien[name] !== ist) befunde.push(`${name}: geaendert, aber nicht gespiegelt`);
    }
    for (const name of Object.keys(manifest.dateien)) {
      if (!jetzt.includes(name)) befunde.push(`${name}: geloescht, aber noch im Spiegel`);
    }
  }

  const registriert = registrierteSeiten(quelle);
  for (const seite of registriert) {
    if (!SEITEN_ORDNER.includes(seite)) {
      befunde.push(`Seite "${seite}" ist registriert, hat aber keinen Ordner in SEITEN_ORDNER — smejj.com/admin/${seite}/ waere 404`);
    }
  }
  for (const ordner of SEITEN_ORDNER) {
    if (!registriert.includes(ordner)) {
      befunde.push(`Ordner "${ordner}" steht in SEITEN_ORDNER, aber keine Seite registriert ihn`);
    }
  }

  return { ok: befunde.length === 0, befunde, seiten: registriert.length };
}

export function spiegeln(zielWurzel, { pruefen = false, quelle = QUELLE } = {}) {
  const ziel = path.join(zielWurzel, "admin");
  if (!existsSync(zielWurzel)) throw new Error(`Frontend-Klon nicht gefunden: ${zielWurzel}`);
  if (!pruefen) mkdirSync(ziel, { recursive: true });

  const abweichungen = [];
  const geschrieben = [];
  for (const name of konsolenDateien(quelle)) {
    const inhalt = readFileSync(path.join(quelle, name));
    const zielPfad = path.join(ziel, name);
    const vorhanden = existsSync(zielPfad) ? readFileSync(zielPfad) : null;
    if (vorhanden && sha256(vorhanden) === sha256(inhalt)) continue;
    abweichungen.push(name + (vorhanden ? " (veraendert)" : " (fehlt)"));
    if (!pruefen) {
      writeFileSync(zielPfad, inhalt);
      geschrieben.push(name);
    }
  }
  // Seiten-Ordner: jeweils eine Kopie von index.html (alle Verweise darin sind
  // absolut /admin/..., deshalb funktioniert dieselbe Datei in jeder Tiefe).
  const indexInhalt = readFileSync(path.join(quelle, "index.html"));
  for (const seite of SEITEN_ORDNER) {
    const ordnerPfad = path.join(ziel, seite, "index.html");
    const vorhanden = existsSync(ordnerPfad) ? readFileSync(ordnerPfad) : null;
    if (vorhanden && sha256(vorhanden) === sha256(indexInhalt)) continue;
    abweichungen.push(seite + "/index.html" + (vorhanden ? " (veraendert)" : " (fehlt)"));
    if (!pruefen) {
      mkdirSync(path.join(ziel, seite), { recursive: true });
      writeFileSync(ordnerPfad, indexInhalt);
      geschrieben.push(seite + "/index.html");
    }
  }
  // Nach dem Spiegeln festhalten, WAS gespiegelt wurde — daraus lebt die
  // Pruefung ohne Klon.
  if (!pruefen) manifestSchreiben(quelle);
  return { dateien: konsolenDateien(quelle).length + SEITEN_ORDNER.length, abweichungen, geschrieben };
}

function main() {
  const argumente = process.argv.slice(2);
  const pruefen = argumente.includes("--pruefen");
  const zielWurzel = argumente.find((a) => !a.startsWith("--"));

  // Ohne Klon-Pfad: die beiden Pruefungen, die in check:all laufen koennen.
  if (!zielWurzel) {
    if (!pruefen) {
      console.error("Aufruf: node scripts/deploy/sync_admin_console_pages.mjs <frontend-klon> [--pruefen]");
      console.error("        node scripts/deploy/sync_admin_console_pages.mjs --pruefen   (ohne Klon)");
      process.exit(1);
    }
    const ergebnis = pruefeOhneKlon();
    if (!ergebnis.ok) {
      console.error(`admin-console-sync VERLETZT (${ergebnis.befunde.length}):`);
      for (const befund of ergebnis.befunde) console.error(`  - ${befund}`);
      console.error("Beheben: node scripts/deploy/sync_admin_console_pages.mjs <frontend-klon>, dann Frontend deployen.");
      process.exit(1);
    }
    console.log(`admin-console-sync OK — Quelle gespiegelt, ${ergebnis.seiten} Konsolen-Seiten haben ihren Ordner.`);
    return;
  }

  const ergebnis = spiegeln(path.resolve(zielWurzel), { pruefen });
  console.log(JSON.stringify({ modus: pruefen ? "pruefen" : "spiegeln", ...ergebnis }, null, 2));
  if (pruefen && ergebnis.abweichungen.length > 0) {
    console.error("Frontend-Kopie weicht von control-server/admin-ui ab — erst spiegeln, dann deployen.");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
