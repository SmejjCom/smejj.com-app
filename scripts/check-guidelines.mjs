#!/usr/bin/env node
// smejj.com — automatisierte Guideline-Pruefung (AI_Guidelines.md):
// 1) Keine Quellcode-Datei ueber 800 Zeilen.
// 2) Naming-Regel: Plattform heisst ausschliesslich "smejj.com" (niemals SMEJJ/Smejj-Varianten).
// Fail-closed: jeder Verstoss beendet den Lauf mit Exit-Code 1.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 800;
// Ratchet-Baseline fuer Altlasten (Stand 2026-07-02). Diese Dateien existierten vor der
// 800-Zeilen-Regel und duerfen NICHT weiter wachsen. Aufteilung ist eingeplant:
// - public/app.js + public/styles.css erst nach schriftlicher Design-Lock-Freigabe
//   (docs/frontend/START_DESIGN_LOCK.md), da Browserpruefung der Startseite Pflicht ist.
// - src/worker.js beim naechsten Backend-Refactoring.
// app.js-Baseline 1387 -> 1401 am 2026-07-03: Deep-Link-Restore + Canonical-Fix,
// schriftlich freigegeben ("Ja, aber nur lokal (Recommended)"); Datei darf ab
// diesem Stand wieder NICHT weiter wachsen.
const LEGACY_BASELINE = new Map([
  ["public/app.js", 1401],
  // styles.css-Baseline 1552 -> 1565 am 2026-07-04: .visually-hidden fuer das
  // H1 der Startseite (Freigabe "Ja, Option A + Labels"); ab hier wieder eingefroren.
  ["public/styles.css", 1565],
  ["src/worker.js", 930]
]);
// Praezise Verstoesse: Markenwort in Grossschreibung (das SMEJJ_-Env-Praefix mit
// Unterstrich ist erlaubt) sowie grossgeschriebene Varianten ohne ".com"-Suffix.
const NAMING_VIOLATION = /\bSMEJJ\b(?!_)|\bSmejj\b(?!\.com)/;
const CHECK_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".md", ".json", ".html", ".css"]);
// backups/ enthaelt eingefrorene 1:1-Kopien (start lock v3) — kein aktiver Quellcode.
const IGNORED_PATHS = [/^node_modules\//, /^\.pnpm-store\//, /^tests\/fixtures\//, /^pnpm-lock/, /^backups\//];

const failures = [];
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => CHECK_EXTENSIONS.has(file.slice(file.lastIndexOf("."))))
  .filter((file) => !IGNORED_PATHS.some((pattern) => pattern.test(file)));

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // Datei im Index, aber lokal nicht lesbar (z. B. Cloud-only) — kein Verstoss.
  }
  const lines = text.split("\n");
  const lineCount = text.endsWith("\n") ? lines.length - 1 : lines.length;
  const limit = LEGACY_BASELINE.get(file) ?? MAX_LINES;
  if (lineCount > limit && !file.endsWith(".json")) {
    const label = LEGACY_BASELINE.has(file) ? `Ratchet-Baseline ${limit}` : `Limit ${limit}`;
    failures.push(`${file}: ${lineCount} Zeilen (${label}) — sofort modular aufteilen.`);
  }
  lines.forEach((line, index) => {
    if (NAMING_VIOLATION.test(line) && !line.includes("Niemals") && !line.includes("niemals") && !line.includes("NAMING_VIOLATION")) {
      failures.push(`${file}:${index + 1}: Naming-Verstoss — Plattform heisst ausschliesslich "smejj.com".`);
    }
  });
}

if (failures.length > 0) {
  console.error(`check:guidelines FAILED (${failures.length} Verstoesse):`);
  for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check:guidelines OK — ${files.length} Dateien geprueft (max ${MAX_LINES} Zeilen, Naming-Regel smejj.com).`);
