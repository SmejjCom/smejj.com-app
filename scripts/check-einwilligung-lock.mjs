#!/usr/bin/env node
// smejj.com — 100%-Schutz der Einwilligungs- und Erfassungskette (einwilligung lock v1).
//
// Freigabe des Betreibers vom 2026-08-05:
//   "Nach Abschluss aktiviere einen Change-Lock: Ohne meine ausdrueckliche
//    schriftliche Freigabe duerfen keine Aenderungen mehr vorgenommen werden."
//
// WARUM EIN VIERTES MANIFEST und nicht eine der bestehenden Listen erweitern:
// dieselbe Begruendung wie bei der zweiten und dritten Sperre. Der Start-Lock
// wird bei jedem sw.js-Versionssprung neu eingefroren, oft mehrmals taeglich.
// Laege die Einwilligungskette dort, wuerde jeder dieser Spruenge stillschweigend
// auch eine Aenderung am Datenschutz mit absegnen — der Schutz waere ein
// Selbstlaeufer. Die Mechanik ist dieselbe (scripts/lib/datei-sperre.mjs), nur
// der Schluessel zum Aufsperren ist ein anderer.
//
// WAS HIER GESCHUETZT WIRD UND WARUM GENAU DAS:
// Diese Dateien entscheiden, ob personenbezogene Daten erfasst werden duerfen.
// Ein Defekt darin ist die gefaehrlichste Sorte, weil er in BEIDE Richtungen
// unsichtbar ist:
//
//   - Faellt die Sperre zu weit auf, werden Fragen ohne Deckung erfasst. Das
//     sieht niemand: die Oberflaeche verhaelt sich unveraendert.
//   - Faellt sie zu weit zu, wird nichts erfasst. Auch das sieht niemand —
//     man haelt die Nutzer fuer schweigsam.
//
// Beide Richtungen sind an EINEM Tag tatsaechlich eingetreten (2026-08-05):
//   - Die Einwilligung liess sich gar nicht erteilen (fehlendes `repository`,
//     Route 400). Kein Test hat es bemerkt: alle prueften Felder, keiner den
//     Durchstich.
//   - Die Erfassungsroute war fuer JEDEN unerreichbar (fehlte in
//     controlAccessPolicy, also nie ein `req.authUser`, also immer 401).
//     Ausgerollt, verdrahtet, zwoelf Tests gruen — und unbenutzbar.
//
// Beide waren nicht in der Logik falsch, sondern in der VERDRAHTUNG. Genau
// dagegen schuetzt eine Dateisperre: sie macht jede Aenderung an diesen
// Beruehrungspunkten sichtbar, statt sie in einem Sammel-Commit untergehen zu
// lassen.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-einwilligung-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // OB erfasst werden darf — die vier fail-closed Stufen.
  "src/training/fragenerfassung.js",
  // Die Route, die als einzige erfassen kann, samt Speicher-Beweisfuehrung.
  "control-server/src/routes/trainingCaptureRoutes.js",
  // Was eine Einwilligung ist, wie sie gebunden und aufgeloest wird.
  "src/training/consent.js",
  // Der Endpunkt, der Hash und Geltungsbereich veroeffentlicht — er bestimmt,
  // WOGEGEN eingewilligt wird.
  "control-server/src/routes/trainingConsentRoutes.js",
  // Der Geltungsbereich selbst. Eine Aenderung hier entwertet stillschweigend
  // jede bereits erteilte Einwilligung, weil die Bindung nicht mehr trifft.
  "src/training/constants.js",
  // Ob die Routen ueberhaupt ein authUser bekommen. Der 401-Fehler von oben
  // entstand genau hier.
  "src/shared/controlAccessPolicy.js",
  // Der Text, gegen dessen Hash eingewilligt wird. Aendert er sich, ohne dass
  // der Hash nachgezogen wird, willigen Nutzer gegen etwas ein, das sie nicht
  // gelesen haben.
  "public/datenschutz.html"
];

export const EINWILLIGUNG_LOCK = {
  name: "einwilligung-lock",
  manifestPath: "docs/approvals/einwilligung-lock-manifest.json",
  backupRoot: "backups/einwilligung-lock",
  skriptPfad: "scripts/check-einwilligung-lock.mjs",
  lockLabel: "smejj einwilligung lock v1 (100% Schutz)",
  rule: "Keine Aenderung an der Einwilligungs- und Erfassungskette (ob erfasst werden darf, wogegen eingewilligt wird, wer die Routen erreicht) ohne ausdrueckliche schriftliche Bestaetigung des Betreibers.",
  betreff: "die Einwilligungs- und Erfassungskette ist 100% geschuetzt",
  sammelname: "Einwilligungskette",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(EINWILLIGUNG_LOCK);
