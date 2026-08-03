# Memory_Bank — Volltext: Training-Loop-Dienst LIVE (job_smejj_training_loop_20260728)

Aus Memory_Bank.md ausgelagert am 2026-08-03, damit die 800-Zeilen-Regel
eingehalten bleibt. Inhalt unveraendert uebernommen.

- ERLEDIGT: fuenfter Zeabur-Dienst `smejj-training-loop` auf dem BESTEHENDEN
  6-$-Server. Keine neue Kostenposition, kein neuer Anbieter. Zugang ueber die
  Zeabur-GitHub-App; den GitHub-Sicherheitscode gab der Betreiber selbst ein —
  Anmeldecodes gibt der Agent nie ein.
- VIER FALLEN, am Live-Protokoll gemessen: (1) ohne Konfiguration startet Zeabur
  `pnpm start` = CONTROL SERVER statt Worker; (2) zbpack `install_command`
  ueberschreiben verhindert den Quellcode-Kopiervorgang; (3) `pnpm build:i18n`
  bricht mit MODULE_NOT_FOUND ab; (4) WURZEL: `.dockerignore` schloss `scripts`
  komplett und `workers/*` per Erlaubnisliste aus — neue Worker dort EINTRAGEN,
  `scripts` -> `scripts/*`, damit Ausnahmen greifen.
- LOESUNG: `Dockerfile.<dienstname>` im Repo-Wurzelverzeichnis — gilt gezielt fuer
  diesen einen Dienst. NON-REGRESSION: maus-engine, chat-bridge, voice-piper
  unveraendert "Running 1/1"; `smejj-remote-browser` Image Pull Failed, vorbestehend.
- SEIT 2026-07-29 SCHARF UND MESSEND. /health: loopEnabled=true, state=running.
  Autonomer Lauf im Protokoll: 07:30:27 "listening (loopEnabled=true)" ->
  07:32:24 "eval cycle done: blocked" + "Punktzahl 85.3 % (Budget 80 %) |
  12 bestanden, 2 nicht bestanden". GENAU EIN Lauf, keine Doppellaeufe. 6-h-Takt.
- FALLE: Zeaburs "Restart" laedt die Umgebung NICHT neu (gleicher Container, alte
  Variablen). Nur ein echter Neubau per Commit-Webhook zieht neue Variablen.
- URTEIL "blocked" IST KORREKT: nur durch criticalFailures > 0 (evalReport.js:38).
  Vollauf 91,2 %, 13/14 Faelle 100 %, p95 1022 ms; einziger Ausfall
  code-esm-failclosed von der Schnellspur. Suite bewusst NICHT gelockert.
- OHNE IDRIVE nuetzlich: Kennzahlen ins Protokoll; Zugangsdaten traegt der
  Betreiber selbst ein ("smejj.com Zeabur-Schluessel.command").
