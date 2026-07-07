# Runbook: Control Server live schalten (Stand 2026-07-03)

Konsolidierter Ablauf für den letzten Schritt zum funktionierenden Backend.
Free-only-konform (GitHub Pages Free, Salad pay-per-use, IDrive e2 Storage; kein
Cloudflare, kein GitHub Actions).

## Aktueller Stand

- Frontend LIVE und verifiziert: Routing/Deep-Links, Canonical=/, Sitemap 200-only,
  Service Worker v69. Kleine Testwerbung auf https://smejj.com/ möglich.
- Salad: Container Group `smejj-control` angelegt (2 vCPU/2 GB, Gateway Port 3000,
  Env SMEJJ_HOST=::, PORT=3000, PROJECT_ROOT=/app). Gateway-URL:
  https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud
- Salad-Verbrauch aktuell 0: `smejj-control` und `smejj-llm-qwen3` (RTX 4090) beide STOPPED.
- Architekturweg für den Server-Code: ghcr.io-Image (schriftlich freigegeben).

## Schritt 1 — Image bauen und pushen (NUR lokal, Nutzer)

Benötigt Docker Desktop + GitHub Token mit `write:packages`.

```bash
docker login ghcr.io          # Username: SmejjCom, Passwort: Token (write:packages)
bash scripts/deploy/build_and_push_control_image.sh
```

Das Skript baut `linux/amd64`, testet lokal `/api/health` und pusht
`ghcr.io/smejjcom/smejj-control:latest`. Danach ggf. das Package unter
https://github.com/orgs/SmejjCom/packages auf **public** stellen (oder Salad
Registry-Credentials hinterlegen).

## Schritt 2 — Salad auf das Image umstellen (kann der Agent übernehmen)

Portal → Container Groups → `smejj-control` → Edit:
- Image Source: `ghcr.io/smejjcom/smejj-control:latest`
- Command: **Clear All** (Image-CMD `node src/server.js` nutzen)
- Environment behalten: `SMEJJ_HOST=::`, `PORT=3000`, `PROJECT_ROOT=/app`
- Save → Autostart pullt und startet.

## Schritt 3 — Live-Verifikation (Agent)

- `GET https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/health` → `ok:true`
- Frontend-E2E ohne Code-Deploy: auf https://smejj.com im Browser
  `localStorage.setItem("smejj.apiOrigin.v1","https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud")`,
  neu laden, Chat/Costs/Models testen.

## Schritt 4 — Secrets & GPU (NUR Nutzer, im Salad-Portal)

`smejj-control` → Edit → Environment ergänzen (Werte trägt nur der Nutzer ein):
- `SMEJJ_LLM_SALAD_BASE_URL=https://tangerine-dill-g0pw1k0sdg3rhtb0.salad.cloud/v1`
- `SMEJJ_LLM_SALAD_API_KEY=<Salad-Api-Key der qwen3-Group>`
- `IDRIVE_E2_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY=<Object Brain>`
- optional `GOOGLE_CLIENT_ID` + `SMEJJ_SESSION_SECRET` (Login)
- optional `SMEJJ_BUDGET_*` (schaltet autonome Coding-Jobs frei)

Danach `smejj-llm-qwen3` wieder **Start** (RTX 4090, ~0,30 USD/h) — erst wenn Chat
wirklich genutzt wird.

## Schritt 5 — Frontend dauerhaft an das Backend binden (Agent, braucht Freigabe)

`public/config.js` `DEFAULT_API_ORIGIN` auf die Gateway-URL (oder später
`https://api.smejj.com` per Spaceship-CNAME) setzen. `config.js` ist eine
Start-Lock-Datei → schriftliche Freigabe + `check:start-lock --freeze` + Deploy nötig.

## Rollback

- Frontend: Git-Ref c1f20a4, `backups/rollback-2026-07-03-routing-canonical/`.
- Salad: `smejj-control` Stop/Delete jederzeit; Kosten enden sofort.

## Task Capsule

`tmp/task-capsules/job_routing_canonical_2026_07_03/` (input, patch.diff,
test-results, browser-results, rollback-manifest, verifier-report, final-answer).
IDrive-e2-Upload erfolgt vom Live-Control-Server oder als bewusster Nutzer-Schritt
(aus der Sandbox ist der IDrive-Upload durch DNS gesperrt).
