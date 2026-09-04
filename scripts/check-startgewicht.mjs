#!/usr/bin/env node
// smejj.com — Waechter fuer das EIGENGEWICHT der Startseite.
//
// Betreiber-Auftrag 2026-09-04 ("erst Waechter, dann abspecken"), Fortsetzung
// des Auftrags vom 19./24.08. "Startseite abspecken, unter 300 KB".
//
// DER BEFUND, DER DAZU GEFUEHRT HAT (im Chrome des Betreibers gemessen):
// Die Startseite zieht 781 KB komprimiert ohne Bilder — 595 KB JavaScript und
// 145 KB in einer einzigen CSS-Datei. Davon sind 269 KB Chat-Module, die
// laden, obwohl kein Chat sichtbar und niemand angemeldet ist. Auf der Leitung
// des Betreibers (1,5 Mbit/s) sind das rund 4,2 Sekunden reine Uebertragung
// beim ersten Besuch. Die Vorgabe im Master-Prompt lautet: unter 300 KB.
//
// UND: es gab bis heute NICHTS, was das misst. Der Performance-Lock ("kein
// Deploy darf ein Performance-Budget verschlechtern") hatte fuer das Gewicht
// keine Zaehne — `bedarf-nachladen.js` und der Abspeck-Auftrag existierten,
// aber niemand haette gemerkt, wenn die Seite wieder waechst.
//
// WARUM EINE MESSLATTE UND KEINE MAUER: Wuerde dieser Waechter sofort auf
// 300 KB stellen, waere `npm run check:all` ab der ersten Minute rot und
// blockierte jede andere Arbeit — und ein Check, den man dauerhaft ignoriert,
// ist kein Check. Stattdessen eine Ratsche:
//   - ROT, wenn die Seite SCHWERER wird als die eingefrorene Messlatte.
//   - Wird sie leichter, meldet der Waechter das und bietet die neue,
//     niedrigere Messlatte an (`--messlatte-neu`). Zurueck geht es nie.
//   - Der Abstand zum Ziel von 300 KB steht in JEDER Ausgabe, damit er nicht
//     in Vergessenheit geraet.
//
// WAS GEMESSEN WIRD: nur, was der Browser OHNE Zutun des Nutzers holt —
//   1. jedes <script src> und <link rel=stylesheet> aus public/index.html,
//   2. und, weil `type="module"` seine Importe mitzieht, der komplette
//      STATISCHE Importbaum darunter.
// Dynamische `import()` zaehlen NICHT: genau die sind das Mittel zum
// Abspecken (bedarf-nachladen.js), sie duerfen nicht bestraft werden.
// Bilder zaehlen nicht — so lautet die Vorgabe.
//
// Gemessen wird GZIP, weil so ausgeliefert wird. Die rohe Dateigroesse
// beantwortet die Frage nicht, die der Betreiber hat ("wie lange warte ich?").
//
// Aufruf:
//   node scripts/check-startgewicht.mjs
//   node scripts/check-startgewicht.mjs --bericht        (die groessten Posten)
//   node scripts/check-startgewicht.mjs --messlatte-neu --confirm "<Wortlaut>"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OEFFENTLICH = path.join(WURZEL, "public");
const SEITE = path.join(OEFFENTLICH, "index.html");

// Die uebrigen Seiten, die der Betreiber und die Nutzer wirklich aufrufen.
// Sie haben KEINE eigene Messlatte (sie sind alle deutlich leichter als die
// Startseite); der Waechter meldet sie, wenn eine ueber die Vorgabe geht.
// Der Adminbereich fehlt bewusst: er hat seine eigene Kette und seinen eigenen
// Schutz (check:admin-console-sync, admin-lock).
const WEITERE_SEITEN = Object.freeze([
  "verlauf.html", "programmieren.html", "entwickler.html", "hilfe.html",
  "status.html", "willkommen.html", "agb.html", "datenschutz.html",
  "impressum.html", "widerruf.html", "danke-abo.html", "404.html"
]);
const MESSLATTE = path.join(WURZEL, "docs/frontend/startgewicht-messlatte.json");
const ZIEL_KB = 300;

/** Eine Adresse aus dem Markup auf eine Datei in public/ abbilden. */
export function nachDatei(adresse) {
  const ohneFrage = String(adresse).split("?")[0].split("#")[0];
  if (/^https?:/.test(ohneFrage) || ohneFrage.startsWith("//")) return null;  // fremde Herkunft zaehlt nicht
  const rein = ohneFrage.replace(/^\/+/, "");
  // "/assets/..." ist eine AUSLIEFERUNGS-Adresse, kein Ordner im Repo: public/
  // wird unter beiden Adressen ausgeliefert, und `public/assets/` enthaelt nur
  // einen Teil davon (die Unterordner storage/ und ai/ liegen nur in public/).
  // Wer diese Zeile weglaesst, misst die halbe Seite — der erste Entwurf fand
  // 53 statt 98 Dateien, weil /assets/storage/index.js ins Leere lief.
  const kandidaten = [
    path.join(OEFFENTLICH, rein),
    path.join(OEFFENTLICH, rein.replace(/^assets\//, "")),
    path.join(OEFFENTLICH, "assets", rein)
  ];
  for (const kandidat of kandidaten) {
    if (existsSync(kandidat)) return kandidat;
  }
  return null;
}

/** Die statischen Importe einer Moduldatei — dynamische import() bewusst nicht. */
export function statischeImporte(datei) {
  const text = readFileSync(datei, "utf8");
  const ziele = [];
  // import ... from "x";  /  import "x";  /  export ... from "x";
  const muster = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const treffer of text.matchAll(muster)) {
    const roh = treffer[1] || treffer[2];
    if (!roh) continue;
    const aufgeloest = roh.startsWith(".")
      ? "/" + path.relative(OEFFENTLICH, path.resolve(path.dirname(datei), roh.split("?")[0]))
      : roh;
    ziele.push(aufgeloest);
  }
  return ziele;
}

/** Alles, was der Browser ohne Zutun des Nutzers holt. */
export function eigengewicht(seite = SEITE) {
  const html = readFileSync(seite, "utf8");
  const einstiege = [];
  for (const t of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) einstiege.push(t[1]);
  for (const t of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g)) einstiege.push(t[1]);
  for (const t of html.matchAll(/<link[^>]*\shref="([^"]+)"[^>]*rel="stylesheet"/g)) einstiege.push(t[1]);

  // Die Seite SELBST zaehlt mit — sie ist das erste, was ueber die Leitung geht.
  // Der erste Entwurf zaehlte nur die externen Dateien und meldete fuer
  // programmieren.html "0 KB / 0 Dateien". Die Seite ist aber 8,5 KB gross und
  // traegt ihren ganzen Stil in einem <style>-Block: nach der alten Rechnung
  // waere sie gewichtslos gewesen, obwohl sie geladen wird.
  const gesehen = new Map([[seite, gzipSync(readFileSync(seite)).length]]);
  const offen = [...einstiege];
  const nichtGefunden = [];
  while (offen.length) {
    const adresse = offen.shift();
    const datei = nachDatei(adresse);
    if (!datei) {
      if (!/^https?:|^\/\//.test(adresse)) nichtGefunden.push(adresse);
      continue;
    }
    if (gesehen.has(datei)) continue;
    gesehen.set(datei, gzipSync(readFileSync(datei)).length);
    if (datei.endsWith(".js") || datei.endsWith(".mjs")) offen.push(...statischeImporte(datei));
  }
  const posten = [...gesehen.entries()]
    .map(([datei, bytes]) => ({ datei: path.relative(OEFFENTLICH, datei), bytes }))
    .sort((a, b) => b.bytes - a.bytes);
  const bytes = posten.reduce((s, p) => s + p.bytes, 0);
  return { bytes, kb: Math.round(bytes / 1024), dateien: posten.length, posten, nichtGefunden,
    zwillinge: zwillingeVergleichen(gesehen) };
}

/**
 * Dieselbe Datei liegt an zwei Stellen: `public/x` und `public/assets/x`.
 * Ausgeliefert wird unter `/assets/x` die Kopie — gemessen wird also die
 * Kopie. Laufen die beiden auseinander, misst dieser Waechter etwas anderes,
 * als im Repo steht, und niemand merkt es.
 *
 * Genau dieser Fall ist am 2026-09-04 zweimal aufgetreten: `public/assets/sw.js`
 * hing zwei Cache-Nummern hinter `public/sw.js` zurueck, weil ein Bump die
 * Kopie vergessen hatte. Deshalb wird es hier mitgeprueft, wo die Dateien
 * ohnehin schon gelesen werden.
 */
function zwillingeVergleichen(gesehen) {
  const abweichend = [];
  for (const datei of gesehen.keys()) {
    const rel = path.relative(OEFFENTLICH, datei);
    const anderer = rel.startsWith("assets/")
      ? path.join(OEFFENTLICH, rel.slice("assets/".length))
      : path.join(OEFFENTLICH, "assets", rel);
    if (!existsSync(anderer)) continue;
    if (!readFileSync(datei).equals(readFileSync(anderer))) {
      abweichend.push(`${rel} weicht von ${path.relative(OEFFENTLICH, anderer)} ab`);
    }
  }
  return abweichend;
}

function messlatteLesen() {
  return existsSync(MESSLATTE) ? JSON.parse(readFileSync(MESSLATTE, "utf8")) : null;
}

function messlatteSchreiben(mess, wortlaut, methodikVonKb) {
  writeFileSync(MESSLATTE, `${JSON.stringify({
    hinweis: "Messlatte fuer das Eigengewicht der Startseite. Erzeugt von scripts/check-startgewicht.mjs.",
    regel: "Die Startseite darf nicht schwerer werden als dieser Wert. Wird sie leichter, wird die Messlatte nachgezogen — zurueck geht es nie.",
    zielKb: ZIEL_KB,
    gesetztAm: new Date().toISOString(),
    freigabe: wortlaut,
    ...(methodikVonKb ? { methodikwechselVonKb: methodikVonKb } : {}),
    grenzeBytes: mess.bytes,
    grenzeKb: mess.kb,
    dateien: mess.dateien,
    groessteFuenf: mess.posten.slice(0, 5).map((p) => `${p.datei} — ${Math.round(p.bytes / 1024)} KB`)
  }, null, 2)}\n`);
}

function bericht(mess) {
  console.log(`  ${mess.dateien} Dateien, ${mess.kb} KB gzip (Ziel: ${ZIEL_KB} KB)`);
  console.log("  Die zehn schwersten Posten:");
  for (const p of mess.posten.slice(0, 10)) console.log(`    ${String(Math.round(p.bytes / 1024)).padStart(4)} KB  ${p.datei}`);
  const chat = mess.posten.filter((p) => /(^|\/)chat-/.test(p.datei));
  if (chat.length) {
    console.log(`  Davon Chat-Module: ${chat.length} Dateien, ${Math.round(chat.reduce((s, p) => s + p.bytes, 0) / 1024)} KB`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const mess = eigengewicht();

  if (argv.includes("--messlatte-neu")) {
    const i = argv.indexOf("--confirm");
    const wortlaut = i >= 0 ? argv[i + 1] : "";
    if (!wortlaut || wortlaut.trim().length < 10) {
      console.error("startgewicht: --messlatte-neu verlangt --confirm \"<Wortlaut der Betreiber-Freigabe>\".");
      process.exit(1);
    }
    const alt = messlatteLesen();
    // Die Ratsche geht NUR nach unten — mit genau einer Ausnahme: wenn sich die
    // MESSMETHODE aendert und dieselbe Seite deshalb eine andere Zahl bekommt.
    // Das ist am 2026-09-04 sofort passiert: erst zaehlte der Waechter nur die
    // externen Dateien, dann auch die Seite selbst (+18 KB). Ohne diese
    // Ausnahme muesste man das Manifest von Hand aendern — und wer das einmal
    // tut, tut es beim naechsten Wachsen wieder. Die Ausnahme verlangt ein
    // eigenes Wort (--methodik) und landet als Begruendung im Manifest.
    const methodik = process.argv.includes("--methodik");
    if (alt && mess.bytes > alt.grenzeBytes && !methodik) {
      console.error(`startgewicht: die Messlatte darf nur SINKEN. Jetzt ${mess.kb} KB, Messlatte ${alt.grenzeKb} KB.`);
      console.error(`  Hat sich die MESSMETHODE geaendert? Dann --methodik dazu und im --confirm sagen, was jetzt anders gezaehlt wird.`);
      process.exit(1);
    }
    messlatteSchreiben(mess, wortlaut, methodik ? (alt ? alt.grenzeKb : null) : null);
    console.log(`startgewicht: Messlatte auf ${mess.kb} KB gesetzt${alt ? ` (vorher ${alt.grenzeKb} KB)` : ""}.`);
    return;
  }

  if (argv.includes("--bericht")) { bericht(mess); return; }

  if (argv.includes("--alle")) {
    console.log(`  ${String(mess.kb).padStart(4)} KB  index.html  (Messlatte)`);
    for (const name of WEITERE_SEITEN) {
      const datei = path.join(OEFFENTLICH, name);
      if (!existsSync(datei)) { console.log(`         —  ${name} (fehlt)`); continue; }
      const m = eigengewicht(datei);
      console.log(`  ${String(m.kb).padStart(4)} KB  ${name}${m.kb > ZIEL_KB ? "  UEBER DER VORGABE" : ""}`
        + `   ${m.dateien} Dateien`);
    }
    return;
  }

  const latte = messlatteLesen();
  if (!latte) {
    console.error(`startgewicht: Messlatte fehlt (${path.relative(WURZEL, MESSLATTE)}). Erst setzen.`);
    process.exit(1);
  }
  if (mess.zwillinge.length) {
    console.error(`startgewicht: ${mess.zwillinge.length} Datei(en) liegen in zwei Fassungen vor — ausgeliefert wird die unter /assets/:`);
    for (const z of mess.zwillinge) console.error(`  - ${z}`);
    process.exit(1);
  }
  if (mess.nichtGefunden.length) {
    console.error(`startgewicht: ${mess.nichtGefunden.length} Adresse(n) aus index.html zeigen ins Leere — das waere auf der Seite ein 404:`);
    for (const a of mess.nichtGefunden) console.error(`  - ${a}`);
    process.exit(1);
  }
  // Die uebrigen Seiten haben keine eigene Messlatte, aber dieselbe Vorgabe.
  const zuSchwer = [];
  for (const name of WEITERE_SEITEN) {
    const datei = path.join(OEFFENTLICH, name);
    if (!existsSync(datei)) continue;
    const m = eigengewicht(datei);
    if (m.kb > ZIEL_KB) zuSchwer.push(`${name}: ${m.kb} KB gzip`);
  }
  if (zuSchwer.length) {
    console.error(`startgewicht VERLETZT: ${zuSchwer.length} Seite(n) ueber der Vorgabe von ${ZIEL_KB} KB:`);
    for (const z of zuSchwer) console.error(`  - ${z}`);
    process.exit(1);
  }

  const offenKb = mess.kb - ZIEL_KB;
  if (mess.bytes > latte.grenzeBytes) {
    console.error(`startgewicht VERLETZT: die Startseite ist SCHWERER geworden — ${mess.kb} KB statt hoechstens ${latte.grenzeKb} KB.`);
    bericht(mess);
    console.error(`  Messlatte gesetzt am ${latte.gesetztAm} auf Freigabe: "${latte.freigabe}"`);
    process.exit(1);
  }
  if (mess.bytes < latte.grenzeBytes) {
    console.log(`startgewicht: LEICHTER geworden — ${mess.kb} KB statt ${latte.grenzeKb} KB. Messlatte nachziehen:`);
    console.log(`  node scripts/check-startgewicht.mjs --messlatte-neu --confirm "<Wortlaut>"`);
  }
  console.log(`startgewicht OK — ${mess.kb} KB gzip aus ${mess.dateien} Dateien, Messlatte ${latte.grenzeKb} KB.`
    + (offenKb > 0 ? ` NOCH ${offenKb} KB ueber dem Ziel von ${ZIEL_KB} KB.` : ` Ziel von ${ZIEL_KB} KB erreicht.`));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
