# smejj.com Remote-Browser-Worker

Stateless Playwright/Chromium worker for pages that cannot run inside an iframe or
the safe HTML proxy.

## Contract

- `GET /health` returns worker health.
- `POST /render` with `Authorization: Bearer <SMEJJ_REMOTE_BROWSER_TOKEN>` renders:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1365, "height": 900 }
}
```

Response:

```json
{
  "ok": true,
  "finalUrl": "https://example.com/",
  "title": "Example Domain",
  "status": 200,
  "screenshot": "data:image/png;base64,..."
}
```

## Salad notes

Run as a separate CPU container group behind Salad Gateway auth. The Control
Server remains the only public API surface for smejj.com and calls this worker
only when:

- `SMEJJ_REMOTE_BROWSER_ENABLED=YES`
- `SMEJJ_REMOTE_BROWSER_WORKER_URL` is set
- `SMEJJ_REMOTE_BROWSER_TOKEN` is set
- the existing worker budget gate approves the request

The worker stores no state. Browser recordings, screenshots and task evidence
belong in IDrive e2 task capsules when a higher-level job uses them.
