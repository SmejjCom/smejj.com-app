> **VERALTET (Cloudflare-Exit 2026-07-02):** Cloudflare wird nicht mehr genutzt. Dieses Dokument bleibt nur als historische Referenz erhalten. Aktuell gilt `docs/deployment/GITHUB_PAGES_DEPLOY.md`.

# Control-Server-Proxy (Edge → Node)

## Architekturentscheidung (2026-07-02)

Der Node-Control-Server (`src/server.js`) laeuft auf eigener kostenloser Infrastruktur
(Heim-Server oder lokaler Rechner). Der Cloudflare Free Worker bleibt duenner Edge-Layer
und leitet Control-Plane-Routen weiter. Grund: SSE-Streaming, Watchdog-Timer und
HMAC-Worker-Callbacks brauchen einen langlebigen Prozess; Durable Objects wuerden
Paid-Risiko bedeuten (verboten laut FREE_ONLY_MASTER_POLICY).

## Weitergeleitete Routen (nur wenn SMEJJ_CONTROL_ORIGIN gesetzt)

- `/api/jobs` und `/api/jobs/*` (Erstellung, Status, SSE-Events, Worker-Callbacks)
- `/api/free-executor`
- `/api/workers/salad/*` (Plan mit Budget-Gate + Watchdog-Status, Create/Start/Stop)
- `/api/workers/preflight`

Alle anderen Routen (PWA, Auth, Health, Models) beantwortet der Edge Worker weiterhin selbst.

## Fail-closed-Verhalten

- Ohne `SMEJJ_CONTROL_ORIGIN`: kein Proxy, bestehendes Edge-Verhalten bleibt aktiv.
- Control Server nicht erreichbar: HTTP 503 `control_server_offline` (kein Fallback).
- Nur http(s)-Origins werden akzeptiert.

## Setup (manuell, nach schriftlicher Freigabe)

1. Node-Control-Server starten: `npm run start` (Port 3000), `.env` mit IDrive-e2-,
   Budget- (`SMEJJ_BUDGET_*`, `SMEJJ_WORKER_*`) und `SMEJJ_WORKER_CALLBACK_SECRET`-Werten.
2. Kostenlosen Tunnel aufbauen (Cloudflare Tunnel, Free): `cloudflared tunnel --url http://127.0.0.1:3000`
   oder benannter Tunnel mit eigener Subdomain (z. B. `control.smejj.com`).
3. Worker-Variable setzen: `wrangler secret put SMEJJ_CONTROL_ORIGIN` → Tunnel-URL.
4. Release-Ablauf aus `DEPLOYMENT_PLAN.md` einhalten (check:all → Staging → schriftliche
   Freigabe → manuelles Deploy → Live-Test).

## Live-Test nach Deploy

```bash
curl https://smejj.com/api/workers/salad/plan   # muss "budget" und "runtimeWatchdog" enthalten
curl -N https://smejj.com/api/jobs/<id>/events  # SSE-Stream
```
