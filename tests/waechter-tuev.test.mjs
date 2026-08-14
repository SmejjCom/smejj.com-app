// smejj.com — WAECHTER-TUEV: der Pruefer fuer die Pruefer.
//
// WARUM ES DAS GIBT (2026-08-14). An einem einzigen Tag haben sich drei
// Messgeraete dieses Projekts selbst belogen:
//   1. Das Werkstatt-Tor verglich gegen einen 95 Commits alten Branch und
//      meldete deshalb JEDE Nacht "zu" — der Nachtbau hat nie gebaut.
//   2. Der Backlog-Sammler machte aus einem frischen Deploy 30 Phantom-Aufgaben.
//   3. Der Bug-Predictor meldete 2310 Befunde und fand dabei vor allem
//      SICH SELBST — seine eigenen Suchmuster und Testfixtures.
// Keiner dieser Fehler war ein Absturz. Alle drei sahen aus wie Arbeit.
//
// Ein Waechter kann auf ZWEI Arten kaputt sein, und beide sind hier gedeckt:
//   BLIND  — er schweigt, obwohl etwas kaputt ist  (der gefaehrlichere Fall:
//            er erzeugt Vertrauen, das nicht gedeckt ist)
//   LAUT   — er schlaegt an, obwohl alles in Ordnung ist (er erzeugt Arbeit,
//            die es nicht gibt, und wird deshalb bald ignoriert)
//
// Deshalb bekommt jeder Waechter hier ZWEI Proben: einen absichtlich kaputten
// Fall, bei dem er anschlagen MUSS, und einen gesunden, bei dem er schweigen
// MUSS. Gemessen wird der Prozess-Exitcode — also genau das, worauf sich die
// Tor-Pruefung und der Nachtbau verlassen.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Baut ein Wegwerf-Repo, in dem ein Waechter isoliert laufen kann.
 * `git init` ist noetig, weil manche Pruefer ihre Dateiliste ueber
 * `git ls-files` holen — ohne Repo saehen sie NICHTS und waeren faelschlich
 * gruen (genau die Sorte Blindheit, die dieser TUEV sucht).
 */
function baueProbeRepo(dateien) {
  const wurzel = mkdtempSync(path.join(os.tmpdir(), "waechter-tuev-"));
  for (const [relativerPfad, inhalt] of Object.entries(dateien)) {
    const ziel = path.join(wurzel, relativerPfad);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, inhalt);
  }
  spawnSync("git", ["init", "-q"], { cwd: wurzel });
  spawnSync("git", ["add", "-A"], { cwd: wurzel });
  return wurzel;
}

/** Kopiert die Skripte, die der Waechter zum Laufen braucht. */
function legeSkripteBei(wurzel, skripte) {
  for (const rel of skripte) {
    const ziel = path.join(wurzel, rel);
    mkdirSync(path.dirname(ziel), { recursive: true });
    cpSync(path.join(REPO, rel), ziel);
  }
}

/** Fuehrt einen Waechter im Probe-Repo aus und gibt Exitcode + Ausgabe zurueck. */
function laufeWaechter(wurzel, skript, argumente = []) {
  const ergebnis = spawnSync("node", [skript, ...argumente], {
    cwd: wurzel, encoding: "utf8", timeout: 120_000
  });
  return { code: ergebnis.status, ausgabe: `${ergebnis.stdout || ""}${ergebnis.stderr || ""}` };
}

const langeDatei = (zeilen) => Array.from({ length: zeilen }, (_, i) => `const zeile${i} = ${i};`).join("\n");

test("check-guidelines schlaegt bei einer zu langen Datei an", () => {
  const wurzel = baueProbeRepo({ "public/zu-lang.js": langeDatei(900) });
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    assert.notEqual(code, 0, "900 Zeilen muessen auffallen — sonst ist der Waechter blind");
    assert.match(ausgabe, /zu-lang\.js/, "die schuldige Datei muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-guidelines schweigt bei gesundem Code", () => {
  const wurzel = baueProbeRepo({ "public/kurz.js": langeDatei(50) });
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    assert.equal(code, 0, `50 Zeilen duerfen nicht anschlagen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-guidelines ist ohne git nicht faelschlich gruen", () => {
  // Ohne Repo liefert `git ls-files` nichts. Ein Waechter, der daraus "alles
  // in Ordnung" macht, ist die gefaehrlichste Bauart: er meldet Gruen, weil er
  // NICHTS gesehen hat. Erwartet wird also entweder ein Fehler oder wenigstens
  // eine Ausgabe, die die geprueften Dateien beziffert.
  const wurzel = mkdtempSync(path.join(os.tmpdir(), "waechter-tuev-ohnegit-"));
  mkdirSync(path.join(wurzel, "public"), { recursive: true });
  writeFileSync(path.join(wurzel, "public/zu-lang.js"), langeDatei(900));
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    const stillGruen = code === 0 && /0 Dateien/.test(ausgabe);
    assert.equal(stillGruen, false,
      `Ohne git darf nicht "0 Dateien geprueft" + Exit 0 herauskommen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-precache-imports schlaegt bei einem Modul ohne Precache-Eintrag an", () => {
  const wurzel = baueProbeRepo({
    // Zeilenweise, wie im echten sw.js: der Pruefer liest das Array mit einem
    // zeilenbasierten Muster. Einzeilig faende er NICHTS und waere still.
    "public/sw.js": 'const SHELL = [\n  "/assets/vorhanden.js",\n];',
    "public/index.html": '<script type="module" src="/assets/fehlt.js"></script>',
    "public/vorhanden.js": "export const a = 1;",
    "public/fehlt.js": "export const b = 2;"
  });
  legeSkripteBei(wurzel, ["scripts/check-precache-imports.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-precache-imports.mjs");
    assert.notEqual(code, 0, "ein nicht vorgeladenes Modul macht die App offline tot — muss auffallen");
    assert.match(ausgabe, /fehlt\.js/, "die Luecke muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-precache-imports schweigt, wenn alles vorgeladen ist", () => {
  const wurzel = baueProbeRepo({
    "public/sw.js": 'const SHELL = [\n  "/assets/vorhanden.js",\n];',
    "public/index.html": '<script type="module" src="/assets/vorhanden.js"></script>',
    "public/vorhanden.js": "export const a = 1;"
  });
  legeSkripteBei(wurzel, ["scripts/check-precache-imports.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-precache-imports.mjs");
    assert.equal(code, 0, `vollstaendiger Precache darf nicht anschlagen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});
