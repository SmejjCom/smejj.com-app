#!/usr/bin/env node
// smejj.com — 100%-Schutz der Modell-Liste (modell-menue lock v1).
//
// Betreiber-Auftrag 2026-08-23 im Wortlaut:
//   "Genau diese Liste ich will haben und musst du sichern soll nicht
//    geaendert werden nicht kaputt gemacht werden ohne meine schriftliche
//    Bestaetigung."
//
// WAS "DIESE LISTE" IST — live gemessen am 2026-08-23 im Chrome des
// Betreibers, angemeldet, an https://smejj.com:
//
//   Start-Picker -> "Coding-Agent (Cline) >"  (public/cline-model-menu.js)
//     Auto (aktiv), Gruppe "Cline Pass" mit 12 Modellen, Gruppe "Empfohlen"
//     mit 3, zuletzt "Alle Modelle & Key -> Einstellungen".
//
//   Code-Flaeche -> Modellknopf              (public/code-modell-menue.js)
//     Auto (aktiv), smejj 1.0, dann 14 Modelle von Opus 5 bis Mimo V2.5.
//
// WARUM EIN EIGENES MANIFEST und nicht der Start-Lock: derselbe Grund wie
// beim Einwilligungs-Lock. Der Start-Lock wird bei jedem sw.js-Versionssprung
// neu eingefroren, oft mehrmals taeglich. Laege die Modell-Liste dort, wuerde
// jeder dieser Spruenge stillschweigend auch eine Aenderung an der Liste
// absegnen — der Schutz waere ein Selbstlaeufer.
//
// WARUM DIE SERVERSEITE MITGESPERRT IST — das ist der eigentliche Punkt:
// Die lange Liste steht NICHT im Frontend. Sie wird bei jedem Oeffnen frisch
// von GET /api/providers/cline/models geholt. Ein Schutz, der nur die zwei
// Menue-Dateien einfriert, laesst die Liste weiter jederzeit verschwinden:
// bleibt die Antwort leer, baut das Menue stillschweigend eine kurze Liste
// (code-modell-menue.js faengt den Fehler ab und zeigt dann nur das
// Hausmodell). Genau diese Sorte Ausfall hat der Betreiber am 2026-08-23
// gemeldet. Darum stehen der Katalog-Holer und seine Route mit in der Liste.
//
// WAS DIESE SPERRE NICHT KANN: sie schuetzt unseren Code, nicht den fremden
// Katalog. Wirft Cline selbst ein Modell raus, verschwindet es aus der Liste,
// ohne dass hier eine Datei anders wird. Dagegen misst der Waechter
// tests/modellmenue-lock.test.mjs die STRUKTUR (Auto oben, Gruppen, der
// Katalog-Nachbau) — und scripts/diagnose/funktionen-live.mjs den Endpunkt.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung des Betreibers einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-modell-menue-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // --- Die beiden Menues, die die Liste bauen -----------------------------
  // Untermenue im Start-Picker: Auto oben, Gruppen Cline Pass/Empfohlen,
  // darunter der volle Katalog. Das ist die Liste aus der Betreiber-Meldung.
  "public/cline-model-menu.js",
  // Menue der Code-Flaeche: Auto, smejj 1.0, die 14 Wunschmodelle und danach
  // der Rest des Katalogs.
  "public/code-modell-menue.js",
  // --- Die ausgelieferten Kopien ------------------------------------------
  // Die App laedt aus /assets/. Eine Sperre nur auf der Quelle waere blind:
  // live zaehlt, was hier steht (siehe Memory "Artefakt ersetzt NIE die
  // Quelle" — die Falle geht in beide Richtungen).
  "public/assets/cline-model-menu.js",
  "public/assets/code-modell-menue.js",
  // --- Die Quelle der langen Liste ----------------------------------------
  // Holt den Katalog bei Cline, haelt einen Vorrat und liefert ihn auch dann
  // noch (stale), wenn der Anbieter gerade nicht antwortet. Faellt dieser
  // Vorrat weg, ist die lange Liste beim naechsten Aussetzer leer.
  "control-server/src/providers/clineClient.js",
  // Der Endpunkt GET /api/providers/cline/models. Ohne ihn zeigt jedes der
  // beiden Menues nur noch seinen kurzen Rest — ohne eine einzige
  // Fehlermeldung.
  "control-server/src/routes/providerRoutes.js"
];

export const MODELL_MENUE_LOCK = {
  name: "modell-menue-lock",
  manifestPath: "docs/approvals/modell-menue-lock-manifest.json",
  backupRoot: "backups/modell-menue-lock",
  skriptPfad: "scripts/check-modell-menue-lock.mjs",
  lockLabel: "smejj modell-menue lock v1 (100% Schutz)",
  rule: "Keine Aenderung an der Modell-Liste (die beiden Menues, ihre ausgelieferten Kopien, der Katalog-Holer und seine Route) ohne ausdrueckliche schriftliche Bestaetigung des Betreibers.",
  betreff: "die Modell-Liste ist 100% geschuetzt",
  sammelname: "Modell-Listen-Dateien",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(MODELL_MENUE_LOCK);
