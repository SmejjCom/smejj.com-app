#!/usr/bin/env node
// smejj.com — kann der Control-Server im ABBILD ueberhaupt starten?
//
// DER VORFALL, DER DAZU FUEHRTE (2026-09-04, rund eine Stunde Ausfall):
// Autopilot Nr. 82 importierte `../../../scripts/check-schutz-echtheit.mjs`
// statisch. Im Repo liegt die Datei; ins Docker-Abbild wurde `scripts/` aber
// nie kopiert. Der Server starb beim Start mit
//   ERR_MODULE_NOT_FOUND: Cannot find module '/app/scripts/check-schutz-echtheit.mjs'
// ging in Neustart-Schleifen und wurde von Zeabur auf "suspended" gesetzt.
// api.smejj.com antwortete rund eine Stunde mit 502 — Chat, Anmeldung und
// Speicher tot. Die Seiten liefen weiter (GitHub Pages), deshalb fiel es von
// aussen kaum auf.
//
// Lokal war alles gruen: jeder Test, jeder Lauf, jede Sperre. Der Unterschied
// zwischen Arbeitskopie und Abbild sieht KEIN Test — genau wie beim
// con-Abbild-Waechter, wo dieselbe fehlende COPY-Zeile den Dienst nie starten
// liess. Diese Pruefung schliesst das.
//
// SIE PRUEFT ZWEI DINGE:
//   1. Jeder statische Import im Serverbaum muss auf etwas zeigen, das im
//      Abbild LIEGT. Die erlaubten Orte werden aus den COPY-Zeilen des
//      Dockerfiles gelesen, nicht geraten — sonst prueft sie eine Annahme.
//   2. Autopiloten duerfen ueberhaupt nicht statisch aus `scripts/` importieren,
//      auch wenn eine COPY-Zeile es gerade erlaubt. Ein Waechter darf den
//      Dienst, den er bewacht, niemals mitreissen: dynamisch importieren und
//      weich fallen ("nicht messbar"), statt den Prozess zu beenden.
//
// Aufruf: node scripts/check-server-startsicher.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DOCKERFILE = path.join(WURZEL, "Dockerfile.smejj-control");
const SERVERBAUM = ["control-server/src", "src"];

/** Was das Abbild wirklich enthaelt — aus den COPY-Zeilen gelesen, nicht geraten. */
export function imAbbild(dockerfile = DOCKERFILE) {
  const zeilen = readFileSync(dockerfile, "utf8").split("\n");
  const orte = [];
  for (const z of zeilen) {
    const t = /^COPY\s+(?:--[^\s]+\s+)*(.+?)\s+\.\/?(\S*)\s*$/.exec(z.trim());
    if (!t) continue;
    for (const quelle of t[1].split(/\s+/)) {
      if (quelle.startsWith("--")) continue;
      orte.push(quelle.replace(/^\.\//, ""));
    }
  }
  return orte;
}

/** Liegt dieser Pfad (relativ zur Wurzel) im Abbild? */
export function liegtImAbbild(rel, orte) {
  return orte.some((o) => rel === o || rel.startsWith(o.replace(/\/$/, "") + "/"));
}

function dateien(ordner, treffer = []) {
  if (!existsSync(ordner)) return treffer;
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const voll = path.join(ordner, e.name);
    if (e.isDirectory()) dateien(voll, treffer);
    else if (/\.[cm]?js$/.test(e.name) && !/\.test\.[cm]?js$/.test(e.name)) treffer.push(voll);
  }
  return treffer;
}

/** Statische Importe einer Datei — dynamische `import(...)` bewusst NICHT. */
export function statischeImporte(datei) {
  const text = readFileSync(datei, "utf8");
  const ziele = [];
  const muster = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const t of text.matchAll(muster)) {
    const roh = t[1] || t[2];
    if (roh && roh.startsWith(".")) ziele.push(roh);
  }
  return ziele;
}

export function pruefe() {
  const orte = imAbbild();
  const befunde = [];
  let geprueft = 0;

  for (const wurzel of SERVERBAUM) {
    for (const datei of dateien(path.join(WURZEL, wurzel))) {
      const rel = path.relative(WURZEL, datei);
      for (const ziel of statischeImporte(datei)) {
        geprueft += 1;
        const aufgeloest = path.relative(WURZEL, path.resolve(path.dirname(datei), ziel.split("?")[0]));
        if (aufgeloest.startsWith("..")) {
          befunde.push(`${rel}: importiert ausserhalb des Projekts — ${ziel}`);
          continue;
        }
        if (!liegtImAbbild(aufgeloest, orte)) {
          befunde.push(`${rel}: importiert ${ziel} -> ${aufgeloest}, das NICHT im Abbild liegt. `
            + `Der Server stirbt damit beim Start (ERR_MODULE_NOT_FOUND).`);
          continue;
        }
        // Zweite, strengere Regel nur fuer Autopiloten.
        if (rel.includes("/autopilots/") && aufgeloest.startsWith("scripts/")) {
          befunde.push(`${rel}: importiert STATISCH aus scripts/ (${ziel}). Ein Waechter darf den Dienst, `
            + `den er bewacht, nicht mitreissen — dynamisch importieren und weich fallen.`);
        }
      }
    }
  }
  return { geprueft, befunde, orte };
}

function main() {
  const { geprueft, befunde, orte } = pruefe();
  if (befunde.length) {
    console.error(`server-startsicher VERLETZT (${befunde.length}):`);
    for (const b of befunde) console.error(`  - ${b}`);
    console.error(`\n  Am 2026-09-04 hat genau das den Control-Server rund eine Stunde lahmgelegt:`);
    console.error(`  lokal war alles gruen, im Abbild fehlte die Datei. Kein Test sieht diesen`);
    console.error(`  Unterschied — ausser diesem hier.`);
    process.exit(1);
  }
  console.log(`server-startsicher OK — ${geprueft} statische Importe im Serverbaum zeigen alle auf etwas, `
    + `das im Abbild liegt (${orte.length} COPY-Ziele gelesen).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
