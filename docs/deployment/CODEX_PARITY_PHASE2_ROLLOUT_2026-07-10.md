# smejj.com Phase-2-Rollout (2026-07-10)

Status: Phase-2-Fundament produktiv ausgerollt und verifiziert; vollstaendiger
Endnutzer-Repo-E2E bleibt bis zur geschuetzten Job-UI offen.

## Schutz und Rollback

- Start-Lock-Dateien nicht aendern.
- Keine GitHub Actions, kein Cloudflare, keine neuen kostenpflichtigen Dienste.
- Keine Secrets anzeigen, kopieren oder neu eingeben.
- Control-Rollback: unmittelbarer Runtime-Rollback auf Salad Version 32;
  kompletter Phase-2-Rollback auf Version 29 oder durch Entfernen der sechs
  Aktivierungsvariablen. Nicht auf veraltete Versionen 26/28 zurueckrollen.
- Produktives Basisartefakt:
  `deployments/control/kimi-k2-7-runtime-health-2026-07-10-rc3/smejj-control-context.tar.gz`,
  SHA-256
  `2ae20297baaa7ff9b73c2ee02c0d5c6e5a1480605627b01a1e26d6e035b68d7e`.
  Der commit-gepinnte Release-Wrapper verifiziert dieses Artefakt und legt das
  Control-Overlay erst danach in das temporaere Release-Verzeichnis.
- Worker-Rollback: Remote-Browser-Gruppe auf Version 4 (Browser-only)
  zurueckstellen.
- Quell-Rollback: `backups/rollback-2026-07-10-codex-parity-phase2/source-before.tar.gz`.
- Quell-Rollback-SHA-256:
  `b9f9f3054290cad2916a6fc198dea52d31e932265fcaec62dce78ca985a9876e`.

## GitHub-Lieferumfang

Nur Pfade unter `runtime/control-overlay/**` und
`runtime/combined-worker/**` im bestehenden Control-Repo veroeffentlichen.
Dadurch darf der vorhandene GitHub-Actions-Pfadfilter nicht ausloesen.

Zusaetzlich im bestehenden Frontend-Repo nur diese Runtime-Dateien schreiben:

```text
public/chat-bridge.js -> assets/chat-bridge.js
public/auth/passkey.js -> assets/auth/passkey.js
public/auth/passkey-ui.js -> assets/auth/passkey-ui.js
```

`assets/chat-bridge.js` ist lokal Version `20260710-v96` und ergaenzt
pro-Client- sowie globale Missbrauchslimits. Der vorherige Live-Stand v95 bleibt
bis zum nachgewiesenen Recreate unveraendert.

Keine Start-Lock-Datei und keine Design-Datei aendern.

Exakte Quell-zu-Ziel-Abbildung im Control-Repo:

```text
scripts/deploy/bootstrap-control-overlay.mjs -> runtime/bootstrap-control-overlay.mjs
scripts/deploy/bootstrap-control-release.mjs -> runtime/bootstrap-control-release.mjs
scripts/deploy/bootstrap-combined-worker.mjs -> runtime/bootstrap-combined-worker.mjs
public/deploy/idrive-control-bootstrap.mjs -> runtime/bootstrap-idrive-control.mjs
scripts/deploy/control-runtime-package.json -> runtime/control-overlay/package.json
scripts/deploy/check-control-runtime.mjs -> runtime/control-overlay/scripts/deploy/check-control-runtime.mjs
src/server.js -> runtime/control-overlay/src/server.js
src/shared/platform.js -> runtime/control-overlay/src/shared/platform.js
src/shared/modelRegistry.js -> runtime/control-overlay/src/shared/modelRegistry.js
src/shared/controlAccessPolicy.js -> runtime/control-overlay/src/shared/controlAccessPolicy.js
src/shared/modelRatePolicy.js -> runtime/control-overlay/src/shared/modelRatePolicy.js
src/shared/terminalPolicy.js -> runtime/control-overlay/src/shared/terminalPolicy.js
src/jobs/idriveLiteJob.js -> runtime/control-overlay/src/jobs/idriveLiteJob.js
src/jobs/jobApi.js -> runtime/control-overlay/src/jobs/jobApi.js
src/jobs/codingFlowPlan.js -> runtime/control-overlay/src/jobs/codingFlowPlan.js
src/jobs/taskCapsuleWriter.js -> runtime/control-overlay/src/jobs/taskCapsuleWriter.js
control-server/src/auth/workerToken.js -> runtime/control-overlay/control-server/src/auth/workerToken.js
control-server/src/auth/sessionToken.js -> runtime/control-overlay/control-server/src/auth/sessionToken.js
control-server/src/jobs/jobStore.js -> runtime/control-overlay/control-server/src/jobs/jobStore.js
control-server/src/jobs/jobArtifacts.js -> runtime/control-overlay/control-server/src/jobs/jobArtifacts.js
control-server/src/jobs/jobHydration.js -> runtime/control-overlay/control-server/src/jobs/jobHydration.js
control-server/src/llm/aiAvailability.js -> runtime/control-overlay/control-server/src/llm/aiAvailability.js
control-server/src/llm/modelRouter.js -> runtime/control-overlay/control-server/src/llm/modelRouter.js
control-server/src/orchestrator/autonomousRunner.js -> runtime/control-overlay/control-server/src/orchestrator/autonomousRunner.js
control-server/src/orchestrator/jobScheduler.js -> runtime/control-overlay/control-server/src/orchestrator/jobScheduler.js
control-server/src/routes/jobRoutes.js -> runtime/control-overlay/control-server/src/routes/jobRoutes.js
control-server/src/routes/passkeyRoutes.js -> runtime/control-overlay/control-server/src/routes/passkeyRoutes.js
control-server/src/routes/workerModelRoutes.js -> runtime/control-overlay/control-server/src/routes/workerModelRoutes.js
control-server/src/storage/s3Signer.js -> runtime/control-overlay/control-server/src/storage/s3Signer.js
workers/remote-browser/worker.js -> runtime/combined-worker/remote-browser/worker.js
workers/smejj-worker/allowlist.mjs -> runtime/combined-worker/smejj-worker/allowlist.mjs
workers/smejj-worker/path-policy.mjs -> runtime/combined-worker/smejj-worker/path-policy.mjs
workers/smejj-worker/safe-search.mjs -> runtime/combined-worker/smejj-worker/safe-search.mjs
workers/smejj-worker/sandbox.mjs -> runtime/combined-worker/smejj-worker/sandbox.mjs
workers/smejj-worker/repository.mjs -> runtime/combined-worker/smejj-worker/repository.mjs
workers/smejj-worker/verification.mjs -> runtime/combined-worker/smejj-worker/verification.mjs
workers/smejj-worker/model-client.mjs -> runtime/combined-worker/smejj-worker/model-client.mjs
workers/smejj-worker/browser-verification.mjs -> runtime/combined-worker/smejj-worker/browser-verification.mjs
workers/smejj-worker/publish.mjs -> runtime/combined-worker/smejj-worker/publish.mjs
workers/smejj-worker/agentloop.mjs -> runtime/combined-worker/smejj-worker/agentloop.mjs
```

## Commit-Pinning

Nach dem letzten GitHub-Schreibvorgang den exakten 40-stelligen Commit-SHA
erfassen. Beide Salad-Bootstraps muessen Raw-GitHub-URLs mit genau diesem SHA
verwenden. Branch-URLs wie `main` sind im Bootstrap absichtlich ungueltig.

Erforderliche nicht geheime Runtime-Werte:

```text
SMEJJ_CONTROL_OVERLAY_BASE=<commit-gepinnte raw URL>/runtime/control-overlay
SMEJJ_COMBINED_WORKER_SOURCE_BASE=<commit-gepinnte raw URL>/runtime/combined-worker
SMEJJ_CONTROL_ORIGIN=https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud
SMEJJ_AUTONOMOUS_LOOP_ENABLED=YES
SMEJJ_WORKER_DISPATCH_URL=https://cherry-wasabi-plabhh07qstr6egc.salad.cloud/run
SMEJJ_MAX_PARALLEL_JOBS=1
SMEJJ_WORKER_REQUIRE_REPO_ALLOWLIST=YES
SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST=<freigegebener interner GitHub-Owner>
SMEJJ_GITHUB_OWNER_ALLOWLIST=<freigegebener interner GitHub-Owner>
SMEJJ_GITHUB_REPOSITORY_ALLOWLIST=<Owner/Repository-Allowlist>
SMEJJ_WORKER_MAX_MODEL_ACTIONS=25
SMEJJ_WORKER_MODEL_MAX_TOKENS=8192
SMEJJ_WORKER_MAX_RUNTIME_MS=3300000
```

Bestehende Variablen und Secrets unveraendert erhalten. Der Worker-Token nutzt
den vorhandenen Callback-Secret-Fallback; keinen Wert anzeigen. Beim ersten
Rollout bleibt `SMEJJ_GITHUB_TOKEN` leer und jedes Repository nutzt
`publishMode: diff-only`. Draft-PR-Erstellung wird erst mit einem kurzlebigen,
repo-begrenzten GitHub-App-Token separat freigeschaltet.
Die App-ID und Installation-ID sowie der base64-kodierte PKCS#8-Private-Key
werden ausschließlich im sicheren Runtime-Secret-Store gesetzt. Der Key darf
nie in Workspace, Task Capsule, Action Log, Diff oder Build-Artefakt stehen.
Ein autorisierter Draft-PR-Lauf wird genau einmal dispatcht; normale
Selbstkorrektur darf weiterhin bis zu drei Worker-Runs verwenden. Damit erzeugt
ein unklarer Netzwerkfehler keine automatische zweite externe Publikation. Ein
fehlgeschlagener Publish darf weder den bestaetigten Diff noch den `passed`-
Status ueberschreiben und erzeugt kein neues Memory-Lernen.

## Reihenfolge

1. Vorhandene Control- und Worker-Version sowie alle nicht geheimen Felder
   protokollieren.
2. GitHub-Runtime-Dateien schreiben und per Readback gegen den lokalen Inhalt
   vergleichen.
3. Beide Bootstrap-Dateien ebenfalls nur unter `runtime/**` ablegen und direkt
   ueber eine commit-gepinnte Raw-URL laden; kein Branch- oder Latest-Link.
4. Worker-Bootstrap commit-gepinnt ausrollen. Health muss bestehende
   Browser-Funktion und `codingWorker:true` melden.
5. Bestehenden Remote-Browser ueber die Bridge mit `example.com` testen.
6. Chat-Bridge kontrolliert recreaten; Health muss v96 und Rate-Limits melden,
   Chat/Agent muessen weiterhin streamen.
7. Control-Bootstrap commit-gepinnt ausrollen.
8. Health, Chat, Agent-Header, Status und Terminal-Policy pruefen.
9. Erst danach einen persistenten, harmlosen Test-Job starten.
10. Bei irgendeiner Regression sofort Rollback, danach erneut Health/Chat/
   Browser pruefen.

## E2E-Akzeptanz

Der Phase-2-Rollout gilt nur dann als bestanden, wenn alle Punkte erfuellt sind:

- Authentifizierter Job-Create liefert 201 und schreibt die Input-Capsule.
- `/autonomous-run` liefert 202; Queue und SSE zeigen den Lauf.
- Worker klont ein freigegebenes Test-Repo und arbeitet auf
  `smejj.com/agent/<jobId>`.
- GLM 5.2 nutzt nur die vier freigegebenen Tools.
- Eine neue harmlose Datei erscheint vollstaendig im Unified Diff.
- Build/Typecheck/Lint/Tests und Secret-/Diff-Check sind gruen oder als nicht
  vorhanden sichtbar markiert.
- Ergebnis-Capsule enthaelt Diff, SHA-256, Tests, Iterationen, Repository,
  Approval, Rollback, Status und Queue-Move.
- Memory-Update ist nur bei verifiziertem und dauerhaft gespeichertem Erfolg
  vorhanden.
- Freigabe mit falscher Diff-SHA wird 409; exakte Diff-SHA wird dauerhaft
  gespeichert; Merge bleibt `false`.
- Ein Draft-PR-Publish wird bei Fehler nicht automatisch erneut ausgefuehrt;
  der verifizierte Job bleibt erhalten. GitHub-Branch und offene PR muessen vor
  einem manuellen Retry geprueft werden.
- Control-Neustart hydriert Job und Follow-up aus IDrive e2.
- Chat und Status funktionieren danach unveraendert; der integrierte Browser
  liefert vor, waehrend und nach dem Coding-Job jeweils einen erfolgreichen
  `example.com`-Render.

## Nicht in diesem Rollout behaupten

- Keine harte Mandanten-Sandbox fuer beliebige Fremd-Repos.
- Kein Scale-to-zero ohne Salad-API-Key.
- Keine privaten Repos oder Draft-PRs ohne kurzlebigen GitHub-App-Token.
- Keine Python-`pytest`-Paritaet, solange das Worker-Image `pytest` nicht
  gepinnt enthaelt.
- Keine Millionen parallelen Tasks ohne Last-, Lease-, Kosten- und
  Wiederanlauftests.

## Ausgefuehrter Produktionsstand

- Frontend-Dateien live: Chat-Bridge v96 und beide Passkey-Assets, jeweils
  HTTP 200 und per SHA-256 gegen den lokalen Inhalt geprueft.
- Chat-Bridge-Instanz kontrolliert neu gestartet; `/health` meldet v96 und die
  beiden Rate-Limits. Chat und Agent liefern SSE, `[DONE]` und
  `x-smejj-model-backend:zhipu:glm-5.2`.
- Kombinierter Worker: Salad Version 5, Quellpin
  `0cbcf7bda0c3d6f81467d98674df34819be396c1`, Health
  `codingWorker:true`. Ein erster Rollout blockierte oeffentliche IPv6-DNS-
  Antworten; er wurde sofort auf den Browser-Stand zurueckgerollt, korrigiert,
  lokal getestet und erst danach erneut ausgerollt.
- Control Server: Salad Version 33, Quellpin
  `3463093842785959053da1b68d726424568452c7`. Der Runtime-Check meldet live
  `code:0` und 129 gepruefte Dateien.
- Aktiv: `SMEJJ_AUTONOMOUS_LOOP_ENABLED=YES`, Worker-Dispatch, Parallelitaet 1
  und die drei Worker-Budgets. Vorhandene Secrets wurden nicht gelesen oder
  ersetzt.
- GitHub Actions blieb unberuehrt: letzter Lauf weiterhin Run 30 vom
  2026-07-07, Commit `95fdbf1`.
- Noch nicht bestanden: produktiver persistenter Repo-Job, SSE-Outcome,
  Ergebnis-Capsule, Approval und Restart-Replay. Ursache ist die fehlende
  geschuetzte Endnutzer-Job-UI, nicht ein als bestanden gemeldeter Test.
