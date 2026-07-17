# Prompt: smejj.com Maus-Engine zu 100 % LIVE fertigstellen (Rest-Arbeit, nichts offen lassen)

Diesen gesamten Text in einen neuen Chat kopieren.

## Kontext

Du arbeitest im Projektordner der smejj.com App. Lies zuerst und halte dich strikt daran:

* `AGENTS.md` (Change-Lock, Free-only, Pflichtpruefungen)
* `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
* `docs/architecture/MAUS_ENGINE.md` (Architektur, Phasenstatus, Testplan)
* `Project_Goals.md`, `AI_Guidelines.md`, `Memory_Bank.md` (neueste Eintraege 2026-07-14)
* `backups/rollback-2026-07-14-maus-engine-livegang/ROLLBACK_MANIFEST.md` (voller Deploy-Weg + SHAs)

Die Maus-Engine (Schema, Kern-Engine, Planer-Anbindung, Control-Bridge `/api/maus/run`, Dockerfile) ist gebaut und mit 57/57 Tests (`pnpm run check:maus-engine`) verifiziert. NICHT neu bauen, NICHT aendern. Es geht NUR noch um den Livegang-Abschluss und den Live-Beweis.

## Was bereits ERLEDIGT und verifiziert ist (nicht wiederholen)

1. **Schritt 1 gruen auf dem Mac:** `pnpm run check:all` + `pnpm run release:preflight` = Exit 0. Drei vorher noetige Fixes (je Rollback-Kopie im Ordner `backups/rollback-2026-07-14-maus-engine-livegang/`): flakiger Test `tests/email-auth.test.mjs` (Base64-Padding, jetzt deterministisch), veraltete Digest-Pins in `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json` (neu gepinnt inkl. contentSha256), `.dockerignore` um `workers/maus-engine`/`glm-salad/s3.js`/`schemas/maus-action-plan.schema.json` ergaenzt.
2. **Worker-Image live:** `SmejjCom/smejj-control` Actions-Workflow `.github/workflows/build-maus-engine-image.yml` baut aus `smejj-maus-engine-context.tar.gz` mit automatischem GITHUB_TOKEN (kein PAT/docker login), CI-Smoke-Test (health/401/422) bestanden, gepusht: `ghcr.io/smejjcom/smejj-maus-engine:v1` (public, + latest + SHA).
3. **Salad-Gruppe `smejj-maus-engine` angelegt:** CPU 2 vCPU / 4 GB, Replicas 1, Autostart AUS, Gateway Port 8080 → `https://grape-onion-qpxbsgljwho6v0vx.salad.cloud`. Env `SMEJJ_HOST=::` gesetzt.
4. **Control-Overlay committet** (GitHub-Web-Editor, Mac hat keinen SSH-Key): additive `/api/maus/run`-Route in `runtime/control-overlay/src/server.js`, `.../shared/platform.js`, `.../shared/controlAccessPolicy.js`. Bootstrap-Pin-Commit `22e659e02ac39fb393dcd40ea0f4cf5f69ecf65a` (am gepinnten Raw verifiziert: Import + POST/GET-Route + `mausRun`-Pfad vorhanden).
5. **Control-Artefakt auf IDrive e2:** Key `deployments/control/smejj-control-maus-2026-07-14-rc1/smejj-control-context.tar.gz`, SHA-256 `7aed76d2d73e65ae6f1a381b3625e75b4b53d0bee691559925cc58638d8e1e40` (enthaelt workers/maus-engine + glm-salad/s3.js + schemas + full runtime).

Control-Gateway: `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud`
Stand jetzt: `/api/maus/run` liefert noch HTML-Fallback → Control-Redeploy mit den neuen Env-Werten steht noch aus.

## Verbindliche Regeln (unveraendert)

* Change-Lock: Rollback-Punkt vor jeder Aenderung; keine Aenderung an bestehenden, verifizierten Funktionen; Start-Design-Lock und Favicon-Lock nicht beruehren.
* Free-only: keine neuen Dienste, keine Trials, kein Auto-Billing. Salad nur pay-per-use hinter Budget-Gate; Worker nach jeder Aufgabe beenden (Scale-to-zero).
* Secrets: niemals Schluessel/Tokens anzeigen, loggen oder in Dateien schreiben. Portal-Eingaben/Zahlungen macht ausschliesslich der Nutzer; der Agent zeigt exakt WAS wo einzutragen ist (Namen ja, Werte nur als Platzhalter).
* Memory_Bank nur mit verifizierten Fakten; 800-Zeilen-Grenze — bei Ueberschreitung aelteste Eintraege 1:1 nach `docs/memory/MEMORY_ARCHIV_2026-07.md` verschieben.
* Naming exakt `smejj.com`; jede Datei < 800 Zeilen.

## Aufgaben in dieser Reihenfolge — nichts offen lassen

### Schritt A — Portal-Env setzen (NUTZER-Aktion, Agent zeigt nur an und wartet)

Zeige dem Nutzer exakt diese Werte und warte, bis er bestaetigt. Der Agent traegt keine Secrets ein.

**A) Salad Container Group `smejj-maus-engine` → Edit → Environment** (zusaetzlich zu `SMEJJ_HOST=::`):
```
SMEJJ_MAUS_ENGINE_TOKEN = <neu erzeugen, z. B. openssl rand -hex 32>
IDRIVE_E2_ENDPOINT      = <wie bei smejj-remote-browser/glm-salad>
IDRIVE_E2_BUCKET        = <wie bei den anderen Workern>
IDRIVE_E2_REGION        = <wie bei den anderen Workern>
IDRIVE_E2_ACCESS_KEY    = <nur im Portal>
IDRIVE_E2_SECRET_KEY    = <nur im Portal>
```
Speichern → **Start** (Autostart bleibt AUS). Gateway: `https://grape-onion-qpxbsgljwho6v0vx.salad.cloud`

**B) Salad Container Group `smejj-control` → Edit → Environment** (vorher aktuelle ARTIFACT_KEY/_SHA256 als Rollback notieren, alle anderen Variablen NICHT anfassen):
```
SMEJJ_CONTROL_BOOTSTRAP_URL   = https://raw.githubusercontent.com/SmejjCom/smejj-control/22e659e02ac39fb393dcd40ea0f4cf5f69ecf65a/runtime/bootstrap-control-release.mjs
SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-maus-2026-07-14-rc1/smejj-control-context.tar.gz
SMEJJ_CONTROL_ARTIFACT_SHA256 = 7aed76d2d73e65ae6f1a381b3625e75b4b53d0bee691559925cc58638d8e1e40
SMEJJ_MAUS_ENGINE_ENABLED     = YES
SMEJJ_MAUS_ENGINE_WORKER_URL  = https://grape-onion-qpxbsgljwho6v0vx.salad.cloud
SMEJJ_MAUS_ENGINE_TOKEN       = <derselbe Token wie in A>
```
Speichern → Redeploy.

### Schritt B — Health/Live-Gate pruefen

Von der Origin `https://smejj.com` (per Chrome-Tools, wegen CORS) pruefen:
* Control `GET /api/maus/run` (authentifizierte Sitzung) → JSON `configured:true`, `budget.ok:true` (statt HTML-Fallback). Ohne Anmeldung → JSON `401`.
* Worker `GET https://grape-onion-qpxbsgljwho6v0vx.salad.cloud/health` → `{ ok:true, engine:"smejj.com maus-engine" }`.
Solange HTML-Fallback kommt: Portal-Redeploy noch nicht aktiv → warten/erneut pruefen. Nichts als live dokumentieren, was nicht live geprueft wurde.

### Schritt C — Live-E2E-Beweis (a)-(e) + Stufe-1 + Makro, Artefakte auf IDrive e2

Jeden Lauf ueber die produktive Route `POST /api/maus/run` (authentifizierte Sitzung) mit eigener `capsuleRef` fahren; Artefakte liegen danach unter `capsules/maus-engine/{capsuleRef}/result/{planId}/` (gzip + `manifest.json` mit SHA-256 je Objekt). Jeder Nachweis = Manifest-Key + SHA-256 dokumentieren.

* (a) Formular ausfuellen (z. B. httpbin.org/forms/post); Allowlist nur diese Domain; assert + Screenshot.
* (b) Navigation + Tabellen-Extraktion (z. B. www.iana.org); `extractTable` + Screenshot; extrahierte Daten im Aktionsprotokoll.
* (c) Datei-Download mit Ueberwachung: `policy.files.downloadAllowed:true` + `download` + `watchDownloads` + `assert downloadExists`; Download-Artefakt auf e2.
* (d) Fehlerfall Allowlist-Abbruch: Plan mit Ziel ausserhalb der Allowlist → sofortiger Abbruch, Abbruch-Artefakt (`fehler/screenshot.png`, `fehler/dom-snapshot.html`) auf e2.
* (e) Modellunabhaengigkeit live: dieselbe Aufgabe einmal mit GLM-5.2, einmal mit `plannerModel` (z. B. Kimi K2.7); beide Plaene normalisieren, Engine-Verhalten/Aktionsprotokolle vergleichen (identisch bei identischem Plan; Abweichung nur im planner-Feld/planId).
* Stufe-1-Beweis: reiner `httpRequest`-Plan → Protokoll zeigt `stage:1`, KEIN Browser gestartet.
* Makro-Test: erfolgreichen Lauf mit `saveAsMacro` speichern, danach denselben Ablauf via `runMacro` OHNE Planer-Modell ausfuehren.
* Nach jedem Lauf pruefen: Worker hat sich beendet (Scale-to-zero), keine dauerhaften Kosten.

### Schritt D — Fehlerbehandlung

Fehler sofort beheben (Rollback-Punkt vor jeder Codeaenderung), danach `pnpm run check:maus-engine` + betroffene Suiten; bei erneutem Deploy Schritt 1 wiederholen. Nichts als bestanden dokumentieren, was nicht live bestanden wurde.

### Schritt E — Abschluss und 100 % Schutz

1. `docs/architecture/MAUS_ENGINE.md` Status auf "live verifiziert" (mit Capsule-Referenzen, Manifest-Keys, SHA-256, Worker-Gateway, Bootstrap-Commit, Artefakt-SHA).
2. Memory_Bank-Eintrag: nur belegte Fakten (Capsules, e2-Keys, SHA-256, Testresultate, Deploy-IDs); `trainingEligible:false`. 800-Zeilen-Grenze beachten (ggf. archivieren).
3. Rollback dokumentieren: Deaktivierung = `SMEJJ_MAUS_ENGINE_ENABLED` bei `smejj-control` entfernen (Route wieder inert 503); Worker-Gruppe `smejj-maus-engine` stoppen; ARTIFACT_KEY/_SHA256/BOOTSTRAP_URL auf die notierten Vorwerte zuruecksetzen.
4. Schutzstatus bestaetigen: Start-/Favicon-Lock byteidentisch, keine bestehende Funktion veraendert, keine Daten geloescht, Worker-Autostart AUS, Budget-Gate aktiv. Ab dann: keine Aenderung ohne neue schriftliche Freigabe.

## Erfolgskriterium

`check:all` + `release:preflight` gruen auf dem Mac; Maus-Engine-Worker live hinter Budget-Gate; `/api/maus/run` liefert JSON (nicht HTML); E2E (a)-(e) plus Stufe-1- und Makro-Beweis live bestanden mit vollstaendigen, per SHA-256 nachweisbaren Artefakten auf IDrive e2; MAUS_ENGINE.md + Memory_Bank aktualisiert; alle Locks unveraendert; keine laufenden Fixkosten (Worker beendet sich nach jeder Aufgabe).

## Zusatzhinweis fuer den Agenten

Bitte eigenstaendig durcharbeiten, ohne unnoetig nachzufragen. Die benoetigten Portale (Salad, GitHub) sind im Browser geoeffnet und eingeloggt; Chrome-Tools und der sandboxed Shell stehen bereit. Der Mac hat keinen git-SSH-Key — Repo-Aenderungen daher ueber den GitHub-Web-Editor/Upload (wie beim bereits erledigten Overlay). Nach der Umsetzung live gehen, live testen, Fehler sofort beheben und erneut testen, bis alles 100 % sauber laeuft. Zum Schluss 100 % Schutz aktivieren: nichts darf kaputtgehen, geloescht oder ohne schriftliche Freigabe geaendert werden; bestehende Funktionen, Daten, Design, Einstellungen und Zugaenge bleiben sicher.
