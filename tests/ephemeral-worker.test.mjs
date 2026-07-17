import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  EPHEMERAL_WORKER_IMAGE,
  buildEphemeralWorkerPlan,
  ephemeralGroupName,
  recoverEphemeralWorkersFromIdrive,
  waitForWorkerReady,
  waitForWorkerStartable
} from "../control-server/src/orchestrator/ephemeralWorker.js";
import {
  EPHEMERAL_RUNTIME_VERSIONS,
  runtimeInstallCommands,
  startEphemeralWorker,
  validateEphemeralAppRoot,
  validateSourceBase
} from "../scripts/deploy/bootstrap-ephemeral-worker.mjs";
import { buildEphemeralRuntimeManifest, EPHEMERAL_WORKER_FILES } from "../scripts/deploy/build-ephemeral-runtime-manifest.mjs";

const COMMIT = "a".repeat(40);

test("ephemeral Salad plan is CPU-only, digest-pinned, stopped by default and secret-free", () => {
  const env = runtimeEnv();
  const plan = buildEphemeralWorkerPlan({ jobId: "job_plan_001", env });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.reasons, []);
  assert.equal(plan.groupName, ephemeralGroupName("job_plan_001"));
  assert.equal(plan.autostart, false);
  assert.equal(plan.replicas, 1);
  assert.equal(plan.startsCompute, false);
  assert.equal(plan.secretsInPayload, false);
  assert.equal(plan.payload.autostart_policy, false);
  assert.equal(plan.payload.restart_policy, "never");
  assert.equal(plan.payload.replicas, 1);
  assert.equal(plan.payload.container.image, EPHEMERAL_WORKER_IMAGE);
  assert.match(plan.payload.container.image, /^docker\.io\/library\/node@sha256:[a-f0-9]{64}$/);
  assert.equal(plan.runtimeProfile, "coding");
  assert.equal(plan.payload.container.environment_variables.SMEJJ_WORKER_BROWSER_REQUIRED, "NO");
  assert.deepEqual(plan.payload.container.command.slice(0, 2), ["/bin/sh", "-lc"]);
  assert.equal(plan.payload.container.resources.gpu_classes, undefined);
  assert.equal(plan.payload.networking.auth, true);
  assert.equal(plan.payload.networking.single_connection_limit, true);
  assert.equal(plan.payload.startup_probe.http.path, "/health");
  assert.equal(plan.payload.startup_probe.failure_threshold, 20);
  assert.equal(plan.payload.readiness_probe.failure_threshold, 10);
  assert.equal(plan.payload.liveness_probe.failure_threshold, 3);
  assert.ok([
    plan.payload.startup_probe,
    plan.payload.readiness_probe,
    plan.payload.liveness_probe
  ].every((probe) => probe.failure_threshold >= 1 && probe.failure_threshold <= 20));
  const command = plan.payload.container.command.join(" ");
  assert.match(command, /const attempts=12/);
  assert.match(command, /AbortSignal\.timeout\(15000\)/);
  assert.match(command, /bootstrap_sha256_mismatch/);
  const serialized = JSON.stringify(plan.payload);
  assert.equal(serialized.includes(env.SALAD_API_KEY), false);
  assert.equal(serialized.includes(env.SMEJJ_WORKER_TOKEN_SECRET), false);
  assert.equal(serialized.includes("IDRIVE_E2_SECRET_KEY"), false);
});

test("ephemeral Salad plan installs the browser profile only for explicit UI verification", () => {
  const plan = buildEphemeralWorkerPlan({ jobId: "job_browser_001", env: runtimeEnv(), browserRequired: true });
  assert.equal(plan.ok, true);
  assert.equal(plan.runtimeProfile, "browser");
  assert.equal(plan.payload.container.environment_variables.SMEJJ_WORKER_BROWSER_REQUIRED, "YES");
  assert.equal(plan.payload.container.image, EPHEMERAL_WORKER_IMAGE);
});

test("worker readiness fails immediately when Salad reports a terminal provider failure", async () => {
  let sleeps = 0;
  await assert.rejects(
    waitForWorkerReady(runtimeEnv(), {
      getGroup: async () => ({ ok: true, data: { current_state: { status: "failed" } } }),
      fetchImpl: async () => { throw new Error("gateway_must_not_be_called"); },
      sleep: async () => { sleeps += 1; },
      nowMs: () => Date.now(),
      env: { ...runtimeEnv(), SMEJJ_EPHEMERAL_WORKER_STARTUP_TIMEOUT_MS: "60000" }
    }),
    /ephemeral_worker_provider_failed/
  );
  assert.equal(sleeps, 0);
});

test("worker start waits for Salad creation changes to settle before issuing compute start", async () => {
  const statuses = [
    { ok: true, data: { pending_change: true, current_state: { status: "stopped" } } },
    { ok: true, data: { pending_change: false, current_state: { status: "stopped" } } }
  ];
  let sleeps = 0;
  let now = 0;
  const result = await waitForWorkerStartable(runtimeEnv(), {
    getGroup: async () => statuses.shift(),
    sleep: async (ms) => { sleeps += 1; now += ms; },
    nowMs: () => now,
    env: { ...runtimeEnv(), SMEJJ_EPHEMERAL_WORKER_CREATE_SETTLE_TIMEOUT_MS: "5000" }
  });
  assert.equal(result.pending_change, false);
  assert.equal(result.current_state.status, "stopped");
  assert.equal(sleeps, 1);
});

test("worker startable gate fails closed if Salad starts compute unexpectedly", async () => {
  await assert.rejects(
    waitForWorkerStartable(runtimeEnv(), {
      getGroup: async () => ({ ok: true, data: { pending_change: false, current_state: { status: "deploying" } } }),
      sleep: async () => {},
      nowMs: () => 0,
      env: { ...runtimeEnv(), SMEJJ_EPHEMERAL_WORKER_CREATE_SETTLE_TIMEOUT_MS: "5000" }
    }),
    /ephemeral_worker_unexpectedly_started_during_creation/
  );
});

test("worker readiness and creation gates abort immediately when the job is cancelled", async () => {
  const controller = new AbortController();
  controller.abort("job_cancelled");
  let calls = 0;
  await assert.rejects(
    waitForWorkerReady(runtimeEnv(), {
      getGroup: async () => { calls += 1; return runningStatus(); },
      signal: controller.signal,
      env: runtimeEnv()
    }),
    /ephemeral_worker_cancelled/
  );
  await assert.rejects(
    waitForWorkerStartable(runtimeEnv(), {
      getGroup: async () => { calls += 1; return stoppedStatus(); },
      signal: controller.signal,
      env: runtimeEnv()
    }),
    /ephemeral_worker_cancelled/
  );
  assert.equal(calls, 0);
});

test("ephemeral plan remains fail-closed without a reviewed release ID", () => {
  const env = runtimeEnv();
  delete env.SMEJJ_EPHEMERAL_SECURITY_REVIEW_ID;
  const plan = buildEphemeralWorkerPlan({ jobId: "job_review_required", env });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.reasons, ["ephemeral_worker_security_review_required"]);
});

test("Control restart recovery stops every unfinished ephemeral group without deleting it", async () => {
  const env = { ...runtimeEnv(), SMEJJ_EPHEMERAL_WORKER_ENABLED: "NO" };
  const preparedAt = new Date(Date.now() - 60_000).toISOString();
  const deadlineAt = new Date(Date.now() + 59 * 60_000).toISOString();
  const leases = ["job_recovery_a", "job_recovery_b"].map((jobId, index) => ({
    lease: {
      schemaVersion: 1,
      leaseId: `lease-recovery-${index + 1}`,
      groupName: ephemeralGroupName(jobId),
      preparedAt,
      deadlineAt,
      maxRuntimeMinutes: 60,
      budgetUsd: 0.1
    }
  }));
  const stoppedGroups = [];
  const completions = [];
  const result = await recoverEphemeralWorkersFromIdrive({
    env,
    loadLeases: async () => ({ ok: true, found: true, count: leases.length, leases }),
    stopGroup: async (groupEnv) => { stoppedGroups.push(groupEnv.SALAD_CONTAINER_GROUP_NAME); return { ok: true, status: 202 }; },
    getGroup: async () => stoppedStatus(),
    persistCompletion: async (event) => {
      completions.push(event.lease.groupName);
      return { ok: true, persisted: true, immutable: true, contentVerified: true };
    },
    capacityStore: { releaseRecovered: async () => ({ ok: true }) }
  });
  assert.equal(result.ok, true);
  assert.equal(result.workerSafe, true);
  assert.equal(result.count, 2);
  assert.deepEqual(stoppedGroups, leases.map((entry) => entry.lease.groupName));
  assert.deepEqual(completions, stoppedGroups);
  assert.ok(result.groups.every((group) => group.stopVerified && group.completionPersisted));
});

test("Control recovery starts every stop independently and reports partial failure only after all groups settle", async () => {
  const env = { ...runtimeEnv(), SMEJJ_EPHEMERAL_WORKER_ENABLED: "NO" };
  const preparedAt = new Date(Date.now() - 60_000).toISOString();
  const deadlineAt = new Date(Date.now() + 59 * 60_000).toISOString();
  const leases = ["job_parallel_a", "job_parallel_b"].map((jobId, index) => ({
    lease: {
      schemaVersion: 1,
      leaseId: `lease-parallel-${index + 1}`,
      groupName: ephemeralGroupName(jobId),
      preparedAt,
      deadlineAt,
      maxRuntimeMinutes: 60,
      budgetUsd: 0.1
    }
  }));
  const started = [];
  let releaseFirst;
  const firstCanFinish = new Promise((resolve) => { releaseFirst = resolve; });
  let watchdogIndex = 0;
  const result = await recoverEphemeralWorkersFromIdrive({
    env,
    loadLeases: async () => ({ ok: true, found: true, count: leases.length, leases }),
    watchdogFactory: () => {
      const index = watchdogIndex;
      watchdogIndex += 1;
      return {
        recoverLease: async () => {
          started.push(index);
          if (index === 0) {
            await firstCanFinish;
            return { ok: false, reason: "first_group_unverifiable" };
          }
          releaseFirst();
          return { ok: true, stopVerified: false };
        },
        enforceStop: async () => ({
          ok: true,
          stopVerified: true,
          completionPersisted: true,
          attempts: 1,
          lastEnforcement: { attemptedAt: new Date().toISOString() }
        })
      };
    },
    capacityStore: { releaseRecovered: async () => ({ ok: true }) }
  });
  assert.deepEqual(started, [0, 1]);
  assert.equal(result.ok, false);
  assert.equal(result.workerSafe, false);
  assert.equal(result.count, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.reason, "watchdog_lease_recovery_incomplete");
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[1].stopVerified, true);
});

test("runtime bootstrap requires a commit pin and verifies every downloaded source digest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-ephemeral-bootstrap-"));
  const workerSource = "export function startServer(options) { return { started: true, options }; }\n";
  const manifest = `${JSON.stringify({
    schemaVersion: 1,
    files: [{ path: "smejj-worker/worker.mjs", sha256: sha256(workerSource) }]
  })}\n`;
  const sourceBase = `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/ephemeral-worker`;
  const commands = [];
  try {
    await startEphemeralWorker({
      appRoot: root,
      nodeVersion: EPHEMERAL_RUNTIME_VERSIONS.node,
      env: {
        SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE: sourceBase,
        SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: sha256(manifest),
        SMEJJ_WORKER_BROWSER_REQUIRED: "NO",
        SMEJJ_HOST: "::",
        SMEJJ_WORKER_PORT: "8080"
      },
      fetchImpl: async (url) => new Response(String(url).endsWith("manifest.json") ? manifest : workerSource, { status: 200 }),
      runCommand: async (file, args) => {
        commands.push([file, ...args]);
        if (file === "npm") {
          const packageDir = path.join(root, "node_modules/playwright");
          await mkdir(packageDir, { recursive: true });
          await writeFile(path.join(packageDir, "package.json"), JSON.stringify({ version: EPHEMERAL_RUNTIME_VERSIONS.playwright }));
        }
        if (file === "git" && args[0] === "--version") return { stdout: `${EPHEMERAL_RUNTIME_VERSIONS.git}\n` };
        if (file === "python3" && args[0] === "--version") return { stdout: `${EPHEMERAL_RUNTIME_VERSIONS.python}\n` };
        if (file === "python3" && args[0] === "-m" && args[1] === "pytest" && args[2] === "--version") {
          return { stdout: `pytest ${EPHEMERAL_RUNTIME_VERSIONS.pytest}\n` };
        }
        return { stdout: "", stderr: "" };
      },
      dropPrivileges: async () => ({ uid: 1000, gid: 1000, privileged: false }),
      importModule: async () => ({ startServer: (options) => ({ started: true, options }) })
    });
    assert.equal(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).dependencies.playwright, EPHEMERAL_RUNTIME_VERSIONS.playwright);
    assert.equal(commands[0][0], "apk");
    assert.equal(commands[0].includes("chromium=131.0.6778.108-r0"), false);
    assert.ok(commands.some((command) => command.join(" ").includes(`pytest==${EPHEMERAL_RUNTIME_VERSIONS.pytest}`)));
    assert.throws(() => validateSourceBase("https://raw.githubusercontent.com/example/repo/main/runtime/ephemeral-worker"), /commit_pinned/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime install commands pin Chromium only for the browser profile", () => {
  const coding = runtimeInstallCommands("/app", { browserRequired: false });
  const browser = runtimeInstallCommands("/app", { browserRequired: true });
  assert.equal(coding[0].file, "apk");
  assert.equal(coding[0].args.includes("chromium=131.0.6778.108-r0"), false);
  assert.equal(browser[0].args.includes("chromium=131.0.6778.108-r0"), true);
  assert.ok(coding[2].args.includes("--break-system-packages"));
});

test("runtime app root allows the intended /app mount but rejects filesystem roots and short system directories", () => {
  assert.equal(validateEphemeralAppRoot("/app"), "/app");
  assert.throws(() => validateEphemeralAppRoot("/"), /ephemeral_worker_app_root_invalid/);
  assert.throws(() => validateEphemeralAppRoot("/etc"), /ephemeral_worker_app_root_invalid/);
});

test("runtime release manifest covers the complete worker module set with content digests", async () => {
  const result = await buildEphemeralRuntimeManifest();
  assert.equal(result.fileCount, EPHEMERAL_WORKER_FILES.length);
  assert.equal(result.manifest.files.some((file) => file.path === "smejj-worker/worker.mjs"), true);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(result.bootstrapSha256, /^[a-f0-9]{64}$/);
  assert.equal(sha256(result.text), result.manifestSha256);
});

function runtimeEnv() {
  return {
    SALAD_API_KEY: "salad-secret-not-in-plan",
    SALAD_ORGANIZATION_NAME: "smejj-org",
    SALAD_PROJECT_NAME: "smejj-project",
    SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES",
    SMEJJ_EPHEMERAL_SECURITY_REVIEW_ID: "SEC-2026-07-11-EPHEMERAL-RC1",
    SMEJJ_EPHEMERAL_TRUSTED_REPOS_ONLY: "YES",
    SMEJJ_EPHEMERAL_RUNTIME_SOURCE_REPOSITORY: "example/repo",
    SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE: `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/ephemeral-worker`,
    SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256: "b".repeat(64),
    SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: "c".repeat(64),
    SMEJJ_CONTROL_ORIGIN: "https://smejj.com",
    SMEJJ_WORKER_REQUIRE_REPO_ALLOWLIST: "YES",
    SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST: "example",
    SMEJJ_WORKER_TOKEN_SECRET: "worker-secret-not-in-plan",
    SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "YES",
    CONFIRM_SALAD_CREATE: "YES",
    CONFIRM_SALAD_START: "YES",
    CONFIRM_SALAD_STOP: "YES",
    SMEJJ_BUDGET_MAX_USD_PER_JOB: "1",
    SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "60",
    SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
    SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "0.10",
    SMEJJ_WORKER_BUDGET_USD: "0.10",
    SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "15"
  };
}

function leaseFor(groupName) {
  return {
    schemaVersion: 1,
    leaseId: "lease-12345678",
    groupName,
    preparedAt: "2026-07-11T12:00:00.000Z",
    deadlineAt: "2026-07-11T13:00:00.000Z",
    maxRuntimeMinutes: 60,
    budgetUsd: 0.10
  };
}

function runningStatus() {
  return {
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      networking: { dns: "job-test.salad.cloud" },
      current_state: {
        status: "running",
        instance_status_counts: { allocating_count: 0, creating_count: 0, running_count: 1, stopping_count: 0 }
      }
    }
  };
}

function stoppedStatus() {
  return {
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: "stopped",
        instance_status_counts: { allocating_count: 0, creating_count: 0, running_count: 0, stopping_count: 0 }
      }
    }
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
