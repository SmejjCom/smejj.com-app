import {
  saladCreateContainerGroup,
  saladGetContainerGroup,
  saladStartContainerGroup,
  saladStopContainerGroup
} from "../../../src/jobs/index.js";
import { issueWorkerToken, workerTokenSecret } from "../auth/workerToken.js";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { createRuntimeWatchdog } from "../budget/runtimeWatchdog.js";
import {
  buildWatchdogLease,
  persistWatchdogCompletion,
  persistWatchdogLease
} from "../budget/watchdogLeaseStore.js";
import { createWorkerCapacityStore } from "../budget/workerCapacityStore.js";
import { verifyEphemeralRuntimeAttestation } from "./ephemeralRuntimeAttestation.js";
import {
  buildEphemeralWorkerPlan,
  waitForWorkerReady,
  waitForWorkerStartable
} from "./ephemeralWorker.js";

export function createReviewedEphemeralWorkerDispatch({
  env = process.env,
  job,
  createGroup = saladCreateContainerGroup,
  startGroup = saladStartContainerGroup,
  stopGroup = saladStopContainerGroup,
  getGroup = saladGetContainerGroup,
  attestRuntime = verifyEphemeralRuntimeAttestation,
  capacityStore = createWorkerCapacityStore({ env }),
  leaseBuilder = buildWatchdogLease,
  persistLease = persistWatchdogLease,
  persistCompletion = persistWatchdogCompletion,
  watchdogFactory = createRuntimeWatchdog,
  waitUntilStartable = waitForWorkerStartable,
  waitUntilReady = waitForWorkerReady,
  fetchImpl = fetch,
  tokenIssuer = issueWorkerToken,
  now = () => new Date().toISOString()
} = {}) {
  if (!validJob(job)) return null;
  const plan = buildEphemeralWorkerPlan({
    jobId: job.id,
    env,
    browserRequired: job.preview?.required === true
  });
  const secret = workerTokenSecret(env);
  if (!plan.ok || !secret || !capacityStore) return null;

  const groupEnv = plan.groupEnv;
  let watchdog = null;
  let capacityLease = null;
  let startPromise = null;
  let closePromise = null;
  let workerOrigin = "";
  const lifecycleController = new AbortController();
  const activeControllers = new Map();

  async function ensureStarted() {
    assertLifecycleActive(lifecycleController.signal);
    if (workerOrigin) return workerOrigin;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const attestation = await attestRuntime({ env });
      assertLifecycleActive(lifecycleController.signal);
      if (attestation?.ok !== true) throw new Error(attestation?.reason || "ephemeral_runtime_attestation_failed");

      const snapshot = await capacityStore.snapshot();
      assertLifecycleActive(lifecycleController.signal);
      if (snapshot?.ok !== true) throw new Error(snapshot?.reason || "global_worker_capacity_snapshot_failed");
      const budget = evaluateWorkerBudget({ env, activeWorkers: snapshot.snapshot.activeSlots });
      if (!budget.ok) throw new Error("ephemeral_worker_budget_denied");

      const leasePlan = leaseBuilder({ env: groupEnv });
      if (leasePlan?.ok !== true || !leasePlan.lease) throw new Error(leasePlan?.reason || "watchdog_lease_build_failed");
      watchdog = watchdogFactory({
        stopWorker: () => stopGroup(groupEnv),
        getWorkerStatus: () => getGroup(groupEnv),
        persistLease: (lease) => persistLease(lease, { env: groupEnv }),
        persistCompletion: (event) => persistCompletion(event, { env: groupEnv }),
        listActiveJobs: () => [],
        failJob: () => {}
      });
      const prepared = await watchdog.prepareLease(leasePlan.lease);
      assertLifecycleActive(lifecycleController.signal);
      if (prepared?.ok !== true || prepared?.persisted !== true) {
        throw new Error(prepared?.reason || "watchdog_lease_persistence_failed");
      }

      const capacity = await capacityStore.acquire(job, leasePlan.lease);
      if (capacity?.ok !== true) {
        await stopAndRelease("global_capacity_acquire_failed");
        throw new Error(capacity?.reason || "global_worker_capacity_acquire_failed");
      }
      capacityLease = capacity.lease;
      assertLifecycleActive(lifecycleController.signal);

      const created = await createGroup({ env: groupEnv, plan });
      if (created?.ok !== true) {
        await stopAndRelease("worker_create_failed");
        throw new Error(providerReason("ephemeral_worker_create_failed", created));
      }
      if (lifecycleController.signal.aborted) {
        await stopAndRelease("job_cancelled");
        throw new Error("ephemeral_worker_cancelled");
      }
      try {
        await waitUntilStartable(groupEnv, { getGroup, env: groupEnv, signal: lifecycleController.signal });
      } catch (error) {
        await stopAndRelease(lifecycleController.signal.aborted ? "job_cancelled" : "worker_create_settle_failed");
        throw error;
      }
      const started = await startGroup(groupEnv);
      if (started?.ok !== true) {
        await stopAndRelease("worker_start_failed");
        throw new Error(providerReason("ephemeral_worker_start_failed", started));
      }
      if (lifecycleController.signal.aborted) {
        await stopAndRelease("job_cancelled");
        throw new Error("ephemeral_worker_cancelled");
      }
      const armed = watchdog.armPreparedLease();
      if (armed?.ok !== true || armed?.armed !== true) {
        await stopAndRelease("watchdog_arm_failed_after_start");
        throw new Error("watchdog_arm_failed_after_start");
      }
      try {
        workerOrigin = await waitUntilReady(groupEnv, {
          getGroup,
          fetchImpl,
          env: groupEnv,
          signal: lifecycleController.signal
        });
      } catch (error) {
        await stopAndRelease(lifecycleController.signal.aborted ? "job_cancelled" : "worker_readiness_failed");
        throw error;
      }
      return workerOrigin;
    })();
    return startPromise;
  }

  async function dispatch(payload) {
    const origin = await ensureStarted();
    assertLifecycleActive(lifecycleController.signal);
    const token = tokenIssuer({ secret, jobId: payload.jobId, scopes: ["validate", "model"] });
    const controller = new AbortController();
    activeControllers.set(payload.jobId, controller);
    const timeoutMs = boundedInteger(env.SMEJJ_WORKER_REQUEST_TIMEOUT_MS, 65 * 60_000, 60_000, 70 * 60_000);
    const timer = setTimeout(() => controller.abort("worker_request_timeout"), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(`${origin}/run`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Salad-Api-Key": String(env.SALAD_API_KEY || "")
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return workerFailure(`status_${response.status}`);
      const result = await response.json().catch(() => null);
      return result && typeof result === "object" ? result : workerFailure("invalid_json");
    } catch (error) {
      return workerFailure(String(error?.name || error || "request_failed").toLowerCase());
    } finally {
      clearTimeout(timer);
      if (activeControllers.get(payload.jobId) === controller) activeControllers.delete(payload.jobId);
    }
  }

  async function stopAndRelease(reason) {
    if (!watchdog || watchdog.status().phase === "idle") {
      return { stopVerified: true, completionPersisted: true, capacityReleased: !capacityLease };
    }
    const stopped = watchdog.status().stopVerified
      ? watchdog.status()
      : await watchdog.enforceStop(reason);
    if (stopped?.stopVerified !== true || stopped?.completionPersisted !== true) {
      throw new Error("ephemeral_worker_stop_not_verified");
    }
    let capacity = { ok: true, idempotent: true };
    if (capacityLease) {
      capacity = await capacityStore.release(job, capacityLease, stopEvidence(stopped, now()));
      if (capacity?.ok !== true) throw new Error(capacity?.reason || "global_worker_capacity_release_failed");
      capacityLease = null;
    }
    return {
      stopVerified: true,
      completionPersisted: true,
      stopAttempts: stopped.attempts,
      stoppedAt: stopped.lastEnforcement?.attemptedAt || now(),
      capacityReleased: capacity.ok === true,
      deletionPerformed: false
    };
  }

  dispatch.cancel = (jobId) => {
    if (jobId !== job.id) return false;
    let cancelled = false;
    if (!lifecycleController.signal.aborted) {
      lifecycleController.abort("job_cancelled");
      cancelled = true;
    }
    const controller = activeControllers.get(jobId);
    if (controller && !controller.signal.aborted) {
      controller.abort("job_cancelled");
      cancelled = true;
    }
    return cancelled;
  };
  dispatch.close = (_jobId, reason = "job_completed") => {
    if (!closePromise) closePromise = stopAndRelease(reason);
    return closePromise;
  };
  dispatch.plan = publicPlan(plan);
  dispatch.status = () => ({
    groupName: plan.groupName,
    started: Boolean(workerOrigin),
    closing: Boolean(closePromise),
    watchdog: watchdog?.status() || null,
    capacityHeld: Boolean(capacityLease)
  });
  return dispatch;
}

function validJob(job) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(job?.id || ""))
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(job?.userId || ""))
    && /^jobs\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{2}\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/$/.test(String(job?.taskCapsule?.rootPrefix || ""));
}

function publicPlan(plan) {
  return {
    provider: plan.provider,
    mode: plan.mode,
    groupName: plan.groupName,
    image: plan.payload.container.image,
    authenticatedIngress: plan.payload.networking.auth === true,
    autostart: plan.autostart,
    replicas: plan.replicas,
    startsCompute: plan.startsCompute,
    runtimeProfile: plan.runtimeProfile,
    deletionPerformed: false
  };
}

function providerReason(prefix, result) {
  const status = Number(result?.status || 0);
  return `${prefix}${status ? `_status_${status}` : ""}`;
}

function workerFailure(detail) {
  return { ok: false, errors: [{ source: "worker_http", detail: String(detail || "request_failed").slice(0, 120) }] };
}

function stopEvidence(stopped, fallbackTime) {
  return {
    stopVerified: stopped.stopVerified === true,
    completionPersisted: stopped.completionPersisted === true,
    stopAttempts: Number(stopped.attempts || 1),
    completedAt: stopped.lastEnforcement?.attemptedAt || fallbackTime
  };
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.min(max, Math.max(min, resolved));
}

function assertLifecycleActive(signal) {
  if (signal?.aborted) throw new Error("ephemeral_worker_cancelled");
}
