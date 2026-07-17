# Multi-Model Architecture

Status: implemented and live; GLM-5.2 and Kimi K2.7 are both natively ready,
with GLM-5.2 retained as the explicit Kimi availability fallback

## Decision

smejj.com uses one registry and one OpenAI-compatible execution layer for
GLM-5.2, Kimi K2.7 and future models. GLM-5.2 remains the default and quality
foundation. Kimi K2.7 is a second coding model and never replaces GLM-5.2.

IDrive e2 remains the authoritative model vault. It stores weights, metadata,
inventories and checksums, but never performs inference. Runtime inference uses
an explicitly configured OpenAI-compatible API or separately approved stateless
worker compute.

## Structure

```text
src/shared/modelRegistry.js
  model metadata, aliases, capabilities, feature flags, runtime env mapping

control-server/src/llm/modelRouter.js
  registry selection, provider adapters, timeouts, streaming and fallback

control-server/src/llm/modelRuntimeHealth.js
  sanitized per-model runtime truth and official Kimi balance probe

control-server/src/llm/streamFilter.js
  SSE validation and removal of private reasoning fields

control-server/src/routes/modelRoutes.js
  safe public registry and read-only IDrive e2 model status

src/server.js
  common /api/chat and /api/agent entrypoints

public/chat-bridge.js
  transport proxy to the common router, with existing GLM direct fallback

src/jobs/*
  model-aware Task Capsules, context limits, coding flow and worker preflight

public/premium-surfaces.js
  compact model selection and status in the non-start AI model area
```

## Registry Contract

Every model entry contains:

- stable logical ID and display name
- aliases accepted from UI and API requests
- provider and runtime environment prefix
- IDrive e2 model path and vault status ID
- storage/runtime status
- context length
- coding capability
- chat, coding, file analysis, project analysis, agent and streaming flags
- feature flag and default-active state
- fallback model ID
- supported runtime engines and local cache facts

New models are added in `src/shared/modelRegistry.js`, mirrored in
`idrive-layout/manifests/models/registry.json`, and covered by registry/router
tests. No route-specific model branch is required.

## Request Flow

```text
UI model choice
  -> chat bridge
  -> /api/chat or /api/agent on Control Server
  -> registry selection
  -> model-specific OpenAI-compatible backend
  -> SSE filter
  -> client
```

For coding and agent requests the same layer receives selected file references,
builds targeted context and creates model-aware Task Capsules. File writes,
terminal actions, tests and patches remain separate controlled tools; a model
response alone never claims that a file was changed.

## Selection Rules

- Default: `glm-5-2`.
- Explicit `GLM-5.2`: use the GLM runtime first.
- Explicit `Kimi K2.7`: use Kimi first only when its feature flag and runtime
  configuration are active.
- If Kimi is inactive, unavailable, times out or returns an error, use GLM-5.2
  when `SMEJJ_MODEL_FALLBACK_ENABLED=YES`.
- Response headers expose the selected backend, logical model and whether a
  fallback occurred. Secrets and base URLs are never exposed.
- Runtime health distinguishes configuration from actual availability:
  `configured-unverified`, `ready` and `degraded` are based on probes or real
  inference, not on the presence of an API key alone.
- Unknown model names resolve safely to the enabled default.

Prepared Auto mode is controlled by `SMEJJ_MODEL_AUTO_ENABLED`. When enabled,
the current conservative policy selects available Kimi K2.7 for coding and
GLM-5.2 for other profiles. Auto mode is inactive by default.

## Failure Handling

- Per-attempt timeout: `SMEJJ_LLM_TIMEOUT_MS`.
- Network, timeout and non-2xx failures are recorded as sanitized attempts.
- The Kimi balance probe is read-only and cached. Zero balance marks Kimi
  `degraded` with reason `insufficient_balance` without sending a paid prompt.
- The next approved backend is tried without exposing keys.
- If all backends fail, the API returns `502` with a safe attempt summary.
- If the common router is unavailable, the live chat bridge can use its
  existing direct GLM connection as a final availability fallback.
- No provider, worker or paid path starts automatically.

## Coding Agent Readiness

Both registered models use the same coding contract:

- targeted repository context instead of blind full-repo loading
- code and architecture analysis
- file/project analysis
- patch and pull-request planning
- error and test explanation
- build, typecheck, lint, unit and integration verification gates
- browser evidence for UI work
- memory updates only after verified success
- replayable, auditable Task Capsules in IDrive e2

Kimi K2.7 full-weight self-hosting is rejected when worker cache or compute is
undersized. API inference and later approved large compute remain separate from
the verified storage vault.

## Security

- Kimi is inactive by default in source configuration. Production enables its
  selection independently from runtime availability. A configured but failed
  runtime reports `degraded`; an unconfigured runtime reports `fallback-only`.
  Both states use GLM-5.2 when fallback is enabled.
- Real keys stay in local or platform environment secrets.
- Public SSE streams drop malformed events and remove `analysis`, `reasoning`,
  `reasoning_content`, `reasoning_details` and `thinking` fields.
- Model weights remain private in IDrive e2.
- `IDRIVE_E2_MODEL_BUCKET` separates model-vault checks from app/project data.
- GitHub remains Free-only source/static hosting; Cloudflare is not used.
- Salad remains pay-per-use behind budget, explicit start and watchdog gates.
- No trial, auto-billing or paid fallback is introduced.
