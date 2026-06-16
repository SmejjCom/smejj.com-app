# GitHub, Cloudflare, IDrive e2 Connection Audit

Date: 2026-06-16

## Cost Policy

- GitHub.com must stay on the permanent Free plan.
- Cloudflare.com must stay on the permanent Free plan.
- GitHub Actions, Packages, Codespaces, paid runners, paid storage, Pro, Team, and Enterprise are not core architecture.
- Cloudflare Workers Paid, R2, Images, Stream, Queues, D1 Paid, KV Paid, Pro, Business, and Enterprise are not core architecture.
- Files, media, models, backups, deployment artifacts, and central data belong in IDrive e2 / S3-compatible storage.
- Services that are only temporarily free, trial-based, or auto-bill after a quota are not allowed as core dependencies.

## Verified State

- GitHub repository exists and is visible in the browser: `smejjcom/smejj.com-app`.
- Local Git remote points to `git@github.com:smejjcom/smejj.com-app.git`.
- Local Git is configured to use `~/.ssh/smejjcom_github_ed25519` for this repository.
- GitHub remote read test succeeded for `refs/heads/main`.
- No GitHub Actions workflows are present in the local repository.
- Cloudflare Wrangler login is active for `smejjcom@gmail.com`.
- Cloudflare Worker name is `smejj-com`.
- Cloudflare live endpoints are healthy:
  - `https://smejj.com/api/health`
  - `https://smejj.com/api/storage/status`
- Cloudflare deployment dry-run succeeds and only uses Worker Assets plus environment variables.
- Local app health and IDrive status endpoint are healthy.
- Browser tests passed for local `http://127.0.0.1:3000` and live `https://smejj.com`.
- IDrive e2 signed S3 list succeeds for `s3://smejj-model-files/model-files/kimi-k2-7/`.
- IDrive e2 signed S3 upload and download succeeded for a small healthcheck object.
- IDrive e2 project/deployment artifact upload and download verification is available through `npm run idrive:artifact`.
- Cloudflare KV namespace list returned empty.
- Cloudflare R2 is not enabled for this account, so the project is not using Cloudflare R2 storage.
- No Cloudflare D1, Queues, R2, KV, Images, Stream, or paid Cloudflare storage feature is configured in `wrangler.jsonc`.

## IDrive e2 Permission Note

The current IDrive e2 key can list, upload, and download objects. A delete attempt for
`healthchecks/codex-1781570645437.txt` returned `AccessDenied`.

This is intentionally compatible with immutable backup/model-vault storage. Runtime,
deployment, source, and model artifacts are treated as append-only records. Cleanup is
not a runtime requirement and must not be implemented through GitHub or Cloudflare paid
storage. If a human maintenance workflow later needs deletion, it must use a separate
least-privilege IDrive e2 maintenance key outside the production runtime path.

## Scale Decision

The current architecture is free-safe for the public shell, DNS, light edge routing,
source code, and storage checks. It is not a complete billion-user inference backend.

For millions or billions of daily users, GitHub Free and Cloudflare Free must remain
front-door/static roles only. Heavy inference, central compute, and user-scale state
must be handled by browser/local-device compute, user-owned compute, IDrive-e2 object
flows, or a new written free-safe architecture review. The app must fail closed
instead of silently switching to paid GitHub, Cloudflare, trial, or auto-billing services.

## Last Verification Commands

- `npm run check`
- `npm run idrive:check`
- `npm run idrive:artifact`
- `npx wrangler deploy --dry-run --outdir /tmp/smejj-worker-dry-run-final`
- Browser load: `http://127.0.0.1:3000`
- Browser load: `https://smejj.com`
- Browser action: `IDrive e2 pruefen`
