#!/usr/bin/env node
// smejj.com — 100%-Schutz der Startseite (start lock v3).
// Prueft die geschuetzten Startseiten-Dateien byte-genau (SHA-256) gegen das
// eingefrorene Manifest docs/frontend/start-lock-manifest.json.
// JEDE Abweichung beendet den Lauf mit Exit-Code 1 (fail-closed).
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung des Nutzers):
//   1. Schriftliche Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. Manifest neu einfrieren und die Bestaetigung dokumentieren:
//        node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut der Bestaetigung>"
//   4. Backup-Kopie unter backups/start-design-lock/<utc-zeitstempel>/ ablegen.
// Ohne --confirm-Text verweigert --freeze den Dienst.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

const MANIFEST_PATH = "docs/frontend/start-lock-manifest.json";
const BACKUP_ROOT = "backups/start-design-lock";

// Alles, was die Startseite ausmacht: Markup, Styles, Verhalten, Module, Precache.
const PROTECTED_FILES = [
  "public/index.html",
  "public/styles.css",
  "public/branding.css",
  "public/app-surfaces.css",
  "public/composer-tools.css",
  "public/browser-pane.css",
  "public/app.js",
  "public/left-menu-state.js",
  "public/config.js",
  "public/components.js",
  "public/premium-surfaces.js",
  "public/autonomous-coding.js",
  "public/autonomous-coding.css",
  "public/search.js",
  "public/composer-tools.js",
  "public/workspace-bridge.js",
  "public/browser-pane.js",
  "public/browser-pane-render.js",
  "public/panel-backdrop.js",
  "public/panel-backdrop.css",
  "public/cline-model-menu.js",
  "public/cline-model-menu.css",
  "public/auth/passkey-ui.js",
  "public/ai/chatClient.js",
  "public/ai/index.js",
  "public/ai/router.js",
  "public/ai/byok.js",
  "public/ai/providers.js",
  "public/sw.js",
  "public/manifest.webmanifest"
];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function collectHashes() {
  const files = {};
  for (const file of PROTECTED_FILES) {
    if (!existsSync(file)) {
      files[file] = "FEHLT";
      continue;
    }
    files[file] = sha256(file);
  }
  return files;
}

function freeze(confirmText) {
  if (!confirmText || confirmText.trim().length < 10) {
    console.error("start-lock FREEZE VERWEIGERT: --confirm \"<schriftliche Bestaetigung des Nutzers>\" ist Pflicht.");
    process.exit(1);
  }
  const files = collectHashes();
  const missing = Object.entries(files).filter(([, hash]) => hash === "FEHLT");
  if (missing.length > 0) {
    console.error(`start-lock FREEZE VERWEIGERT: geschuetzte Dateien fehlen: ${missing.map(([f]) => f).join(", ")}`);
    process.exit(1);
  }
  const manifest = {
    lock: "smejj start lock v3 (100% Schutz)",
    frozenAt: new Date().toISOString(),
    confirmation: confirmText.trim(),
    rule: "Keine Aenderung an Design, Layout, Text, Icons, Abstaenden, Farben, Funktionen oder Inhalten der Startseite ohne ausdrueckliche schriftliche Bestaetigung des Nutzers.",
    files
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  const backupDir = path.join(BACKUP_ROOT, manifest.frozenAt.replace(/[:.]/g, "-"));
  if (existsSync(backupDir)) {
    console.error(`start-lock FREEZE VERWEIGERT: Backup-Ziel existiert bereits: ${backupDir}`);
    process.exit(1);
  }
  for (const file of PROTECTED_FILES) {
    const target = path.join(backupDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  writeFileSync(path.join(backupDir, "start-lock-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`start-lock eingefroren: ${PROTECTED_FILES.length} Dateien, Manifest ${MANIFEST_PATH}, Backup ${backupDir}/`);
}

function check() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`start-lock FEHLER: Manifest ${MANIFEST_PATH} fehlt. Einfrieren erfordert schriftliche Bestaetigung (--freeze --confirm).`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const current = collectHashes();
  const violations = [];
  for (const [file, frozenHash] of Object.entries(manifest.files)) {
    const actual = current[file] || "FEHLT";
    if (actual !== frozenHash) violations.push(`${file}: ${actual === "FEHLT" ? "GELOESCHT" : "VERAENDERT"}`);
  }
  if (violations.length > 0) {
    console.error(`start-lock VERLETZT (${violations.length}) — Startseite ist 100% geschuetzt (eingefroren ${manifest.frozenAt}):`);
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error("Aenderungen sind NUR mit ausdruecklicher schriftlicher Bestaetigung des Nutzers erlaubt.");
    console.error("Mit vorliegender Bestaetigung: alle Checks gruen bekommen, dann");
    console.error("  node scripts/check-start-lock.mjs --freeze --confirm \"<Wortlaut>\"");
    process.exit(1);
  }
  console.log(`start-lock OK — ${Object.keys(manifest.files).length} Startseiten-Dateien byte-identisch zum eingefrorenen Stand (${manifest.frozenAt}).`);
}

const args = process.argv.slice(2);
if (args.includes("--freeze")) {
  const confirmIndex = args.indexOf("--confirm");
  freeze(confirmIndex >= 0 ? args[confirmIndex + 1] : "");
} else {
  check();
}
