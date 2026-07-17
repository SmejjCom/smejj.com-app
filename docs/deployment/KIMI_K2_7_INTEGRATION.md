# Kimi K2.7 Integration

Status: production live; official Kimi runtime configured, funded and natively
verified as ready

## Model Paths

```text
GLM-5.2
s3://smejj-model-files/model-files/glm-5-2-fp8/original/

Kimi K2.7
s3://smejj-model-files/model-files/kimi-k2-7/original/

Kimi checksum manifest
s3://smejj-model-files/model-files/kimi-k2-7/checksums/streamed-checksums.sha256

Kimi inventory and metadata
s3://smejj-model-files/model-files/kimi-k2-7/checksums/upstream-file-inventory.json
s3://smejj-model-files/model-files/kimi-k2-7/configs/huggingface-api-metadata.json
s3://smejj-model-files/model-files/kimi-k2-7/configs/source-summary.json
```

Read-only verification on 2026-07-10 passed for 86/86 source files, 64/64
safetensors shards, object byte sizes and all available upstream SHA-256 values.
The complete prefix contains 102 objects. No object was deleted, moved or
rewritten.

## Required Environment

Shared selection:

```sh
SMEJJ_MODEL_DEFAULT=glm-5-2
SMEJJ_GLM_5_2_ENABLED=YES
SMEJJ_KIMI_K2_7_ENABLED=YES
SMEJJ_MODEL_FALLBACK_ENABLED=YES
SMEJJ_MODEL_AUTO_ENABLED=NO
SMEJJ_LLM_TIMEOUT_MS=120000
```

GLM-5.2 runtime:

```sh
SMEJJ_LLM_ZHIPU_BASE_URL=https://api.z.ai/api/paas/v4
SMEJJ_LLM_ZHIPU_API_KEY=<secret>
SMEJJ_LLM_ZHIPU_MODEL=glm-5.2
```

Kimi K2.7 runtime:

```sh
SMEJJ_LLM_KIMI_BASE_URL=https://api.moonshot.ai/v1
SMEJJ_LLM_KIMI_API_KEY=<secret>
SMEJJ_LLM_KIMI_MODEL=kimi-k2.7-code
SMEJJ_LLM_KIMI_HEADER=Authorization
```

The production values above were verified against the official Kimi Open
Platform documentation. The API key exists only in the Salad platform secret
environment and is never returned by the public registry or committed to the
repository. A future approved self-hosted vLLM/SGLang/KTransformers endpoint
may use the same adapter; its served model name must be configured exactly.

Model vault status:

```sh
IDRIVE_E2_MODEL_BUCKET=smejj-model-files
KIMI_K2_7_PREFIX=model-files/kimi-k2-7/original/
GLM_5_2_FP8_PREFIX=model-files/glm-5-2-fp8/original/
```

Live bridge after the Control Server version is healthy:

```sh
SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES
```

## Activation

1. Verify `/api/health` and `/api/models/status` with GLM-5.2 unchanged.
2. Configure the Kimi endpoint, key and exact served model name in one platform
   environment update.
3. Set `SMEJJ_KIMI_K2_7_ENABLED=YES`.
4. Test Kimi chat, coding and streaming directly against the Control Server.
5. Enable `SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES` on the chat bridge.
6. Test the live UI selection and inspect `x-smejj-model-id` and
   `x-smejj-model-fallback`.
7. Require runtime health `ready` before accepting native Kimi execution as
   verified. `degraded` keeps the feature selectable but uses GLM-5.2.

Expected Kimi headers:

```text
x-smejj-model-id: kimi-k2-7
x-smejj-model-fallback: false
```

Expected safe fallback headers when Kimi is unavailable:

```text
x-smejj-model-id: glm-5-2
x-smejj-model-fallback: true
```

## Deactivation And Rollback

Fast deactivation without code rollback:

```sh
SMEJJ_KIMI_K2_7_ENABLED=NO
SMEJJ_MODEL_DEFAULT=glm-5-2
SMEJJ_MODEL_AUTO_ENABLED=NO
```

Bridge rollback:

```sh
SMEJJ_MULTI_MODEL_ROUTER_ENABLED=NO
```

This returns live chat to the existing direct GLM-5.2 bridge path. Do not delete
Kimi environment values or IDrive e2 objects during an incident; disable the
feature flag first and preserve evidence.

Local source rollback is stored at:

```text
backups/rollback-2026-07-10-kimi-multimodel/source-before.tar.gz
backups/rollback-2026-07-10-kimi-runtime-health-ui/source-before.tar.gz
backups/rollback-2026-07-10-kimi-final-audit/source-before.tar.gz
backups/rollback-2026-07-10-kimi-native-activation-audit/source-before.tar.gz
```

## Verification

```sh
pnpm run check:ai
pnpm run check:jobs
pnpm run check:llm-router
pnpm run check:control-server
pnpm run check:frontend
pnpm run check:architecture
pnpm run check:guidelines
pnpm run check:all
pnpm run release:preflight
pnpm run idrive:verify-kimi
```

Production follows `docs/deployment/DEPLOYMENT_PLAN.md`: local staging, browser
checks, release-specific written approval, manual deploy, live test and release
note. No automatic production deployment is allowed.

## Verified State On 2026-07-10

- Local multi-model implementation: complete.
- IDrive e2 integrity verification: passed read-only.
- Full verification pipeline: passed after the model-layer implementation.
- Final release preflight: all architecture, AI, jobs, Control Server, worker,
  Salad, frontend, router, security, syntax, release-safety and rollback checks
  passed. Frontend is 77/77 and router/stream filter is 28/28.
- Browser verification: desktop 1440x900 and mobile 390x844 passed; zero console
  errors or warnings, no horizontal overflow and both model choices work.
- Evidence: `tmp/task-capsules/kimi-k2-7-multimodel-2026-07-10/`.
- Final Control release artifact:
  `s3://smejj-model-files/deployments/control/kimi-k2-7-runtime-health-2026-07-10-rc3/smejj-control-context.tar.gz`,
  SHA-256
  `2ae20297baaa7ff9b73c2ee02c0d5c6e5a1480605627b01a1e26d6e035b68d7e`.
- Production frontend: GitHub Pages commit
  `9c4d39d0e05abb3eab9638204584ecd1890024e9`.
- Production Control Server: Salad Version 29, 1/1 ready.
- Production Chat Bridge: Salad Version 3, 1/1 ready, common router enabled.
- The user completed a 20 USD recharge. The account reports 25 USD available
  including the one-time 5 USD voucher; Auto-Recharge remains off.
- Kimi is selectable, configured and reports `ready`. Native Control and Bridge
  requests carry `x-smejj-model-backend:kimi:kimi-k2.7-code`,
  `x-smejj-model-id:kimi-k2-7` and `x-smejj-model-fallback:false`.
- Native chat, coding-agent, streaming and browser tests passed with
  `KIMI_NATIVE_CHAT_OK`, `KIMI_NATIVE_CODE_OK`, `KIMI_NATIVE_BRIDGE_OK` and
  `KIMI_NATIVE_UI_OK`. GLM-5.2 was retested successfully in parallel.
- The previously verified zero-balance incident remains the live failure-case
  proof: Kimi became `degraded` and GLM-5.2 continued without interruption.
- No trial, auto-recharge, automatic paid fallback or Kimi GPU deployment was
  created.
- The final backend delivery used an IDrive e2 release artifact and Salad
  bootstrap. It did not use GitHub Actions, Packages, GHCR or LFS.
