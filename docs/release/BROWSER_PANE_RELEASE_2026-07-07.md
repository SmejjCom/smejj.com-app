# Release-Handover — Integrierter Browser (Codex-Stil)

Stand: 2026-07-07. Autor: AI-Agent (Senior Full-Stack). Freigabe zum Live-Gang: OFFEN (schriftliche Nutzer-Freigabe erforderlich, siehe AGENTS.md Change-Lock + DEPLOYMENT_PLAN.md).

## Was umgesetzt wurde

Klick auf den Menuepunkt "Browser" im rechten Panel oeffnet einen integrierten Browser als Split-View (links Arbeitsbereich, rechts Browser) — Verhalten/Design an OpenAI Codex angelehnt.

- Bis zu 7 Tabs (+/Schliessen), Zurueck/Vor/Neu laden, kombinierte URL-/Suchleiste (Nicht-URLs gehen an DuckDuckGo), Ladeindikator, "In neuem Tab oeffnen", Tab-Wiederherstellung ueber localStorage.
- Direkt einbettbare Seiten laufen im Original-iframe (volles JavaScript).
- Einbett-blockierende Seiten (Google, GitHub, ...) werden serverseitig ueber `/api/browser/fetch` geladen und als sichere, umgeschriebene Ansicht dargestellt: Seiten-Scripts entfernt, `<base>` gesetzt, Links/GET-Formulare navigieren per postMessage weiter.
- Fail-closed Sicherheit am Proxy: nur http(s), SSRF-Guard gegen private Netze, Origin-/Referer-Bindung an smejj.com (fremde Origin -> 403), Rate-Limit pro IP (Token-Bucket, Standard ~30/min -> 429 mit Retry-After), harte Groessen-/Zeitlimits.

## Geaenderte / neue Dateien

Neu: `public/browser-pane.js`, `public/browser-pane.css`, `control-server/src/routes/browserProxyRoutes.js`, `control-server/src/http/rateLimiter.js`, `tests/browser-pane.test.mjs`, dieses Dokument.

Angepasst: `public/index.html` (Root + CSS/JS-Einbindung), `public/config.js` (Route), `public/sw.js` (Cache v76 + Assets), `src/shared/platform.js` (Route), `src/server.js` (+2 Zeilen Dispatch), `package.json` (check-Liste + check:frontend), `.env.example` (Rate-Limit-Vars), `tests/frontend-structure.test.mjs` + `tests/platform-pwa.test.mjs` (Cache-Version v76).

Bewusst NICHT angefasst: `public/app.js`, `public/styles.css` (Ratchet-Baseline eingehalten); Startseite und Eingabefeld (Design-Lock intakt).

## Verification (lokal, alle gruen)

`npm run check` (Syntax), `check:frontend` 50/50, `check:control-server` 57/57, `check:platform` 6/6, `check:architecture` 7/7, `check:abuse` 7/7, `check:security`, `check:cost`, `check:paths`, `check:json`, `check:guidelines` (342 Dateien), `release:guard`, `check:rollback`. Lokaler Server-Smoke: 403 (fremde Origin), 400 (privates Ziel/SSRF), 502 (externes Ziel — nur weil die Build-Sandbox kein Ausgangsnetz hat; auf Salad loest es auf).

## Go-Live (NUR nach schriftlicher Freigabe; Ablauf laut DEPLOYMENT_PLAN.md)

Rollback-Punkt zuerst sichern (Git-Tag/Commit vor Merge + IDrive-e2-Artefakt: `npm run idrive:artifact`).

1. Frontend -> GitHub Pages (Deploy-from-Branch `gh-pages`, keine Actions):
   ```bash
   git subtree push --prefix public origin gh-pages
   ```
   (bzw. Orphan-Flow aus docs/deployment/GITHUB_PAGES_DEPLOY.md). Service-Worker-Cache ist v76, holt die neuen Assets automatisch.

2. Control-Server -> Salad (neues Image, weil `/api/browser/fetch` neu ist):
   ```bash
   docker build -f deploy/control-server/Dockerfile -t smejj-control:latest .
   docker tag smejj-control:latest ghcr.io/smejjcom/smejj-control:latest
   docker login ghcr.io   # Nutzer-Schritt (Token write:packages)
   docker push ghcr.io/smejjcom/smejj-control:latest
   ```
   Danach im Salad-Portal die Container Group `redbean-caesar-...` auf das neue Image aktualisieren (Redeploy). Optional Env `SMEJJ_BROWSER_RATE_CAPACITY` / `SMEJJ_BROWSER_RATE_REFILL_PER_SEC` setzen.

## Live-Test nach Deploy

- `GET https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/browser/fetch?url=https://example.com` mit Header `Origin: https://smejj.com` -> `{ ok: true, embeddable, html }`.
- Ohne/Fremd-Origin -> 403. Privates Ziel (`http://127.0.0.1/`) -> 400. Schnellfeuer -> 429.
- Auf smejj.com: Panel "Browser" oeffnen, `github.com` und `google.com` laden, 7 Tabs testen, Zurueck/Vor, "In neuem Tab oeffnen".
- Startseite unveraendert (Design-Lock), keine Konsolenfehler.

## Bekannte Grenze (fuer echtes Codex-1:1)

Volles JavaScript/Logins auf einbett-blockierenden Seiten brauchen einen headless Browser serverseitig (Playwright-Worker auf Salad, CDP/Screencast). Die aktuelle Proxy-Ansicht deckt Lesen, Suchen und Navigieren ab, keine interaktiven Logins. Empfohlener naechster Ausbauschritt.
