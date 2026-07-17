# Cline-Go-Live smejj.com — Abschluss & Rollback-Notiz (2026-07-15)

## Endstand Produktion `smejj-control` (Salad, Version 69 — LIVE, verifiziert)

- SMEJJ_CONTROL_ARTIFACT_KEY = `deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz`
- SMEJJ_CONTROL_ARTIFACT_SHA256 = `7775a87e0878b0815d6ed045600c9d30b926be562f720fbd72a27c81fd51ccda`
- SMEJJ_CONTROL_BOOTSTRAP_URL = Pin-Commit `5db5c86b70580013162b9326b0daea8fa892bbf7` (`runtime/bootstrap-idrive-control.mjs`, wie Staging v26; SHA256 in-page gegen Staging-Wert verifiziert)
- SMEJJ_PROVIDER_CREDENTIAL_KEY_ID = `cline-cred-key-2026-07-14`
- SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 = NEU erzeugt (32 Bytes, Web-Crypto direkt im Browser-Tab; Wert war nie im Chat/Agent-Kontext)
- SMEJJ_HOST = `::` (unverändert), IDRIVE_E2_BUCKET = `smejj-app`, IDRIVE_E2_DEPLOY_BUCKET = `smejj-model-files`
- Domain: `redbean-caesar-yccqb9olg70i1ehu.salad.cloud`, Health: `/api/health`

## Rollback Produktion (auf Stand vor Cutover, Version 67)

1. SMEJJ_CONTROL_ARTIFACT_KEY = `deployments/control/smejj-control-maus-2026-07-14-rc1/smejj-control-context.tar.gz`
2. SMEJJ_CONTROL_ARTIFACT_SHA256 = `7aed76d2d73e65ae6f1a381b3625e75b4b53d0bee691559925cc58638d8e1e40`
3. SMEJJ_CONTROL_BOOTSTRAP_URL = Pin-Commit `658cbbb3b445cb0ebf4ce09326ea0e63fbfe91b9` (`runtime/bootstrap-idrive-control.mjs`); SHA256 vor dem Setzen neu über die öffentliche Raw-URL berechnen
4. SMEJJ_PROVIDER_CREDENTIAL_KEY_ID/_KEY_B64 entfernen oder leeren (gespeicherte Cline-Credentials werden damit unlesbar — Key danach neu verbinden)

Ältere Wiederherstellungspunkte (rc18, rc3, v41, maus-rc1) liegen unangetastet auf IDrive e2.

## Zwischenfall beim Cutover (behoben)

- Version 68 (v62-Artefakt + altem Maus-Bootstrap-Pin 658cbbb) crashte im Boot:
  `ERR_MODULE_NOT_FOUND workers/maus-engine/planner-roundtrip…` — das v62-Artefakt enthält die Maus-Engine-Dateien nicht, das Maus-Overlay erwartet sie.
- Fix (schriftlich freigegeben): Bootstrap-Pin auf den Staging-v62-Stand `5db5c86b` gestellt → Version 69 bootet grün.
- Folge: Die Maus-Engine-Bridge `/api/maus/run` ist auf Produktion vorübergehend NICHT verfügbar (Worker-Gruppe `smejj-maus-engine` war ohnehin gestoppt). Wiederherstellung erfordert ein kombiniertes Release (v62-Cline-Stand + workers/maus-engine + Maus-Routen), zuerst auf Staging. Die SMEJJ_MAUS_*-Env-Variablen liegen weiterhin auf Prod (von v62 ignoriert, harmlos).
- Salad-Allokation hing mehrfach bei „Lowest"-Priorität (höhere Prioritäten auf diesem Konto nicht wählbar); Stop→Start der Gruppe löste die Neuzuteilung.

## Live-Tests (alle bestanden, 2026-07-15)

- `GET /api/health` → 200 `ok:true`, App „smejj.com Code", Kimi K2.7 ready, storage true
- Auth: `/api/auth/me` mit Bearer → authenticated:true
- Cline: Key sicher verbunden (AES-256-GCM, keyHint `••••12f5`), 19 Modelle geladen, Modellwechsel ohne Neustart auf `poolside/laguna-m.1:free`, Chat-SSE-Streaming sauber inkl. `data: [DONE]`, Kosten 0 (free)
- Frontend: provider-settings.js/.css, settings-surface.js, sw.js (smejj-shell-v120) waren bereits live und sind SHA-256-byteidentisch zur Arbeitskopie — kein Push nötig
- Startseite non-regressed; `npm run check:start-lock` → 28/28 byteidentisch

## Bekannte Punkte / Folgethemen

1. **Frontend-Anmeldebug (Workaround dokumentiert):** provider-settings.js liest den Token nur aus `sessionStorage smejj.apiToken.v1` bzw. Cookie-Session. In frischen Tabs mit reinem localStorage-Login erscheint fälschlich „Bitte zuerst bei smejj.com anmelden". Workaround: Token aus `localStorage smejj.auth.accessToken.v1` nach `sessionStorage smejj.apiToken.v1` kopieren. Sauberer Fix (localStorage-Fallback in provider-settings.js) als kleines Follow-up-Release.
2. `cline-pass/*`-Modelle: 403 ENTITLEMENT_ERROR (Cline-Plan/Guthaben) — free-Modelle laufen.
3. Cline API-Key wurde vom Nutzer rotiert und neu verbunden (alter Key war exponiert).
4. Maus-Engine-Bridge: kombiniertes Release nötig (siehe oben).
5. Watchdog-Completion-Persistenz untersuchen (Verdacht: If-None-Match IDrive e2 bzw. Salad-API-Statusprüfung) — stale Lease könnte künftige Boots blockieren; `workers/salad/watchdogs/` ist aktuell leer, Backup unter `backups/watchdog-stale-2026-07-14/`.
6. Vor dem nächsten regulären Push: voller `pnpm run check:all` + `release:preflight` auf dem Mac (Change-Lock).

## Nachtrag (Follow-ups, freigegeben & live 2026-07-15)

Beide vom Nutzer schriftlich freigegebenen Folgearbeiten sind erledigt und live verifiziert:

1. **Frontend-Token-Fix live:** `public/provider-settings.js` mit additivem `recoverLocalToken()` (localStorage→sessionStorage-Spiegel) behebt den „Bitte zuerst anmelden"-Fehler in frischen Tabs. Deploy auf `SmejjCom/smejj-app-frontend` main, live byteidentisch (SHA `d58288e9…`). Rollback: `backups/rollback-2026-07-15-provider-settings-tokenfallback/`.
2. **Kombiniertes Release v62+Maus live (Prod Version 70):** Artefakt `smejj-control-cline-maus-2026-07-15-rc1.tar.gz`, SHA-256 `fce56b8031927241d0330b89b9a1241dbb439b2f2b890d635200737e64fd9dba`. Zuerst auf Staging (V27) getestet (bootet grün, Maus-Route wired), dann Prod-Cutover. `/api/maus/run` auf Prod wieder `configured:true`, `budget.ok:true`; Cline non-regressed (19 Modelle, keyHint ••••12f5). Maus-Worker-Gruppe bleibt gestoppt (keine Fixkosten).

**Neuer Prod-Rollback (auf reinen Cline-v62 ohne Maus):** ARTIFACT_KEY=`deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz`, SHA=`7775a87e…51ccda`.

## Nachverifikation auf Version 70 (2026-07-15)

**Bestanden:** Cline-Modellwechsel ohne Neustart auf `poolside/laguna-m.1:free`, Chat-SSE-Stream 87 Chunks mit sauberem `[DONE]` und korrekter Antwort, Backend-Header `cline:poolside/laguna-m.1:free`, Kosten 0. Das aktive Prod-Modell steht jetzt auf dem free-Modell (vorher `cline-pass/glm-5.2` = 403 ENTITLEMENT).

**Nicht bestanden (offen):** Ein vollständiger Maus-Lauf auf V70 konnte nicht abgeschlossen werden.

Belegter Ablauf (runId `maus-mrloows6-63583c64649d`): Kimi K2.7 erzeugte einen gültigen Plan, die Engine validierte und dispatchte; Schritt s1 brach ab; der erste Roundtrip lieferte einen ungültigen Plan (`unausgewertetes Feld: retryPolicy`), der fail-closed abgelehnt wurde (Live-Beleg, dass das Schema-Gate wirkt); der zweite Roundtrip endete mit `worker_antwort_ungueltig_http_503` → `planner_budget_erschoepft`.

**Root Cause (Befund, kein Bridge-Defekt):** `workers/maus-engine/worker.mjs` Zeile 17 — `EXIT_AFTER_RUN` ist per Default AN. Der Worker beendet sich nach dem **ersten** Dispatch (Scale-to-zero, gewollt). Damit ist `budget.maxPlannerRoundtrips > 0` praktisch wirkungslos: jeder Retry trifft einen toten Worker (Gateway 503), und jeder Neustart zieht das Playwright-Image neu (Minuten). Salad zeigt dabei verzögert weiter RUNNING/Ready. `SMEJJ_HOST=::` war am Worker bereits korrekt gesetzt — IPv6 war **nicht** die Ursache (vor jeder Änderung geprüft, nichts angefasst).

**Empfehlung (separat freizugeben):** entweder Control-Server-seitig pro Versuch einen frischen Worker starten/abwarten, oder für Mehrfachversuche `SMEJJ_MAUS_EXIT_AFTER_RUN=NO` setzen und die Gruppe danach hart stoppen. Bis dahin: Maus-Läufe nur mit `maxPlannerRoundtrips: 0` bei frisch gestartetem Worker.

Die E2E-Nachweise vom 2026-07-14/15 ((a), (b), (c), (d), Stufe-1, Makro-Replay) bleiben gültig — sie wurden heute nur nicht erneut reproduziert. Worker-Gruppe danach gestoppt (0/1, keine Fixkosten).

## Schutz-Status

Nichts gelöscht; alle Rollback-Artefakte unangetastet; Start-/Favicon-Lock unberührt; Design unverändert; Secrets (Vault-Key, Cline-Key) waren zu keinem Zeitpunkt im Chat- oder Agent-Kontext. Änderungen an Produktion erfolgten nur nach schriftlicher Freigabe im Chat (Cutover-Freigabe + Fix-Freigabe „Bootstrap auf v62-Stand").
