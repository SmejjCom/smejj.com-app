# smejj.com — Control-Server Integration (PROPOSAL, no repo edit)

This document describes EXACTLY the additive route and wiring the smejj.com
control-server would need to start the voice worker on-demand behind the
existing budget gate and runtime watchdog. It is a proposal only: nothing here
has been applied to the repo. Everything is additive and independently
removable, matching the pattern of `control-server/src/routes/saladRoutes.js`.

## Principle

The voice worker is a GPU container group on Salad (like `workers/glm-salad`),
started only on demand and stopped three ways:

1. the worker's own idle auto-shutdown (SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS),
2. the worker's own runtime cap (SMEJJ_BUDGET_MAX_RUNTIME_MINUTES),
3. the control-server runtime watchdog lease (backstop, same key/limit).

No new durable state is introduced. The control-server reuses the existing
budget gate, watchdog lease store and Salad lifecycle helpers unchanged.

## Reused, already-existing modules (no change)

- `control-server/src/budget/budgetGate.js` — `evaluateWorkerBudget({ env, activeWorkers })`
- `control-server/src/budget/watchdogLeaseStore.js` — `buildWatchdogLease`, `persistWatchdogLease`, `persistWatchdogCompletion`, `loadCurrentWatchdogLease`
- `control-server/src/budget/runtimeWatchdog.js` — `createRuntimeWatchdog(...)`
- `src/jobs/index.js` — `saladCreateContainerGroup`, `saladStartContainerGroup`, `saladStopContainerGroup`, `saladGetContainerGroup`, `getSaladConfig`
- `control-server/src/orchestrator/ephemeralWorker.js` — `waitForWorkerReady`, `ephemeralGroupName` (pattern reference)
- `control-server/src/jobs/jobStore.js` — `activeWorkerCount`

## New file (additive): `control-server/src/routes/voiceWorkerRoutes.js`

Mirrors `saladRoutes.js`. It:

1. denies unless `evaluateWorkerBudget(...)` is `ok` (fail-closed, HTTP 402);
2. denies unless `CONFIRM_SALAD_CREATE=YES`, `CONFIRM_SALAD_START=YES`,
   `CONFIRM_SALAD_STOP=YES` and `SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED=YES`;
3. builds + persists a watchdog lease (`buildWatchdogLease` + `prepareLease`)
   BEFORE any start, exactly as `handleSaladStart` does;
4. creates + starts a GPU container group from a voice-specific plan builder
   (`buildSaladVoiceWorkerPlan`, analogous to `buildSaladGlmWorkerPlan`), whose
   image is the voice worker image and whose `restart_policy` is `never`;
5. arms the watchdog after start; on any failure enforces a verified stop;
6. waits for the worker `/health` (reuse `waitForWorkerReady` shape), then
   returns the authenticated Salad gateway URL (wss) to the caller;
7. exposes a stop route that calls `runtimeWatchdog.enforceStop("manual_stop")`.

Illustrative sketch (NOT to be committed as-is — align imports with the repo):

```js
// control-server/src/routes/voiceWorkerRoutes.js  (PROPOSAL)
import { json } from "../http/respond.js";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { createRuntimeWatchdog } from "../budget/runtimeWatchdog.js";
import {
  buildWatchdogLease, persistWatchdogLease, persistWatchdogCompletion
} from "../budget/watchdogLeaseStore.js";
import {
  saladCreateContainerGroup, saladStartContainerGroup,
  saladStopContainerGroup, saladGetContainerGroup
} from "../../../src/jobs/index.js";
import { activeWorkerCount } from "../jobs/jobStore.js";

const voiceWatchdog = createRuntimeWatchdog({
  stopWorker: () => saladStopContainerGroup({ ...process.env, CONFIRM_SALAD_STOP: "YES" }),
  getWorkerStatus: () => saladGetContainerGroup(process.env),
  persistLease: (lease) => persistWatchdogLease(lease, { env: process.env }),
  persistCompletion: (event) => persistWatchdogCompletion(event, { env: process.env }),
  listActiveJobs: () => [],
  failJob: () => {}
});

export async function handleVoiceSessionStart(res, { env = process.env } = {}) {
  const budget = evaluateWorkerBudget({ env, activeWorkers: activeWorkerCount() });
  if (!budget.ok) return json(res, 402, { ok: false, error: "budget_gate_denied", budget });
  if (env.CONFIRM_SALAD_CREATE !== "YES" || env.CONFIRM_SALAD_START !== "YES") {
    return json(res, 409, { ok: false, reason: "confirm_salad_create_start_required", budget });
  }
  const leasePlan = buildWatchdogLease({ env });               // uses SMEJJ_BUDGET_MAX_RUNTIME_MINUTES
  if (leasePlan?.ok !== true) return json(res, 503, { ok: false, reason: leasePlan?.reason, budget });
  const prepared = await voiceWatchdog.prepareLease(leasePlan.lease);
  if (prepared?.ok !== true || prepared?.persisted !== true) {
    return json(res, 503, { ok: false, reason: prepared?.reason || "watchdog_lease_failed", budget });
  }
  const plan = buildSaladVoiceWorkerPlan({ env });            // NEW builder (see below)
  const created = await saladCreateContainerGroup({ env, plan });
  if (created?.ok !== true) { await voiceWatchdog.enforceStop("voice_create_failed");
    return json(res, 502, { ok: false, reason: "voice_worker_create_failed", budget }); }
  const started = await saladStartContainerGroup(env);
  if (started?.ok !== true) { await voiceWatchdog.enforceStop("voice_start_failed");
    return json(res, 502, { ok: false, reason: "voice_worker_start_failed", budget }); }
  const armed = voiceWatchdog.armPreparedLease();
  if (armed?.ok !== true) { await voiceWatchdog.enforceStop("watchdog_arm_failed");
    return json(res, 503, { ok: false, reason: "watchdog_arm_failed", budget }); }
  // Then poll /health and return the authenticated wss gateway URL to the client.
  return json(res, 200, { ok: true, workerStarted: true, budget });
}

export async function handleVoiceSessionStop(res) {
  await voiceWatchdog.enforceStop("manual_stop");
  await voiceWatchdog.waitForFirstAttempt();
  const state = voiceWatchdog.status();
  return json(res, state.stopVerified ? 200 : 202, { ok: state.stopVerified, runtimeWatchdog: state });
}
```

## New plan builder (additive): `buildSaladVoiceWorkerPlan`

Analogous to `buildSaladGlmWorkerPlan`; put it next to the Salad job helpers.
Key differences from the GLM plan:

- `image`: the built smejj.com voice worker image (see README build step).
- `restart_policy: "never"`, `autostart_policy: false` (fail-closed).
- `networking`: `protocol: "http"`, `auth: true`, `port: 8080` — the Salad
  gateway upgrades to WebSocket for `/ws` and is used for `/health` probes.
- `startup_probe` / `readiness_probe` / `liveness_probe` on `/health`.
- `environment_variables`: inject the budget keys (`SMEJJ_BUDGET_MAX_USD_PER_JOB`,
  `SMEJJ_BUDGET_MAX_RUNTIME_MINUTES`, `SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS`,
  `SMEJJ_WORKER_BUDGET_USD`, `SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES`),
  `SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS`, the router wiring
  (`SMEJJ_LLM_BASE_URL` = the control-server's own OpenAI-compatible router,
  `SMEJJ_LLM_MODEL`), the STT/TTS/VAD settings, and the TTS base URL.

## BYOK handling (no secret in image)

The user's model key is NOT baked into the image. Pass it as a Salad protected
env / secret at start time as `SMEJJ_LLM_API_KEY`, sourced from the existing
per-user credential vault (the same vault the BYOK model surface uses). The
worker forwards it to the router and never persists it (stateless).

## Route registration (additive, ~2 lines where routes are wired)

Where `saladRoutes.js` handlers are registered in the server's request router,
add analogous entries, for example:

- `POST /api/voice/session`  -> `handleVoiceSessionStart`
- `POST /api/voice/session/stop` -> `handleVoiceSessionStop`
- `GET  /api/voice/session/status` -> a status handler over `voiceWatchdog.status()`

and, if there is an access policy allowlist (e.g. `src/shared/controlAccessPolicy.js`),
add the three `/api/voice/*` paths behind the same auth gate the Salad routes use.

## Why this stays inside the <= 10 USD/month envelope

- Nothing starts until `evaluateWorkerBudget(...)` returns `ok` (fail-closed).
- The lease deadline (`SMEJJ_BUDGET_MAX_RUNTIME_MINUTES`) is persisted BEFORE
  start; the watchdog stops the group at the deadline even if the client
  vanishes.
- The worker also self-stops on idle and on its own runtime cap, so the common
  case (user hangs up) stops billing within `SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS`.
- `SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS` bounds parallelism. No auto-recharge,
  no paid fallback; model tokens are billed to the user's BYOK key only.
