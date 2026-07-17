import test from "node:test";
import assert from "node:assert/strict";
import { recoverWorkerRuntimeOnStartup } from "../control-server/src/orchestrator/startupRecovery.js";

test("ephemeral startup attests and recovers job groups without invoking the legacy shared-worker watchdog", async () => {
  const calls = [];
  const result = await recoverWorkerRuntimeOnStartup({
    env: ephemeralEnv(),
    recoverLegacy: async () => { throw new Error("legacy recovery must not run"); },
    attestRuntime: async () => { calls.push("attest"); return { ok: true }; },
    recoverEphemeral: async () => { calls.push("ephemeral"); return { ok: true, workerSafe: true, count: 2 }; }
  });
  assert.deepEqual(calls, ["attest", "ephemeral"]);
  assert.deepEqual(result, {
    ok: true,
    mode: "ephemeral-stateless-workers",
    runtimeVerified: true,
    recoveredCount: 2
  });
});

test("legacy startup uses only the shared-worker watchdog", async () => {
  let legacyCalls = 0;
  const result = await recoverWorkerRuntimeOnStartup({
    env: { SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "YES" },
    recoverLegacy: async () => { legacyCalls += 1; return { ok: true, recovered: false, workerSafe: true }; },
    attestRuntime: async () => { throw new Error("attestation must not run"); },
    recoverEphemeral: async () => { throw new Error("ephemeral recovery must not run"); }
  });
  assert.equal(legacyCalls, 1);
  assert.equal(result.mode, "legacy-shared-worker");
});

test("ephemeral startup remains fail-closed on missing recovery, attestation drift or unsafe recovery", async () => {
  await assert.rejects(
    recoverWorkerRuntimeOnStartup({ env: { SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES" } }),
    /ephemeral_worker_requires_watchdog_recovery/
  );
  await assert.rejects(recoverWorkerRuntimeOnStartup({
    env: ephemeralEnv(),
    attestRuntime: async () => ({ ok: false, reason: "digest_drift" })
  }), /ephemeral_runtime_attestation_failed:digest_drift/);
  await assert.rejects(recoverWorkerRuntimeOnStartup({
    env: ephemeralEnv(),
    attestRuntime: async () => ({ ok: true }),
    recoverEphemeral: async () => ({ ok: false, workerSafe: false, reason: "stop_unverified" })
  }), /ephemeral_worker_recovery_failed:stop_unverified/);
});

function ephemeralEnv() {
  return {
    SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES",
    SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "YES"
  };
}
