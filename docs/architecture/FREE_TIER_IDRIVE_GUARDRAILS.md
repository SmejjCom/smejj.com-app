# Free Tier and IDrive e2 Guardrails

## Non-Negotiable Rules

- GitHub.com is free-tier only.
- Cloudflare.com is free-tier only.
- Do not use paid GitHub Actions minutes, Packages storage, Codespaces, Git LFS storage, Pro, Team, or Enterprise.
- Do not use paid Cloudflare Workers, R2, Images, Stream, Queues, D1, KV, Pro, Business, or Enterprise features.
- Do not use trials, teaser plans, or services that can automatically become paid after a limit.
- Store files, media, models, backups, deployment artifacts, and central data in IDrive e2 / S3-compatible storage.
- Never store model weights, user archives, media libraries, or central application data in GitHub or Cloudflare.

## Allowed Roles

- GitHub Free: source code, documentation, small metadata, manual collaboration.
- Cloudflare Free: DNS, static delivery, edge routing, and browser-facing entry points only when the free tier can be kept below hard limits.
- IDrive e2: authoritative object storage for large and durable files.

## Scaling Constraint

smejj.com can be designed for very high scale, but GitHub Free, Cloudflare Free, and IDrive e2 storage alone are not enough to serve AI inference for millions or billions of daily users. They are not a free inference cluster.

Until separate compute is explicitly approved, the architecture must treat inference as external capacity behind stable APIs. The app may route to approved providers or self-owned infrastructure later, but it must not silently depend on paid GitHub or Cloudflare capacity.

## Design Priorities

- Speed: static-first UI, streaming responses, minimal round trips, cacheable metadata.
- Stability: idempotent uploads, checksum verification, explicit transfer gates.
- Security: local-only secrets, no secret logging, least-privilege storage keys.
- Scalability: storage prefixes, immutable manifests, provider-neutral model registry.
- Cost control: hard free-tier boundaries for GitHub and Cloudflare; IDrive e2 as the storage bill center.
