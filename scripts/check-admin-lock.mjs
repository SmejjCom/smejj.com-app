#!/usr/bin/env node
// smejj.com — 100%-Schutz der Adminbereich-Sicherheitskette (admin lock v1).
//
// Freigabe des Betreibers vom 2026-08-06:
//   "Nach Abschluss aktiviere einen Change-Lock: Ohne meine ausdrueckliche
//    schriftliche Freigabe duerfen keine Aenderungen mehr vorgenommen werden."
//
// Warum ein EIGENES Manifest (dritte Sperre) und keine Erweiterung der beiden
// bestehenden: Start-Lock und Security-Lock schuetzen `public/` — die Startseite
// und die Anmeldung. Der Adminbereich liegt komplett im Control-Server und wird
// in einem ANDEREN Takt veraendert (eigene Release-Artefakte, eigene Freigaben).
// Laegen beide Welten im selben Manifest, wuerde jedes Einfrieren der einen Welt
// die andere still mit absegnen. Genau diese Begruendung steht schon in
// scripts/lib/datei-sperre.mjs — sie gilt hier ein drittes Mal.
//
// Was geschuetzt wird und warum genau das:
//   - stepUp.js: der frische Besitznachweis vor jeder aendernden Aktion. Wer
//     hier das Zeitfenster aufdreht, hebt den Schutz auf, ohne dass es auffaellt.
//   - adminSurfaceRoutes.js: die Vortuer (Rate-Limit pro IP) UND die Reihenfolge,
//     in der die Adminrouten greifen. Eine vertauschte Zeile oeffnet eine Route.
//   - adminWriteRoutes.js / adminStage4Routes.js: jede schreibende Aktion,
//     inklusive Vier-Augen-Pflicht und Step-up-Gate.
//   - adminAuth.js / adminRoles.js: wer ueberhaupt hereinkommt und was er darf.
//   - auditLog.js: der Nachweis. Ohne ihn ist jede Aktion spurlos.
//   - approvalStore.js: das Vier-Augen-Prinzip selbst.
//   - impersonation.js: fremde Konten uebernehmen — der heikelste Weg im System.
//   - adminUiRoutes.js: die feste Dateiliste der Konsole (kein Pfad-Ausbruch).
//   - rateLimiter.js: die Mechanik hinter allen Drosseln.
//   - admin-ui/api.js: der zentrale Step-up-Umweg der Oberflaeche. Wer ihn
//     entfernt, laesst die Konsole an jeder Bestaetigung vorbeilaufen.
//
// Keine dieser Dateien steht unter Start- oder Security-Lock (die schuetzen
// public/) — zwei Sperren auf derselben Datei waeren zwei Wahrheiten.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-admin-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // Der frische Besitznachweis.
  "control-server/src/admin/stepUp.js",
  // Der starke Weg dorthin: die WebAuthn-Zeremonie. Wer hier den Challenge-Typ
  // oder die Kontobindung aufweicht, laesst fremde Passkeys das Schreibfenster
  // oeffnen — von aussen nicht zu sehen.
  "control-server/src/admin/stepUpPasskey.js",
  // Die Sicherheitswache: sie entscheidet, ab wann ein Muster gemeldet wird.
  // Wer die Schwelle hochdreht, macht einen Angriff wieder unsichtbar.
  "control-server/src/admin/sicherheitsAlarm.js",
  // Vortuer und Routen-Reihenfolge.
  "control-server/src/routes/adminSurfaceRoutes.js",
  // Schreibende Aktionen.
  "control-server/src/routes/adminWriteRoutes.js",
  "control-server/src/routes/adminStage4Routes.js",
  // Autopiloten-Wartung (Stufe 2b, Freigabe 2026-08-08): Stummschalten ist
  // das perfekte Werkzeug, um einen Einbruch unsichtbar zu machen — wer die
  // Ampel stummschalten kann, kann jeden Alarm abstellen. Deshalb steht diese
  // Route unter demselben Schutz wie die Kontoaktionen.
  "control-server/src/routes/adminAutopilotAktionen.js",
  // Wer hereinkommt und was er darf.
  "control-server/src/admin/adminAuth.js",
  "control-server/src/admin/adminRoles.js",
  // Nachweis und Vier-Augen.
  "control-server/src/admin/auditLog.js",
  "control-server/src/admin/approvalStore.js",
  // Fremde Konten uebernehmen.
  "control-server/src/admin/impersonation.js",
  // Auslieferung der Konsole (feste Dateiliste).
  "control-server/src/routes/adminUiRoutes.js",
  // Mechanik hinter allen Drosseln.
  "control-server/src/http/rateLimiter.js",
  // Der zentrale Step-up-Umweg der Oberflaeche.
  "control-server/admin-ui/api.js",
  // Der Tuersteher der Konsole. Aufgenommen am 2026-08-14: bis dahin war
  // smejj.com/admin fuer JEDEN sichtbar, weil die statische Auslieferung ueber
  // GitHub Pages laeuft und dort niemand pruefen kann. Diese Datei IST die
  // Pruefung auf diesem Weg — faellt sie weg oder wird sie entschaerft, steht
  // der Adminbereich wieder offen, und zwar wieder ohne Fehlermeldung.
  // Der Spiegel public/admin/gate.js steht bewusst NICHT unter einer Sperre:
  // tests/adminbereich-anmeldepflicht.test.mjs erzwingt bereits, dass er
  // byte-gleich zu dieser Quelle ist. Zwei Sperren waeren zwei Wahrheiten.
  "control-server/admin-ui/gate.js",
  // Die Autopiloten-Seite (Modul AP). Aufgenommen am 2026-08-23 auf Anordnung
  // des Betreibers ("100 % Schutz aktivieren"), nachdem vier Widersprueche
  // der Live-Seite behoben waren: Grau mit Meldepflicht ist ein Befund
  // (Register "Braucht dich"), Nummer 40 war doppelt, die Akten 01/02/05
  // nannten einen Zeabur-Dienst, den es nicht gibt, Vorfaelle tragen den
  // aktuellen Namen. Registry (Namen, Nummern, Anleitungen), Ampel-Logik und
  // Ansicht gehoeren zusammen eingefroren — eine Aenderung an nur einer
  // Stelle erzeugt genau die Widersprueche, die hier behoben wurden.
  "control-server/src/admin/opsAutopiloten.js",
  "control-server/src/admin/opsAutopilotenListe.js",
  "control-server/src/admin/opsAutopilotenListeEvolution.js",
  "control-server/admin-ui/views-stage9.js"
];

export const ADMIN_LOCK = {
  name: "admin-lock",
  manifestPath: "docs/security/admin-lock-manifest.json",
  backupRoot: "backups/admin-lock",
  skriptPfad: "scripts/check-admin-lock.mjs",
  lockLabel: "smejj admin lock v1 (100% Schutz)",
  rule: "Keine Aenderung an Adminzugang, Step-up, Vortuer, schreibenden Adminaktionen, Vier-Augen-Prinzip, Audit-Nachweis oder Impersonation ohne ausdrueckliche schriftliche Freigabe des Betreibers.",
  betreff: "die Adminbereich-Sicherheitskette ist 100% geschuetzt",
  sammelname: "Adminbereich-Sicherheitsdateien",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(ADMIN_LOCK);
