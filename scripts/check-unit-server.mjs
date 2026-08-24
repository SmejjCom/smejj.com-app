#!/usr/bin/env node
// smejj.com — Test-Wächter (Nr. 61): führt ALLE Unit-Tests unter
// control-server/src aus und fällt ROT, sobald einer scheitert.
//
// ANLASS 2026-08-24: modelRouter.test.js stand vom 18. bis 24.08. rot, ohne
// dass irgendein Pflicht-Check ihn ausführte — test:unit existierte, hing
// aber nicht in check:all. Dazu eine Glob-Falle: "src/**/*.test.js" findet
// über die sh von npm nur Tiefe 2 (** wirkt dort wie *); eine tiefer
// liegende Testdatei liefe STILL nie. Deshalb sucht dieser Wächter die
// Dateien selbst (rekursiv per fs) und übergibt sie node --test als
// ausdrückliche Liste.
//
// Wächter-TÜV (Pflicht für jeden Wächter): vor der echten Messung eine
// kaputte UND eine gesunde Probe — wer Rot nicht erkennt, darf nichts prüfen.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTWURZEL = path.join(WURZEL, "control-server", "src");

// Untergrenze gegen stilles Schrumpfen: Stand 2026-08-24 sind es 64 Dateien.
// Findet der Wächter deutlich weniger, prüft er nicht mehr alles — das ist
// ein Fehler des Wächters, kein grünes Ergebnis. Bei bewusstem Umbau
// (Dateien zusammengelegt/verschoben) die Zahl hier mit anpassen.
const MINDEST_DATEIEN = 60;

function testDateien(ordner) {
  const funde = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) funde.push(...testDateien(voll));
    else if (eintrag.name.endsWith(".test.js")) funde.push(voll);
  }
  return funde.sort();
}

// --- Wächter-TÜV: kaputte und gesunde Probe -------------------------------
const tuevOrdner = fs.mkdtempSync(path.join(os.tmpdir(), "smejj-test-waechter-"));
try {
  const gesund = path.join(tuevOrdner, "gesund.test.js");
  const kaputt = path.join(tuevOrdner, "kaputt.test.js");
  fs.writeFileSync(gesund, 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("gesunde Probe", () => assert.equal(1, 1));\n');
  fs.writeFileSync(kaputt, 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("kaputte Probe", () => assert.equal(1, 2));\n');
  const probeGesund = spawnSync(process.execPath, ["--test", gesund], { stdio: "ignore" });
  const probeKaputt = spawnSync(process.execPath, ["--test", kaputt], { stdio: "ignore" });
  if (probeGesund.status !== 0) {
    console.error("Test-Wächter TÜV: die GESUNDE Probe fiel durch — der Prüfweg selbst ist kaputt.");
    process.exit(1);
  }
  if (probeKaputt.status === 0) {
    console.error("Test-Wächter TÜV: die KAPUTTE Probe blieb grün — Rot würde nie auffallen.");
    process.exit(1);
  }
} finally {
  fs.rmSync(tuevOrdner, { recursive: true, force: true });
}

// --- echte Messung ---------------------------------------------------------
const dateien = testDateien(TESTWURZEL);
if (dateien.length < MINDEST_DATEIEN) {
  console.error(`Test-Wächter: nur ${dateien.length} Testdateien unter control-server/src gefunden (erwartet mindestens ${MINDEST_DATEIEN}) — der Wächter prüft nicht mehr alles.`);
  process.exit(1);
}

const lauf = spawnSync(process.execPath, ["--test", ...dateien], {
  cwd: WURZEL,
  stdio: ["ignore", "inherit", "inherit"]
});
if (lauf.status !== 0) {
  console.error(`Test-Wächter: ROT — mindestens ein Unit-Test scheitert (${dateien.length} Dateien geprüft).`);
  process.exit(1);
}
console.log(`Test-Wächter: TÜV bestanden, ${dateien.length} Testdateien unter control-server/src — alle grün.`);
