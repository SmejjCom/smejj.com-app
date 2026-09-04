#!/usr/bin/env node
// smejj.com — Syntax-Waechter fuer die ausgelieferten Frontend-Module.
//
// WARUM ES DAS GIBT (Befund 2026-08-25): In code-flaeche.js stand eine
// Import-Zeile MITTEN in einem mehrzeiligen import-Statement — ein
// SyntaxError, der /code auf ALLEN Domains totlegte. Kein einziger Pruefer
// fiel um: check:precache-imports und check:module-queries lesen die Dateien
// mit Textmustern und sind gegen kaputte Syntax blind; die Suite meldete
// "NULL rote Tests", waehrend der Code-Bereich live tot war. Ein Modul, das
// der Browser nicht PARSEN kann, ist die stillste Sorte Ausfall — genau wie
// [[smejj-modul-laedt-nie-kein-test-merkt-es]], nur eine Ebene tiefer.
//
// Was er tut: jede von git verwaltete public/**/*.js-Datei als ES-Modul
// parsen (node --check gegen eine .mjs-Kopie — .mjs zwingt den Modul-Parser,
// egal was package.json sagt). Er FUEHRT NICHTS AUS.
//
// Selbsttest (Waechter-TUEV im Skript, kaputte UND gesunde Probe):
//   node scripts/check-modul-syntax.mjs --selbsttest
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const WURZEL = process.cwd();

function moduleAusGit() {
  const raus = execFileSync("git", ["ls-files", "public/*.js", "public/**/*.js"], {
    cwd: WURZEL, encoding: "utf8"
  });
  // /assets/-Kopien sind erzeugte Zwillinge; kaputt waeren sie nur, wenn die
  // Quelle kaputt ist — und die wird hier geprueft. Doppelt pruefen kostet
  // nur Zeit, findet aber nichts Eigenes.
  // public/vendor/ ist FREMDCODE (pdf.js von Mozilla, Apache-2.0): nicht unsere
  // Schreibweise, teils Dateifragmente (der Worker liegt als part1/part2, weil das
  // Projekt keine Datei ueber 1 MB im Repo erlaubt). Ein Fragment ist per Bauart kein
  // gueltiges Modul — es hier zu parsen meldet einen Fehler, den es nicht gibt.
  return [...new Set(raus.split("\n").filter(Boolean))]
    .filter((p) => !p.startsWith("public/assets/") && !p.startsWith("public/vendor/"));
}

/** Parst EINE Datei als ES-Modul. Rueckgabe: "" bei Erfolg, sonst der Fehler. */
function pruefeDatei(pfad, tmp) {
  const kopie = path.join(tmp, pfad.replace(/[\\/]/g, "__") + ".mjs");
  const inhalt = readFileSync(path.join(WURZEL, pfad), "utf8");
  writeFileSync(kopie, inhalt);
  const lauf = spawnSync(process.execPath, ["--check", kopie], { encoding: "utf8", timeout: 30_000 });
  if (lauf.status === 0) return "";
  return String(lauf.stderr || "Parser-Abbruch ohne Meldung").split("\n").slice(0, 4).join("\n");
}

function selbsttest() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "modul-syntax-tuev-"));
  try {
    const kaputt = path.join(tmp, "kaputt.mjs");
    // Exakt die Fehlerklasse vom 2026-08-25: Import im Import.
    writeFileSync(kaputt, 'import {\nimport { a } from "./b.js";\n  c\n} from "./d.js";\n');
    const rot = spawnSync(process.execPath, ["--check", kaputt], { encoding: "utf8" });
    if (rot.status === 0) { console.error("TUEV FAIL: kaputte Probe nicht erkannt"); return 1; }
    const gesund = path.join(tmp, "gesund.mjs");
    writeFileSync(gesund, 'import { a } from "./b.js";\nexport const x = await Promise.resolve(1);\n');
    const gruen = spawnSync(process.execPath, ["--check", gesund], { encoding: "utf8" });
    if (gruen.status !== 0) { console.error("TUEV FAIL: gesunde Probe faelschlich rot:", gruen.stderr); return 1; }
    console.log("TUEV OK: kaputte Probe erkannt, gesunde Probe (inkl. top-level await) still");
    return 0;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv.includes("--selbsttest")) process.exit(selbsttest());

const dateien = moduleAusGit();
if (dateien.length === 0) {
  // Blind waere gefaehrlicher als laut: ohne git-Dateiliste NICHT gruen melden.
  console.error("check:modul-syntax FEHLER — git ls-files fand 0 Dateien unter public/.");
  process.exit(1);
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "modul-syntax-"));
const fehler = [];
try {
  for (const pfad of dateien) {
    const meldung = pruefeDatei(pfad, tmp);
    if (meldung) fehler.push(`${pfad}:\n  ${meldung.replace(/\n/g, "\n  ")}`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
if (fehler.length) {
  console.error(`check:modul-syntax FEHLER — ${fehler.length} Modul(e) sind fuer den Browser unlesbar:`);
  for (const f of fehler) console.error(f);
  process.exit(1);
}
console.log(`check:modul-syntax OK — ${dateien.length} Module als ES-Module geparst (Arbeitsstand).`);
