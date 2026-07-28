// smejj.com training-loop worker — crash-safe checkpoint (Single Responsibility: loop state I/O).
// Operational state only (last-run timestamps, in-flight queue keys) — never training
// data, so it uses the general IDrive credentials (idriveConfigFromEnv), not the
// dedicated training-data credentials in src/training/idrive-conditional-writer.js.
import { idriveConfigFromEnv } from "../maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../glm-salad/s3.js";

export function defaultCheckpoint() {
  return Object.freeze({
    version: 1,
    lastEvalRunAt: null,
    lastEvalVerdict: null,
    lastEvalReportKey: null,
    lastTrainingRunAt: null,
    lastTrainingProcessedKeys: [],
    consecutiveEvalFailures: 0,
    consecutiveTrainingFailures: 0
  });
}

/**
 * Reads the checkpoint object. Any failure (missing object on first boot,
 * network error, malformed JSON) returns the default checkpoint — a lost
 * checkpoint only costs a repeated eval/training pass, never a destructive action.
 */
export async function readCheckpoint({ env = process.env, key, idriveConfig, request = signedS3Request } = {}) {
  try {
    const config = idriveConfig || idriveConfigFromEnv(env);
    const body = await request(config, "GET", key);
    const parsed = JSON.parse(body);
    return Object.freeze({ ...defaultCheckpoint(), ...parsed });
  } catch {
    return defaultCheckpoint();
  }
}

/**
 * Writes the checkpoint object. Failures are swallowed here — a failed
 * checkpoint write must never stop the loop or be treated as a cycle failure.
 */
export async function writeCheckpoint(checkpoint, { env = process.env, key, idriveConfig, request = signedS3Request } = {}) {
  try {
    const config = idriveConfig || idriveConfigFromEnv(env);
    const body = `${JSON.stringify(checkpoint, null, 2)}\n`;
    await request(config, "PUT", key, body, "application/json; charset=utf-8");
    return true;
  } catch {
    return false;
  }
}
