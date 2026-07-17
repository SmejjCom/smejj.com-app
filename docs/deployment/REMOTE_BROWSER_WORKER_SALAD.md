# smejj.com Remote-Browser-Worker auf Salad

Stand: 2026-07-08. Der Worker ist stateless und rendert blockierte Webseiten mit
Playwright/Chromium ausserhalb des Control Servers.

## Architekturentscheidung

- Der Control Server bleibt minimal: Origin, SSRF, Rate-Limit, Budget-Gate und
  Delegation.
- Chromium laeuft nur im separaten Worker-Container.
- Der Worker speichert nichts dauerhaft. Screenshots/Logs gehoeren nur als
  Task-Capsule-Artefakte nach IDrive e2.
- Fail-closed: Ohne `SMEJJ_REMOTE_BROWSER_ENABLED=YES`, Worker-URL, Token und
  Budgetfreigabe startet kein Remote-Browser-Pfad.

## Lokaler Build und Smoke

```bash
bash scripts/deploy/build_and_push_remote_browser_image.sh
```

Das Script baut `ghcr.io/smejjcom/smejj-remote-browser:latest`, startet den
Container lokal, prueft `/health` und rendert `https://example.com` mit echtem
Chromium. Erst danach wird gepusht.

## Manuelle Registry-Voraussetzung

Einmalig vor dem Push:

```bash
docker login ghcr.io
```

Username: `SmejjCom`

Passwort: GitHub Personal Access Token mit `write:packages`.

Das Image enthaelt keine Secrets und kann oeffentlich sein. Wenn GHCR das Package
zunaechst privat anlegt, muss es im GitHub-Package-Bereich auf public gestellt
oder in Salad mit Registry-Credentials verbunden werden.

## Salad Container Group

Empfohlene Startkonfiguration:

```text
Image Source: ghcr.io/smejjcom/smejj-remote-browser:latest
Port: 8080
Gateway: on
Replicas: 1
CPU/RAM: klein starten, nach Messung anpassen
Env:
  SMEJJ_REMOTE_BROWSER_TOKEN=<starkes Secret>
  SMEJJ_REMOTE_BROWSER_NAV_TIMEOUT_MS=25000
```

Control Server Env:

```text
SMEJJ_REMOTE_BROWSER_ENABLED=YES
SMEJJ_REMOTE_BROWSER_WORKER_URL=https://<remote-browser-gateway>.salad.cloud
SMEJJ_REMOTE_BROWSER_TOKEN=<gleiches Secret>
SMEJJ_BUDGET_MAX_USD_PER_JOB=<freigegebener Wert>
SMEJJ_BUDGET_MAX_RUNTIME_MINUTES=<freigegebener Wert>
SMEJJ_WORKER_BUDGET_USD=<Remote-Browser-Schaetzung>
SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES=<Remote-Browser-Schaetzung>
```

## Verifikation

Worker direkt:

```bash
curl https://<remote-browser-gateway>.salad.cloud/health
curl -X POST https://<remote-browser-gateway>.salad.cloud/render \
  -H "authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","viewport":{"width":800,"height":600}}'
```

Control Server:

```bash
curl -H "Origin: https://smejj.com" \
  "https://<control-gateway>.salad.cloud/api/browser/remote?url=https%3A%2F%2Fexample.com"
```

Erwartung: `{ "ok": true, "remote": true, "screenshot": "data:image/png;base64,..." }`.

## Rollback

- Control Server Env `SMEJJ_REMOTE_BROWSER_ENABLED` auf einen anderen Wert als
  `YES` setzen oder Worker-URL entfernen.
- Frontend bleibt sicher: Es faellt dann automatisch auf den bestehenden
  externen Fallback zurueck.
