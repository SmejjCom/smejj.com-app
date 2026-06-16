# Cloudflare Free Gatekeeper Skeleton

This folder is a local design skeleton only. It is not deployed and must not be
used to introduce Cloudflare Paid features.

Role:

- Check policy.
- Check auth and quota envelopes.
- Create short-lived presigned IDrive e2 URLs.
- Fail closed when configuration, limits or provider status are unclear.

Not allowed:

- No Cloudflare Paid features.
- No R2, Workers AI, Queues, D1 Paid or KV Paid dependency.
- No model inference.
- No large file proxying.
- No IDrive e2 secrets in browser code or repo files.
- No auto-fallback to paid providers.

Required environment names:

- `IDRIVE_E2_ENDPOINT`
- `IDRIVE_E2_REGION`
- `IDRIVE_E2_ACCESS_KEY`
- `IDRIVE_E2_SECRET_KEY`
- `IDRIVE_E2_BUCKET`
- `FREE_DEMO_HARD_LIMIT_ALLOWED`
- `FREE_DEMO_REMAINING`

Presign flow:

1. Browser asks `/gatekeeper/presign` for upload or download permission.
2. Gatekeeper checks policy and config.
3. Gatekeeper returns a short-lived S3-compatible presigned URL.
4. Browser transfers directly with IDrive e2.
5. Large files never pass through the Worker.

