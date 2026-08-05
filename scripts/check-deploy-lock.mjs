#!/usr/bin/env node
// smejj.com — 100%-Schutz der Spiegel-Skripte (deploy lock v1).
//
// Freigabe des Betreibers vom 2026-08-05:
//   "Freigabe Deploy-Skript-Sperre, 2026-08-05: Lege eine eigene, dritte
//    Dateisperre fuer scripts/deploy/codeberg_spiegel_sync.sh und
//    scripts/deploy/codeberg_spiegel_geplant.sh an, mit eigenem Manifest, ohne
//    Aenderung am Start-Lock oder am Security-Lock. Nimm sie in check:all auf."
//
// Warum ein DRITTES Manifest und nicht eine der beiden Listen erweitern:
// dieselbe Begruendung wie bei der zweiten Sperre (siehe
// scripts/check-security-lock.mjs). Der Start-Lock wird bei jedem
// sw.js-Versionssprung neu eingefroren, oft mehrmals an einem Tag. Laegen die
// Spiegel-Skripte dort, wuerde jeder dieser Sprünge stillschweigend auch eine
// Aenderung am Spiegelweg mit absegnen — der Schutz waere ein Selbstlaeufer.
// Die Mechanik ist dieselbe (scripts/lib/datei-sperre.mjs), nur der Schluessel
// zum Aufsperren ist ein anderer.
//
// WAS HIER GESCHUETZT WIRD UND WARUM GENAU DAS:
//   - codeberg_spiegel_sync.sh: entscheidet, WAS gespiegelt wird. Am 2026-08-05
//     stand hier `git push --all`, also die LOKALEN Branch-Spitzen. In einer
//     Arbeitskopie mit parallelen Sessions sind das beliebige Zwischenstaende;
//     ein veraltetes lokales `main` haette einen korrekten Spiegel
//     ueberschrieben. Jetzt ist origin die Quelle der Wahrheit. Ein stiller
//     Rueckbau dieser Zeile faellt niemandem auf — der Lauf meldet weiterhin
//     Erfolg, nur spiegelt er das Falsche.
//   - codeberg_spiegel_geplant.sh: das Tor der naechtlichen Automatik. Es
//     entscheidet, ob ueberhaupt gespiegelt wird. Zwei Fassungen dieser Datei
//     haben bereits stillschweigend gar nichts getan: einmal, weil sie hart auf
//     Port 22 pruefte, waehrend der Weg auf HTTPS umgestellt war; einmal, weil
//     ein `--depth 1`-Klon ein Fast-Forward nie belegen kann. Beide Male stand
//     im Protokoll etwas, das nach Erfolg aussah.
//
// Der gemeinsame Nenner: bei diesen beiden Dateien ist ein Defekt UNSICHTBAR.
// Eine kaputte Startseite sieht man, einen Spiegel, der ins Leere laeuft, nicht
// — bis man ihn braucht. Genau deshalb gehoeren sie unter eine Sperre.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-deploy-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // Was gespiegelt wird (Quelle der Wahrheit, Protokollwahl, Fehlerbehandlung).
  "scripts/deploy/codeberg_spiegel_sync.sh",
  // Ob ueberhaupt gespiegelt wird (Tor der naechtlichen Automatik).
  "scripts/deploy/codeberg_spiegel_geplant.sh"
];

export const DEPLOY_LOCK = {
  name: "deploy-lock",
  manifestPath: "docs/deploy/deploy-lock-manifest.json",
  backupRoot: "backups/deploy-lock",
  skriptPfad: "scripts/check-deploy-lock.mjs",
  lockLabel: "smejj deploy lock v1 (100% Schutz)",
  rule: "Keine Aenderung am Spiegelweg (was gespiegelt wird, ob gespiegelt wird) ohne ausdrueckliche schriftliche Bestaetigung des Nutzers.",
  betreff: "die Spiegel-Skripte sind 100% geschuetzt",
  sammelname: "Spiegel-Skripte",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(DEPLOY_LOCK);
