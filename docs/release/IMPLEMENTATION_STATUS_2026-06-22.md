# Implementation Status 2026-06-22

Status: implemented and locally verified

## Completed

- Kimi K2.7 IDrive e2 verification passed after repairing the missing checksum-manifest entry for `figures/demo_video.mp4`.
- GLM-5.2 FP8 was selected as the long-context planner vault model.
- GLM-5.2 FP8 source metadata, license, README, source summary, and upstream file inventory were archived in IDrive e2.
- GLM source archive verification passed with `npm run idrive:verify-glm-source`.
- The app now exposes model status routes for Kimi, GLM, and combined router status.
- The storage UI shows GLM vault status outside the protected start-page design lock.
- The AI mode UI can evaluate GLM/Kimi vault modes, but both remain disabled until approved compute exists.
- The service worker cache version was bumped to refresh the app shell without caching model files.
- `check:all` and `release:preflight` script chains now use `pnpm`, matching the available local runtime.

## Preserved Rules

- GitHub remains free-only.
- Cloudflare remains free-only.
- No Workers AI, R2, D1, KV, Queues, Images, Stream, paid Actions, LFS, Packages, Codespaces, trials, or auto-billing fallback were introduced.
- IDrive e2 remains storage only.
- No model weights or large artifacts were committed to the repo.
- Start page and bottom prompt design lock were not changed.

## Not Started Automatically

The GLM-5.2 FP8 full weight transfer was not started from this local desktop workspace. The transfer is about `703.8 GiB` and must run only from a stable approved transfer host with explicit transfer-window confirmation:

```bash
export CONFIRM_STREAM_MODEL_UPLOAD=YES
export HF_MODEL_REPO=zai-org/GLM-5.2-FP8
export MODEL_S3_PREFIX=model-files/glm-5-2-fp8
export STREAM_INCLUDE_REGEX='.*'
pnpm run model:stream-to-idrive
```

After transfer:

```bash
pnpm run idrive:verify-glm-complete
```

## Verification

- `pnpm run check`
- `pnpm run check:all`
- `pnpm run check:architecture`
- `pnpm run check:frontend`
- `pnpm run check:platform`
- `pnpm run release:preflight`
- `pnpm run idrive:verify-glm-source`
- Live local API smoke:
  - `/api/health`
  - `/api/models/status`
  - `/api/models/glm-5-2-fp8/status`
  - `/api/models/kimi-k2-7/status`

## Browser A-Z Smoke

Local browser testing on `http://127.0.0.1:3000` passed for:

- start page load and protected prompt layout
- chat/agent streaming fallback
- storage page with Kimi and GLM vault status
- Memory/RAG save and search
- AI mode guard for GLM vault
- code file read flow
- local profile save
- local project creation
- upload UI and safe accept hints
- mobile viewport `390x844`
- tablet viewport `820x1180`
- SEO assets: `robots.txt`, `sitemap.xml`, `llms.txt`
- PWA manifest and shell cache definitions
- security headers on HTML, API, manifest, and service worker

The in-app browser environment did not expose service-worker control APIs during live inspection, so PWA cache behavior was verified through the static platform tests and service-worker asset checks.
