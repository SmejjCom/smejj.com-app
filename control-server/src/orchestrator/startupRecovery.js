import { recoverRuntimeWatchdogFromIdrive } from "../routes/saladRoutes.js";
import { recoverEphemeralWorkersFromIdrive } from "./ephemeralWorker.js";
import { verifyEphemeralRuntimeAttestation } from "./ephemeralRuntimeAttestation.js";

export async function recoverWorkerRuntimeOnStartup({
  env = process.env,
  recoverLegacy = recoverRuntimeWatchdogFromIdrive,
  attestRuntime = verifyEphemeralRuntimeAttestation,
  recoverEphemeral = recoverEphemeralWorkersFromIdrive
} = {}) {
  const ephemeral = env.SMEJJ_EPHEMERAL_WORKER_ENABLED === "YES";
  const recoveryEnabled = env.SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED === "YES";
  if (ephemeral && !recoveryEnabled) throw new Error("ephemeral_worker_requires_watchdog_recovery");
  if (!recoveryEnabled) return { ok: true, mode: "disabled" };

  if (!ephemeral) {
    const recovered = await recoverLegacy({ env });
    return { ok: true, mode: "legacy-shared-worker", recovered };
  }

  const runtime = await attestRuntime({ env });
  if (runtime?.ok !== true) {
    throw new Error(`ephemeral_runtime_attestation_failed:${runtime?.reason || "unverified_runtime"}`);
  }
  const recovered = await recoverEphemeral({ env });
  if (recovered?.ok !== true || recovered?.workerSafe !== true) {
    throw new Error(`ephemeral_worker_recovery_failed:${recovered?.reason || "unsafe_worker_state"}`);
  }
  return {
    ok: true,
    mode: "ephemeral-stateless-workers",
    runtimeVerified: true,
    recoveredCount: Number(recovered.count || 0)
  };
}
