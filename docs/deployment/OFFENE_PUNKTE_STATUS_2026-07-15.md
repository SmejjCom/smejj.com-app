# smejj.com — Ehrlicher Status der offenen Punkte (2026-07-15)

Stand nach den freigegebenen Folgearbeiten (Cline-Go-Live v62, Maus-Engine + kombiniertes Release, Frontend-Token-Fix). Dieses Dokument sagt klar, was **fertig**, was **extern blockiert** und was **bewusst nicht blind ausgeführt** wurde.

## 1. Backend-Repo-Sync (SmejjCom/smejj.com-app) — BLOCKIERT (Nutzer-Aktion nötig)
- Ziel: Arbeitskopie (Quelle der Wahrheit, 686 Dateien) in einem Commit nach GitHub pushen. Der Remote steht seit 12.07. auf Rollback-Commit `fe945cb` und enthält den aktuellen Stand nicht.
- Vorbereitet & bereit: `smejj.com Repo-Sync 2026-07-15.command` (deterministischer Ein-Commit-Sync, verschiebt nur beiseite, löscht nichts). `.gitignore` ergänzt um `/backups/` und `/UPLOAD-ZU-GITHUB/`, damit diese Rollback-/Hilfskopien nicht ins Repo geraten (Rollbacks gehören auf IDrive e2). Sekret-Scan der 686 Dateien gelaufen: nur Platzhalter/Testfixtures (`sk-capsule-...`, `<DEIN_KEY>`), keine echten Secrets.
- **Blocker (nur der Nutzer kann das lösen):** Der in der Git-Config hinterlegte SSH-Schlüssel `~/.ssh/smejjcom_github_ed25519` existiert auf dem Mac NICHT (`No such file or directory`). Ohne diesen Schlüssel kann kein Push authentifizieren. Das Anlegen/Hinterlegen von SSH-Schlüsseln/Zugangsdaten ist ausdrücklich Nutzer-Aufgabe.
- **Nutzer-Schritt:** SSH-Key wiederherstellen/neu erzeugen und bei GitHub als Deploy-/Account-Key hinterlegen (`scripts/github-key-setup.command` existiert dafür). Danach `smejj.com Repo-Sync 2026-07-15.command` doppelklicken — der Rest läuft automatisch inkl. Zusammenfassung im Log `tmp/git-sync-2026-07-15.log`.
- Hinweis: Beim Vorbereiten wurde ein veralteter `main.lock`/`index.lock` beiseitegelegt (`.git/*.lock.alt-*`). Falls Git über `index.lock` klagt: `.git/index.lock` löschen.

## 2. Watchdog-Completion-Persistenz — EINGEGRENZT, Fix bewusst NICHT blind deployt
- Analyse (statisch, read-only): `persistWatchdogLease` und `persistWatchdogCompletion` in `control-server/src/budget/watchdogLeaseStore.js` nutzen den IDENTISCHEN Mechanismus (S3 `If-None-Match: *` + „overwrite proof" mit erwartetem HTTP 412 + Readback-Digest). Da die Lease-Persistenz nachweislich funktioniert (Prod bootet), setzt IDrive e2 die If-None-Match-Bedingung korrekt durch.
- **Korrigierter Verdacht:** Der ursprüngliche „If-None-Match-Verhalten von IDrive e2"-Verdacht ist damit unwahrscheinlich — sonst würde die Lease-Persistenz genauso scheitern. Wahrscheinlicher: die Completion wird gar nicht erst erreicht/aufgerufen, weil der Watchdog-/Worker-Prozess vorher terminiert (Scale-to-zero / exit-after-run) — dieselbe Klasse wie der bestätigte Maus-Engine-exit-after-run-Befund.
- **Warum kein Fix jetzt:** Die endgültige Bestätigung braucht die realen Boot-/Completion-Logs des blockierten Laufs (Laufzeit-Interaktion, nicht statisch reproduzierbar). Ein blinder Fix an diesem boot-kritischen Pfad verstößt gegen die Non-Regression-Pflicht und gehört zuerst auf Staging mit Freigabe.
- **Nächster Schritt (freizugeben):** Beim nächsten blockierten Boot die Container-Logs von `smejj-control` ziehen und nach `watchdog_completion_*` bzw. dem Ausbleiben eines Completion-Aufrufs suchen; danach gezielter Fix (Completion vor Prozess-Exit garantieren) auf Staging, dann Prod.

## 3. Maus-Engine E2E auf V70 — extern/lifecycle-bedingt, bereits 6x belegt
- Root Cause bestätigt: `workers/maus-engine/worker.mjs` Z.17 `EXIT_AFTER_RUN` (Default AN) beendet den Worker nach dem ersten Dispatch → Planer-Roundtrips treffen einen toten Worker (Gateway 503). Für Mehrfachversuche nötig: `SMEJJ_MAUS_EXIT_AFTER_RUN=NO` setzen und Gruppe danach hart stoppen — eine eigene, freizugebende Änderung.
- Die E2E-Nachweise (a)(b)(c)(d)/Stufe-1/Makro-Replay vom 14./15.07. bleiben gültig. Worker-Gruppe gestoppt (keine Fixkosten).

## 4. Externe Baustellen (kein Code-Defekt von smejj.com)
- `cline-pass/*`-Modelle: 403 ENTITLEMENT (Cline-Plan/Guthaben). Aktives Prod-Cline-Modell steht jetzt auf `poolside/laguna-m.1:free` — Chat funktioniert.
- GLM-5.2 (zhipu): `runtimeAvailable:false` (Provider-Ausfall). Kimi K2.7 trägt aktuell. Sobald zhipu wieder liefert, ist GLM-5.2 ohne Änderung zurück (Router modell-agnostisch).

## Schutz-Status
Nichts gelöscht. Keine Prod-Deployments in dieser Phase außer den bereits freigegebenen (V70 kombiniertes Release + Frontend-Fix, beide live verifiziert). Die einzige Working-Copy-Änderung hier ist die additive `.gitignore`-Ergänzung (backups/, UPLOAD-ZU-GITHUB/). Keine Secrets im Chat. Salad-Maus-Worker gestoppt. Start-/Favicon-/Design-Lock unberührt.
