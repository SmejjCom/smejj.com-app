#!/usr/bin/env node
// smejj.com — 100%-Schutz des Impressums (impressum lock v1).
//
// Betreiber-Auftrag 2026-09-25 im Wortlaut:
//   "Nachdem bist du fertig, sollst du 100% Schutz legen, soll Zukunft nicht
//    ohne schriftliche Bestaetigung geaendert werden oder geloescht werden und
//    so weiter, soll 100% geschuetzt werden."
//
// Geschuetzter Stand (v982): nur Firma iMild LLC, Anschrift und E-Mail — KEIN
// Personenname (Betreiber 25.09.2026 ausdruecklich), kein Block nach § 18 MStV.
// tests/impressum-lock.test.mjs misst zusaetzlich den Inhalt.
//
// Eigenes Manifest und nicht der Start-Lock: der Start-Lock wird bei jedem
// sw.js-Versionssprung neu eingefroren. Laege das Impressum dort, wuerde jeder
// Sprung eine Aenderung am Impressum still mit absegnen.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung des Betreibers einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-impressum-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // Das rechtlich verbindliche deutsche Impressum.
  "public/impressum.html",
  // Die ausgelieferte Kopie — live zaehlt auch, was unter /assets/ steht.
  "public/assets/impressum.html",
  // Die englische Hoeflichkeitsuebersetzung.
  "public/en/legal-notice.html"
];

export const IMPRESSUM_LOCK = {
  name: "impressum-lock",
  manifestPath: "docs/approvals/impressum-lock-manifest.json",
  backupRoot: "backups/impressum-lock",
  skriptPfad: "scripts/check-impressum-lock.mjs",
  lockLabel: "smejj impressum lock v1 (100% Schutz)",
  rule: "Keine Aenderung und keine Loeschung am Impressum (deutsch, ausgelieferte Kopie, englisch) ohne ausdrueckliche schriftliche Bestaetigung des Betreibers.",
  betreff: "das Impressum ist 100% geschuetzt",
  sammelname: "Impressum-Dateien",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(IMPRESSUM_LOCK);
