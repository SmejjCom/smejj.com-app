# Kimi K2.7 Multi-Model Live Release

Status: live and verified on 2026-07-10

## Architecture Decision

smejj.com now routes GLM-5.2 and Kimi K2.7 through one registry, one runtime
health layer and one OpenAI-compatible execution layer. GLM-5.2 remains the
default, quality model and availability fallback. Kimi K2.7 is a separate
selectable coding model. The official Kimi endpoint and key are configured,
the user completed funding and native production requests now execute directly
on `kimi:kimi-k2.7-code`. GLM-5.2 remains the verified failure fallback.

## Release Artifacts

- Frontend repository: `SmejjCom/smejj-app-frontend`
- Production frontend commit:
  `9c4d39d0e05abb3eab9638204584ecd1890024e9`
- Control artifact:
  `s3://smejj-model-files/deployments/control/kimi-k2-7-runtime-health-2026-07-10-rc3/smejj-control-context.tar.gz`
- Control artifact SHA-256:
  `2ae20297baaa7ff9b73c2ee02c0d5c6e5a1480605627b01a1e26d6e035b68d7e`
- Source rollback archive:
  `backups/rollback-2026-07-10-kimi-multimodel/source-before.tar.gz`
- Source rollback SHA-256:
  `42fd15ed9b133b5ce7b249bd6e8107c30f1a4924c4bb5cf30a49871e3efafc93`
- Runtime-health rollback archive SHA-256:
  `69cd1347bbba6b7d3b1b8fb493ec6b7a39846fd9e1f48e46a475fd32d8a191ce`
- Stream-filter rollback archive SHA-256:
  `dfd38e576bc1895ba29772f43d4079979d6617598588459992a70fe91f9e7b1e`
- Final-audit rollback archive SHA-256:
  `73a55df63eb3e44d433a317d603a0c49561d20b21648e55964f842fb176fc493`
- Native-activation audit rollback SHA-256:
  `2f163e0ec9e30d073e4f1567026984e873dc18635db1d17dc4c9f3ab12d45274`

## Production State

- `smejj-control`: Salad Version 29, 1/1 Replica ready.
- `smejj-chat-bridge-v88b-live`: Salad Version 3, 1/1 Replica ready.
- `SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES` on the bridge.
- `SMEJJ_KIMI_K2_7_ENABLED=YES` on the Control Server.
- GLM-5.2 registry status: `ready`, active and selectable.
- Kimi K2.7 registry status: `ready`, configured, active and selectable.
- Kimi runtime: official `https://api.moonshot.ai/v1`, served model
  `kimi-k2.7-code`; runtime availability true after balance and inference
  verification.
- Auto mode remains prepared but disabled.

## Live Verification

- `/api/health`: healthy, GLM-5.2 active, both models registered.
- `/api/models/status`: both IDrive e2 prefixes readable; Kimi checksum and
  inventory verification remain complete.
- GLM-5.2 Chat: HTTP 200, SSE stream, `[DONE]`, no fallback.
- GLM-5.2 Coding Agent: HTTP 200, SSE stream, `[DONE]`, no fallback.
- Kimi native Chat: HTTP 200, SSE stream, `[DONE]`, backend
  `kimi:kimi-k2.7-code`, model ID `kimi-k2-7`, no fallback.
- Kimi native Coding Agent: HTTP 200, SSE stream, `[DONE]`, backend
  `kimi:kimi-k2.7-code`, model ID `kimi-k2-7`, no fallback.
- Live UI: GLM-5.2 and Kimi K2.7 selectable on desktop 1440x900 and mobile
  390x844; no horizontal overflow.
- End-to-end native bridge request: `x-smejj-bridge:multi-model-router`, backend
  `kimi:kimi-k2.7-code`, model ID `kimi-k2-7`, fallback `false`.
- Native answers: `KIMI_NATIVE_CHAT_OK`, `KIMI_NATIVE_CODE_OK`,
  `KIMI_NATIVE_BRIDGE_OK` and visible browser answer `KIMI_NATIVE_UI_OK`.
- GLM-5.2 regression answer: `GLM_AFTER_KIMI_OK`, backend `zhipu:glm-5.2`,
  fallback `false`.
- Browser console: zero errors and warnings. Public model streams contain no
  upstream reasoning fields.
- Final `release:preflight`: architecture 7/7, AI 20/20, jobs 19/19, Control
  106/106, worker 24/24, Salad 23/23, frontend 77/77, router 28/28,
  release safety 4/4, rollback simulation and syntax checks passed.

Evidence is stored under
`tmp/task-capsules/kimi-k2-7-multimodel-2026-07-10/`.

## Safety And Rollback

No model object, user data, chat, project, upload or existing access was
deleted. Model files were not moved or rewritten. GitHub Pages remains
Deploy-from-Branch on the Free tier. IDrive e2 remains primary storage. Salad
remains CPU-only for Control and Bridge; no Kimi GPU service was started. The
user completed a 20 USD provider recharge and received a 5 USD voucher, giving
25 USD available before the tests. Auto-Recharge remains off. No trial or
automatic paid fallback was activated.

Fast Kimi deactivation:

```sh
SMEJJ_KIMI_K2_7_ENABLED=NO
SMEJJ_MODEL_DEFAULT=glm-5-2
SMEJJ_MODEL_AUTO_ENABLED=NO
```

Bridge rollback:

```sh
SMEJJ_MULTI_MODEL_ROUTER_ENABLED=NO
```

Native Kimi inference is verified. The zero-balance phase already proved the
failure path and GLM-5.2 fallback. If the Kimi provider later becomes
unavailable, the feature flag and bridge rollback above remain the immediate
safe controls.
