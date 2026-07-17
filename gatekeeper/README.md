# smejj.com Free Gatekeeper

Runtime-neutrales Gatekeeper-Modul (frueher "cloudflare-worker/", umbenannt beim
Cloudflare-Exit 2026-07-02). Laeuft ueberall, wo fetch/Request/Response verfuegbar
sind — vorgesehen ist der Node-Control-Server. Es darf keine kostenpflichtigen
Dienste einfuehren.

Role:

- Check policy.
- Check auth and quota envelopes.
- Create short-lived presigned IDrive e2 URLs.
- Fail closed when configuration, limits or provider status are unclear.

Not allowed:

- No Cloudflare services of any kind.
- No paid storage, queue or database dependency.
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
5. Large files never pass through the gatekeeper.
