// smejj.com training-loop worker — eval report persistence on IDrive e2
// (Single Responsibility: benchmark report I/O). Reports contain metrics only,
// never raw model text (src/evaluation/evalReport.js), so — like the
// checkpoint — this uses the general IDrive credentials, not the dedicated,
// consent-gated training-data credentials. "Benchmarks" is one of IDrive e2's
// listed storage responsibilities; a stateless container's local disk is not
// a valid substitute (wiped on every restart/redeploy).
import { idriveConfigFromEnv } from "../maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../glm-salad/s3.js";

const ROOT = "ops/smejj-training-loop/benchmarks";

export function reportKey(fileName) {
  return `${ROOT}/${fileName}`;
}

export async function writeReportToIdrive(target, report, { env = process.env, idriveConfig, request = signedS3Request } = {}) {
  const config = idriveConfig || idriveConfigFromEnv(env);
  const body = `${JSON.stringify(report, null, 2)}\n`;
  await request(config, "PUT", target, body, "application/json; charset=utf-8");
}

export async function readReportFromIdrive(target, { env = process.env, idriveConfig, request = signedS3Request } = {}) {
  const config = idriveConfig || idriveConfigFromEnv(env);
  const body = await request(config, "GET", target);
  return JSON.parse(body);
}
