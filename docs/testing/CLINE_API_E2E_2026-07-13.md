# Cline API End-to-End Test — 2026-07-13

## Scope

The automated E2E path exercises the same modules used in production with an
in-process Cline-compatible endpoint. No real API key, credit or paid fallback
is used in the repository test.

## Covered path

1. Authenticated provider route.
2. Dynamic model catalog with recommended, free and Cline Pass groups.
3. Key validation through a real Chat Completions-shaped request.
4. AES-256-GCM encryption before storage.
5. Status response exposes only a four-character hint.
6. Model change without restart.
7. Streaming SSE chat.
8. Base64 screenshot/image message input.
9. Cline tool calling in the autonomous worker control path.
10. Task Capsule contains provider/model metadata but no key.
11. Credential-envelope tamper rejection.

Command:

```text
pnpm run check:cline
```

Expected result: seven tests pass.

## Live verification

The public official catalog endpoint was queried successfully on 2026-07-13.
It returned HTTP 200 and current model groups including Cline Pass entries for
GLM 5.2, Kimi K2.7 Code, DeepSeek V4, Qwen 3.7 and MiniMax M3.

Authentication and billable inference cannot be verified without a user's
private Cline API key. The first key entered in Settings → Models automatically
runs that final connection test before encrypted persistence. A failed test
does not save the key.

## Release status

Implementation and local verification do not authorize production. Staging,
written release approval and live testing remain mandatory under the deployment
plan.
