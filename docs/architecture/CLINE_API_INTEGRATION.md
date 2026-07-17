# Cline API Integration

Status: implemented, deployment remains fail-closed until the credential-vault
master key is configured outside the repository.

## Official contract

The implementation follows the official Cline API documentation:

- Base URL: `https://api.cline.bot/api/v1`
- Chat: `POST /chat/completions`
- Authentication: `Authorization: Bearer <user key>`
- Model IDs: `provider/model-name`
- Streaming: OpenAI-compatible SSE ending in `data: [DONE]`
- Tools: OpenAI function-calling schema
- Images/screenshots: base64 data URLs in `image_url` message parts
- Reasoning: `delta.reasoning`; private reasoning is not persisted by smejj.com

Sources:

- https://docs.cline.bot/api/overview
- https://docs.cline.bot/api/authentication
- https://docs.cline.bot/api/chat-completions
- https://docs.cline.bot/api/models
- https://docs.cline.bot/api/errors

The official Cline source currently loads the live catalog from
`GET https://api.cline.bot/api/v1/ai/cline/recommended-models`. smejj.com uses
that same live endpoint and does not maintain a hard-coded model allowlist.
Because this endpoint is used by the Cline clients but not part of the
documented public API, the Control Server keeps the last successful catalog in
memory and serves it (flagged `stale: true`) if the live endpoint fails.

## Flow

1. An authenticated user opens Settings → Models.
2. smejj.com loads the current Cline catalog and groups Cline Pass, free and
   recommended models.
3. The user enters the key once. The browser sends it over authenticated HTTPS
   to the Control Server and never stores it in local/session storage.
4. The Control Server first tests the key with the current free catalog model
   (or the selected model if no free model exists).
5. Only after a successful test is the credential encrypted with AES-256-GCM.
6. The selected model can be changed independently and is effective without a
   restart.
7. Chat streams through the Control Server. Autonomous workers receive only
   the job/model reference and call back to the Control Server for each bounded
   tool action.

## Storage and key separation

Production storage is IDrive e2:

`auth/provider-credentials/<sha256-user>/<provider>.json.enc`

The envelope contains ciphertext, IV, authentication tag, key ID and scoped
AAD. It never contains a plaintext key. The encryption key is configured only
in the external secure environment file or runtime secret store:

```text
SMEJJ_PROVIDER_CREDENTIAL_KEY_ID=<rotation identifier>
SMEJJ_PROVIDER_CREDENTIAL_KEY_B64=<exact 32-byte key, base64>
```

Without both values, every credential route fails closed. Without IDrive e2,
credential storage also fails closed unless
`SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY=YES` is set explicitly (development
only); the in-memory fallback is encrypted but not durable.

Master key rotation: set `SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_ID` and
`SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_B64` to the outgoing key. Envelopes
encrypted with the previous key remain readable and are transparently
re-encrypted with the current key on the next read. New envelopes always use
the current key. Remove the previous-key variables once rotation is complete.

## Models and capabilities

Every model returned by the live endpoint is presented dynamically. At the
time of implementation the endpoint included GLM 5.2, Kimi K2.7 Code,
DeepSeek V4, Qwen 3.7 and MiniMax M3 variants. This list is informational only;
the API response remains the source of truth.

- Streaming chat is available in the protected start composer after selecting
  Cline.
- Screenshot/image input is accepted only as bounded PNG/JPEG/WebP data URLs.
- Autonomous coding uses the existing read/write/command/browser/finish tools,
  action budget, isolated worker, verification pipeline and screenshot evidence.
- Tool definitions are server-owned. Browser clients cannot inject arbitrary
  autonomous tools.

## Failure and abuse handling

- Authenticated provider routes only; foreign origins remain blocked.
- Per-user token-bucket rate limit in addition to Cline's provider limits.
- `401`, `402`, `429`, `500`, `502` and `503` are mapped to safe user errors.
- Only transient provider errors are retried, with bounded exponential backoff.
- Cline request IDs are returned for support; keys and provider response bodies
  are never logged.
- No automatic switch to another paid provider occurs.
- Billing and quotas remain entirely in the user's Cline account.

## Deployment checklist

1. Generate and store the credential master key outside the workspace.
2. Configure IDrive e2 and verify least-privilege access to
   `auth/provider-credentials/`.
3. Keep `SMEJJ_AUTONOMOUS_LOOP_ENABLED=NO` until the existing worker/budget
   deployment gates are separately approved.
4. Run `pnpm run check:cline`, `pnpm run check:all` and
   `pnpm run check:guidelines`.
5. Follow `docs/deployment/DEPLOYMENT_PLAN.md`; no production deployment is
   authorized by this implementation task.
