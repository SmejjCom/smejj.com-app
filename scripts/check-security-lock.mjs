#!/usr/bin/env node
// smejj.com — 100%-Schutz der sicherheitskritischen Dateien (security lock v1).
//
// Freigabe des Betreibers vom 2026-08-04:
//   "Change-Lock auf die sicherheitskritischen Dateien ausweiten —
//    Anmeldeseiten, account-sessions.js, chat-history-context.js,
//    chat-bridge.js und fetch-retry.js. Danach byte-genau einfrieren wie die
//    Startseite."
//
// Warum EIGENES Manifest und nicht die Startseiten-Liste erweitern: Der
// Start-Lock wird bei jedem sw.js-Versionssprung neu eingefroren (am
// 2026-08-03/04 mehrfach an einem Tag). Laegen diese Dateien im selben
// Manifest, wuerde jedes dieser Einfrieren auch eine Aenderung an einem
// Passwortfeld oder an der Kontoloeschung still mit absegnen — der Schutz waere
// ein Selbstlaeufer. Die Mechanik ist dieselbe (scripts/lib/datei-sperre.mjs),
// nur der Schluessel zum Aufsperren ist ein anderer.
//
// Was hier geschuetzt wird und warum genau das:
//   - Anmeldeseiten: dort laufen E-Mail, Passwort, OAuth-Rueckkehr und der
//     Passkey-Ablauf. Die CSP steht IM Markup — ein Verlust waere unsichtbar.
//   - account-sessions.js: Passwortwechsel und Kontoloeschung, der einzige
//     unumkehrbare Weg der Oberflaeche.
//   - chat-history-context.js: entscheidet, WAS vom Gespraech den Server
//     erreicht. Ein Fehler hier ist ein Datenschutzfehler, kein Anzeigefehler.
//   - chat-bridge.js: der Dienst, der jede Frage beantwortet, samt Rate-Limit
//     und Origin-Pruefung.
//   - ai/fetch-retry.js: waehlt den Endpunkt. Wer hier den Reserve-Weg
//     verbiegt, schickt Gespraeche an einen anderen Server.
//   - chat-bridge-rechner.js: erzeugt die Zahlen, nach denen jemand eine
//     Finanzierung plant. Eine still veraenderte Formel faellt niemandem auf —
//     die Antwort sieht danach genauso serioes aus wie vorher.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-security-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // Anmeldeseiten (Markup, Verhalten, Stil, Passkey-Client).
  // public/auth/passkey-ui.js fehlt hier bewusst: sie steht bereits unter dem
  // Start-Lock. Zwei Sperren auf derselben Datei waeren zwei Wahrheiten.
  "public/auth/login/index.html",
  "public/auth/register/index.html",
  "public/auth/auth-page.js",
  "public/auth/auth.css",
  "public/auth/passkey.js",
  // Konto: Passwortwechsel, Sitzungen, Loeschung.
  "public/account-sessions.js",
  // Was vom Gespraech den Server erreicht.
  "public/chat-history-context.js",
  // Der antwortende Dienst und die Endpunktwahl.
  "public/chat-bridge.js",
  "public/ai/fetch-retry.js",
  "public/chat-bridge-rechner.js"
];

export const SECURITY_LOCK = {
  name: "security-lock",
  manifestPath: "docs/security/security-lock-manifest.json",
  backupRoot: "backups/security-lock",
  skriptPfad: "scripts/check-security-lock.mjs",
  lockLabel: "smejj security lock v1 (100% Schutz)",
  rule: "Keine Aenderung an Anmeldung, Konto-Sicherheit, Gespraechsuebertragung oder Endpunktwahl ohne ausdrueckliche schriftliche Bestaetigung des Nutzers.",
  betreff: "sicherheitskritische Dateien sind 100% geschuetzt",
  sammelname: "sicherheitskritische Dateien",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(SECURITY_LOCK);
