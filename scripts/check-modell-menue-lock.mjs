#!/usr/bin/env node
// smejj.com — 100%-Schutz der Modell-Liste (modell-menue lock v1).
//
// Betreiber-Auftrag 2026-08-23 im Wortlaut:
//   "Genau diese Liste ich will haben und musst du sichern soll nicht
//    geaendert werden nicht kaputt gemacht werden ohne meine schriftliche
//    Bestaetigung."
//
// NEUE LISTE SEIT 2026-09-10 — Betreiber im Wortlaut:
//   "Cline muss vollstaendig aus der App entfernt werden ... Im Modellbereich
//    duerfen nur noch diese Bereiche existieren: Unsere Modelle (smejj 1.3,
//    1.2, 1.1, zukuenftige smejj-Versionen automatisch ergaenzen) / Auto.
//    Die neueste und staerkste smejj-Version muss immer ganz oben stehen."
//
// Damit ist die alte, hier geschuetzte Liste (Cline Pass, Empfohlen, 14
// Fremdmodelle, "Cline-Key verbinden") vom Betreiber selbst aufgehoben. Der
// Schutz gilt jetzt der neuen Liste:
//
//   Modellknopf in Chat und Code   (public/code-modell-menue.js)
//     Kopf "Unsere Modelle", die smejj-Staffel absteigend, Kopf "Automatisch",
//     darunter "Auto". Sonst nichts.
//
// WARUM EIN EIGENES MANIFEST und nicht der Start-Lock: derselbe Grund wie
// beim Einwilligungs-Lock. Der Start-Lock wird bei jedem sw.js-Versionssprung
// neu eingefroren, oft mehrmals taeglich. Laege die Modell-Liste dort, wuerde
// jeder dieser Spruenge stillschweigend auch eine Aenderung an der Liste
// absegnen — der Schutz waere ein Selbstlaeufer.
//
// DIE SERVERSEITE IST NICHT MEHR TEIL DER LISTE — und das ist der eigentliche
// Gewinn des Umbaus: Die Liste stand frueher NICHT im Frontend, sie kam bei
// jedem Oeffnen frisch von GET /api/providers/cline/models. Blieb die Antwort
// leer, baute das Menue stillschweigend eine kurze Liste — genau der Ausfall,
// den der Betreiber am 23.08. meldete. Ein Schutz konnte das nur beobachten,
// nie verhindern.
//
// Jetzt steht die Liste als Daten in der Menue-Datei (SMEJJ_STAFFEL). Sie
// braucht kein Netz, kann nicht halb ankommen und ist damit wirklich
// schuetzbar. Was sie zeigt, misst zusaetzlich tests/modellmenue-lock.test.mjs
// (Struktur: Kopf, Staffel absteigend, Auto — und KEIN Fremdanbieter).
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung des Betreibers einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-modell-menue-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // --- Das Menue, das die Liste baut --------------------------------------
  // Kopf "Unsere Modelle", SMEJJ_STAFFEL absteigend, Kopf "Automatisch",
  // darunter "Auto". Chat und Code benutzen dasselbe Menue.
  "public/code-modell-menue.js",
  // --- Die ausgelieferte Kopie ---------------------------------------------
  // Die App laedt aus /assets/. Eine Sperre nur auf der Quelle waere blind:
  // live zaehlt, was hier steht (siehe Memory "Artefakt ersetzt NIE die
  // Quelle" — die Falle geht in beide Richtungen).
  "public/assets/code-modell-menue.js"
];

export const MODELL_MENUE_LOCK = {
  name: "modell-menue-lock",
  manifestPath: "docs/approvals/modell-menue-lock-manifest.json",
  backupRoot: "backups/modell-menue-lock",
  skriptPfad: "scripts/check-modell-menue-lock.mjs",
  lockLabel: "smejj modell-menue lock v1 (100% Schutz)",
  rule: "Keine Aenderung an der Modell-Liste (das Menue und seine ausgelieferte Kopie) ohne ausdrueckliche schriftliche Bestaetigung des Betreibers.",
  betreff: "die Modell-Liste ist 100% geschuetzt",
  sammelname: "Modell-Listen-Dateien",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(MODELL_MENUE_LOCK);
