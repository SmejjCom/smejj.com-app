import crypto from "node:crypto";
import {
  getSaladConfig,
  saladGetContainerGroup,
  saladStopContainerGroup
} from "../../../src/jobs/index.js";
import { createRuntimeWatchdog } from "../budget/runtimeWatchdog.js";
import {
  loadActiveWatchdogLeases,
  persistWatchdogCompletion
} from "../budget/watchdogLeaseStore.js";
import { createWorkerCapacityStore } from "../budget/workerCapacityStore.js";

export const EPHEMERAL_WORKER_IMAGE = "docker.io/library/node@sha256:c1f4f4e7afa4f73df11ad95392ff316a4af82df0cb5ca114de1fe7c4dc4dcd20";
export const EPHEMERAL_WORKER_CREATION_ENABLED = true;
const WORKER_PORT = 8080;
const DEFAULT_CREATE_SETTLE_TIMEOUT_MS = 60_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 12 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const BOOTSTRAP_COMMAND = [
  "set -eu",
  "node --input-type=module --eval 'import crypto from \"node:crypto\"; import {writeFile} from \"node:fs/promises\"; const u=process.env.SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_URL; const attempts=12; let s=\"\"; let failure; for(let i=1;i<=attempts;i+=1){try{const r=await fetch(u,{redirect:\"error\",cache:\"no-store\",signal:AbortSignal.timeout(15000)}); if(!r.ok) throw new Error(`bootstrap_fetch_${r.status}`); s=await r.text(); failure=undefined; break;}catch(error){failure=error; if(i<attempts) await new Promise((resolve)=>setTimeout(resolve,5000));}} if(failure) throw failure; const h=crypto.createHash(\"sha256\").update(s).digest(\"hex\"); if(h!==process.env.SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256) throw new Error(\"bootstrap_sha256_mismatch\"); await writeFile(\"/tmp/smejj-ephemeral-bootstrap.mjs\",s,{mode:0o500});'",
  "exec node /tmp/smejj-ephemeral-bootstrap.mjs"
].join("; ");

export function buildEphemeralWorkerPlan({ jobId, env = process.env, browserRequired = false } = {}) {
  const reasons = [];
  if (!EPHEMERAL_WORKER_CREATION_ENABLED) reasons.push("ephemeral_worker_creation_disabled");
  if (!/^SEC-\d{4}-\d{2}-\d{2}-EPHEMERAL-[A-Z0-9._-]{2,40}$/.test(String(env.SMEJJ_EPHEMERAL_SECURITY_REVIEW_ID || ""))) {
    reasons.push("ephemeral_worker_security_review_required");
  }
  const groupName = ephemeralGroupName(jobId);
  const groupEnv = { ...env, SALAD_CONTAINER_GROUP_NAME: groupName };
  let config;
  try {
    config = getSaladConfig(groupEnv);
  } catch {
    config = { configured: false, missing: ["invalid_salad_configuration"], organization: "", project: "" };
  }
  if (env.SMEJJ_EPHEMERAL_WORKER_ENABLED !== "YES") reasons.push("ephemeral_worker_not_enabled");
  if (!config.configured) reasons.push("salad_api_not_configured");
  if (env.CONFIRM_SALAD_CREATE !== "YES") reasons.push("confirm_salad_create_required");
  if (env.CONFIRM_SALAD_START !== "YES") reasons.push("confirm_salad_start_required");
  if (env.CONFIRM_SALAD_STOP !== "YES") reasons.push("confirm_salad_stop_required");
  if (env.SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED !== "YES") reasons.push("watchdog_recovery_not_enabled");
  if (env.SMEJJ_EPHEMERAL_TRUSTED_REPOS_ONLY !== "YES") reasons.push("trusted_repositories_only_required");
  if (env.SMEJJ_WORKER_REQUIRE_REPO_ALLOWLIST !== "YES") reasons.push("repository_allowlist_required");
  if (!String(env.SMEJJ_WORKER_TOKEN_SECRET || env.SMEJJ_WORKER_CALLBACK_SECRET || "").trim()) reasons.push("worker_token_secret_required");
  const ownerAllowlist = normalizedOwnerAllowlist(env.SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST);
  if (!ownerAllowlist) reasons.push("repository_owner_allowlist_required");

  const sourceRepository = normalizedRepository(env.SMEJJ_EPHEMERAL_RUNTIME_SOURCE_REPOSITORY);
  if (!sourceRepository) reasons.push("ephemeral_worker_source_repository_required");
  const sourceBase = normalizedSourceBase(env.SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE, sourceRepository);
  if (!sourceBase) reasons.push("ephemeral_worker_source_must_be_commit_pinned");
  const bootstrapSha256 = normalizedSha256(env.SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256);
  if (!bootstrapSha256) reasons.push("ephemeral_worker_bootstrap_sha256_required");
  const manifestSha256 = normalizedSha256(env.SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256);
  if (!manifestSha256) reasons.push("ephemeral_worker_manifest_sha256_required");
  const controlOrigin = normalizedHttpsOrigin(env.SMEJJ_CONTROL_ORIGIN || env.SMEJJ_CONTROL_ROUTER_URL);
  if (!controlOrigin) reasons.push("ephemeral_worker_control_origin_required");

  const environmentVariables = {
    SMEJJ_CONTROL_ORIGIN: controlOrigin,
    SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE: sourceBase,
    SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_URL: sourceBase ? `${sourceBase}/bootstrap.mjs` : "",
    SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256: bootstrapSha256,
    SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: manifestSha256,
    SMEJJ_HOST: "::",
    HOST: "::",
    PORT: String(WORKER_PORT),
    SMEJJ_WORKER_PORT: String(WORKER_PORT),
    SMEJJ_WORKER_BROWSER_REQUIRED: browserRequired === true ? "YES" : "NO",
    SMEJJ_WORKER_REQUIRE_REPO_ALLOWLIST: "YES",
    SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST: ownerAllowlist,
    SMEJJ_WORKER_MAX_MODEL_ACTIONS: String(boundedInteger(env.SMEJJ_WORKER_MAX_MODEL_ACTIONS, 25, 1, 25)),
    SMEJJ_WORKER_MODEL_MAX_TOKENS: String(boundedInteger(env.SMEJJ_WORKER_MODEL_MAX_TOKENS, 8192, 512, 16_384)),
    SMEJJ_WORKER_MAX_RUNTIME_MS: String(boundedInteger(env.SMEJJ_WORKER_MAX_RUNTIME_MS, 55 * 60_000, 5 * 60_000, 60 * 60_000))
  };
  const payload = {
    name: groupName,
    display_name: `smejj.com Job ${shortJobLabel(jobId)}`,
    autostart_policy: false,
    restart_policy: "never",
    replicas: 1,
    container: {
      image: EPHEMERAL_WORKER_IMAGE,
      image_caching: true,
      command: ["/bin/sh", "-lc", BOOTSTRAP_COMMAND],
      resources: {
        cpu: boundedNumber(env.SMEJJ_EPHEMERAL_WORKER_VCPU, 4, 1, 16),
        memory: boundedInteger(env.SMEJJ_EPHEMERAL_WORKER_MEMORY_MB, 8192, 4096, 65_536),
        storage_amount: boundedInteger(env.SMEJJ_EPHEMERAL_WORKER_STORAGE_BYTES, 32_212_254_720, 10_737_418_240, 107_374_182_400),
        shm_size: boundedInteger(env.SMEJJ_EPHEMERAL_WORKER_SHM_MB, 1024, 256, 8192)
      },
      environment_variables: environmentVariables
    },
    networking: {
      protocol: "http",
      auth: true,
      port: WORKER_PORT,
      load_balancer: "least_number_of_connections",
      single_connection_limit: true,
      client_request_timeout: 100_000,
      server_response_timeout: 100_000
    },
    startup_probe: httpProbe(10, 20),
    readiness_probe: httpProbe(2, 10),
    liveness_probe: httpProbe(30, 3)
  };
  return {
    ok: reasons.length === 0,
    provider: "salad",
    mode: "ephemeral-stateless-cpu-sandbox",
    reasons,
    groupName,
    groupEnv,
    endpoint: `/organizations/${config.organization}/projects/${config.project}/containers`,
    autostart: false,
    replicas: 1,
    startsCompute: false,
    runtimeProfile: browserRequired === true ? "browser" : "coding",
    secretsInPayload: containsSecretEnvironmentName(environmentVariables),
    payload
  };
}

export async function recoverEphemeralWorkersFromIdrive({
  env = process.env,
  loadLeases = loadActiveWatchdogLeases,
  stopGroup = saladStopContainerGroup,
  getGroup = saladGetContainerGroup,
  persistCompletion = persistWatchdogCompletion,
  watchdogFactory = createRuntimeWatchdog,
  capacityStore = createWorkerCapacityStore({ env })
} = {}) {
  if (env.SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED !== "YES") {
    return { ok: false, recovered: false, workerSafe: false, count: 0, reason: "watchdog_recovery_not_enabled" };
  }
  const maxLeases = boundedInteger(env.SMEJJ_EPHEMERAL_RECOVERY_MAX_LEASES, 100, 1, 100);
  const recoveryConcurrency = boundedInteger(env.SMEJJ_EPHEMERAL_RECOVERY_CONCURRENCY, 4, 1, 8);
  const loaded = await loadLeases({ env, groupPrefix: "smejj-job-", maxLeases });
  if (loaded?.ok !== true) {
    return { ok: false, recovered: false, workerSafe: false, count: 0, reason: safeReason(loaded?.reason || "watchdog_recovery_failed") };
  }
  const recovered = await mapWithConcurrency(loaded.leases || [], recoveryConcurrency, async (entry) => {
    const groupEnv = { ...env, SALAD_CONTAINER_GROUP_NAME: entry.lease.groupName };
    const watchdog = watchdogFactory({
      stopWorker: () => stopGroup(groupEnv),
      getWorkerStatus: () => getGroup(groupEnv),
      persistCompletion: (event) => persistCompletion(event, { env: groupEnv }),
      listActiveJobs: () => [],
      failJob: () => {}
    });
    try {
      const installed = await watchdog.recoverLease(entry.lease);
      if (installed?.ok !== true) throw new Error(installed?.reason || "watchdog_lease_recovery_failed");
      const stopped = installed.stopVerified === true
        ? installed
        : await enforceVerifiedStop(watchdog, "control_restart_recovery");
      const capacity = await capacityStore.releaseRecovered(entry.lease, stopEvidence(stopped));
      if (capacity?.ok !== true) throw new Error(capacity?.reason || "global_worker_capacity_recovery_failed");
      return {
        ok: true,
        groupName: entry.lease.groupName,
        leaseId: entry.lease.leaseId,
        stopVerified: stopped.stopVerified === true,
        completionPersisted: stopped.completionPersisted === true,
        capacityReleased: true
      };
    } catch (error) {
      return {
        ok: false,
        groupName: entry.lease.groupName,
        leaseId: entry.lease.leaseId,
        stopVerified: false,
        completionPersisted: false,
        reason: safeReason(error?.message || error)
      };
    }
  });
  const failed = recovered.filter((entry) => entry.ok !== true);
  return {
    ok: failed.length === 0,
    recovered: recovered.some((entry) => entry.ok === true),
    workerSafe: failed.length === 0,
    count: recovered.filter((entry) => entry.ok === true).length,
    groups: recovered,
    ...(failed.length ? {
      reason: "watchdog_lease_recovery_incomplete",
      failedCount: failed.length
    } : {})
  };
}

export async function waitForWorkerReady(groupEnv, {
  getGroup = saladGetContainerGroup,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now(),
  env = groupEnv,
  signal = null
} = {}) {
  const timeoutMs = boundedInteger(env.SMEJJ_EPHEMERAL_WORKER_STARTUP_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS, 60_000, 20 * 60_000);
  const pollMs = boundedInteger(env.SMEJJ_EPHEMERAL_WORKER_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS, 250, 30_000);
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    throwIfWorkerCancelled(signal);
    const status = await safeProviderCall(() => getGroup(groupEnv));
    throwIfWorkerCancelled(signal);
    if (status.ok === true && status.data?.current_state?.status === "failed") {
      throw new Error("ephemeral_worker_provider_failed");
    }
    const origin = saladGatewayOrigin(status?.data?.networking?.dns);
    if (status.ok === true && origin) {
      try {
        const response = await fetchImpl(`${origin}/health`, {
          method: "GET",
          redirect: "error",
          signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
            ? AbortSignal.timeout(Math.min(10_000, pollMs))
            : undefined,
          headers: {
            Accept: "application/json",
            "Salad-Api-Key": String(env.SALAD_API_KEY || "")
          }
        });
        throwIfWorkerCancelled(signal);
        const health = response.ok ? await response.json() : null;
        const browserRequired = env.SMEJJ_WORKER_BROWSER_REQUIRED === "YES";
        if (health?.ok === true
          && health?.role === "stateless-cpu-sandbox"
          && health?.privileged === false
          && health?.runtime?.node === "v20.15.1"
          && health?.runtime?.git === "git version 2.45.4"
          && health?.runtime?.python === "Python 3.12.13"
          && health?.runtime?.pytest === "8.3.5"
          && health?.runtime?.playwright === "1.49.1"
          && health?.runtime?.browser === (browserRequired ? "Chromium 131.0.6778.108 Alpine Linux" : "not-required")
          && health?.runtime?.profile === (browserRequired ? "browser" : "coding")
          && health?.secretsExposed === false) return origin;
      } catch {
        throwIfWorkerCancelled(signal);
        // The gateway can exist before the startup/readiness probe passes.
      }
    }
    await abortableSleep(sleep, pollMs, signal);
  }
  throw new Error("ephemeral_worker_readiness_timeout");
}

export async function waitForWorkerStartable(groupEnv, {
  getGroup = saladGetContainerGroup,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now(),
  env = groupEnv,
  signal = null
} = {}) {
  const timeoutMs = boundedInteger(
    env.SMEJJ_EPHEMERAL_WORKER_CREATE_SETTLE_TIMEOUT_MS,
    DEFAULT_CREATE_SETTLE_TIMEOUT_MS,
    5_000,
    2 * 60_000
  );
  const pollMs = boundedInteger(
    env.SMEJJ_EPHEMERAL_WORKER_CREATE_SETTLE_POLL_INTERVAL_MS,
    1_000,
    250,
    5_000
  );
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    throwIfWorkerCancelled(signal);
    const status = await safeProviderCall(() => getGroup(groupEnv));
    throwIfWorkerCancelled(signal);
    const providerState = status.data?.current_state?.status;
    if (status.ok === true && providerState === "failed") {
      throw new Error("ephemeral_worker_provider_failed_before_start");
    }
    if (status.ok === true && ["deploying", "running"].includes(providerState)) {
      throw new Error("ephemeral_worker_unexpectedly_started_during_creation");
    }
    if (status.ok === true && providerState === "stopped" && status.data?.pending_change !== true) {
      return status.data;
    }
    await abortableSleep(sleep, pollMs, signal);
  }
  throw new Error("ephemeral_worker_create_settle_timeout");
}

export function ephemeralGroupName(jobId) {
  const value = validJobId(jobId);
  const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `smejj-job-${digest}`;
}

async function enforceVerifiedStop(watchdog, reason) {
  const stopped = await watchdog.enforceStop(safeReason(reason));
  if (stopped?.stopVerified !== true || stopped?.completionPersisted !== true) {
    throw new Error("ephemeral_worker_stop_not_verified");
  }
  return stopped;
}

async function safeProviderCall(operation) {
  try {
    const result = await operation();
    return result && typeof result === "object" ? result : { ok: false, status: 0, uncertain: true };
  } catch {
    return { ok: false, status: 0, uncertain: true };
  }
}

function httpProbe(initialDelaySeconds, failureThreshold) {
  return {
    http: { path: "/health", port: WORKER_PORT, scheme: "http", headers: [] },
    initial_delay_seconds: initialDelaySeconds,
    period_seconds: 5,
    timeout_seconds: 3,
    success_threshold: 1,
    failure_threshold: failureThreshold
  };
}

function saladGatewayOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return "";
    if (host !== "salad.cloud" && !host.endsWith(".salad.cloud")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizedSourceBase(value, repository) {
  const source = String(value || "").trim().replace(/\/+$/, "");
  if (!repository) return "";
  const prefix = `https://raw.githubusercontent.com/${repository}/`;
  return source.startsWith(prefix)
    && /^[a-f0-9]{40}\/runtime\/ephemeral-worker$/i.test(source.slice(prefix.length))
    ? source
    : "";
}

function normalizedRepository(value) {
  const repository = String(value || "").trim();
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) ? repository : "";
}

function normalizedHttpsOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizedOwnerAllowlist(value) {
  const owners = [...new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (!owners.length || owners.some((owner) => !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(owner))) return "";
  return owners.sort().join(",");
}

function containsSecretEnvironmentName(value) {
  return Object.keys(value).some((name) => /(?:^|_)(?:secret|password|private_key|api_key|access_key|token)$/i.test(name));
}

function validJobId(value) {
  const jobId = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(jobId)) throw new Error("job_id_invalid");
  return jobId;
}

function shortJobLabel(value) {
  return String(value || "job").replace(/[^a-zA-Z0-9.-]/g, "-").slice(0, 24);
}

function normalizedSha256(value) {
  const digest = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : "";
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.min(max, Math.max(min, resolved));
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

async function mapWithConcurrency(items, concurrency, operation) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function safeReason(value) {
  return String(value || "ephemeral_worker_error").toLowerCase().replace(/[^a-z0-9._:-]/g, "_").slice(0, 120);
}

async function abortableSleep(sleep, ms, signal) {
  throwIfWorkerCancelled(signal);
  if (!signal) return sleep(ms);
  let onAbort;
  try {
    await Promise.race([
      sleep(ms),
      new Promise((_resolve, reject) => {
        onAbort = () => reject(new Error("ephemeral_worker_cancelled"));
        signal.addEventListener("abort", onAbort, { once: true });
      })
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  throwIfWorkerCancelled(signal);
}

function throwIfWorkerCancelled(signal) {
  if (signal?.aborted) throw new Error("ephemeral_worker_cancelled");
}

function stopEvidence(stopped) {
  return {
    stopVerified: stopped?.stopVerified === true,
    completionPersisted: stopped?.completionPersisted === true,
    stopAttempts: Number(stopped?.attempts || 1),
    completedAt: stopped?.lastEnforcement?.attemptedAt || new Date().toISOString()
  };
}
