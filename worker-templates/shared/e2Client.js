// smejj.com worker-templates — IDrive-e2-Client fuer stateless Worker
// (Single Responsibility: Capsule-I/O gegen das Object Brain).
// Gleiches io-Muster wie workers/glm-salad: getJson(config, key) / putJson(config, key, value).
// Fail-closed: Ohne vollstaendige e2-Konfiguration startet kein Worker.
import { signedS3Get, signedS3Put } from "../../control-server/src/storage/s3Signer.js";

export function e2ConfigFromEnv(env = {}) {
  const idrive = {
    endpoint: String(env.IDRIVE_E2_ENDPOINT || "").replace(/\/$/, ""),
    region: env.IDRIVE_E2_REGION || "us-west-2",
    bucket: String(env.IDRIVE_E2_BUCKET || ""),
    accessKey: String(env.IDRIVE_E2_ACCESS_KEY || ""),
    secretKey: String(env.IDRIVE_E2_SECRET_KEY || "")
  };
  const missing = [
    !idrive.endpoint && "IDRIVE_E2_ENDPOINT",
    !idrive.bucket && "IDRIVE_E2_BUCKET",
    !idrive.accessKey && "IDRIVE_E2_ACCESS_KEY",
    !idrive.secretKey && "IDRIVE_E2_SECRET_KEY"
  ].filter(Boolean);
  return { ok: missing.length === 0, missing, idrive };
}

export async function getJson(config, key) {
  const { body } = await signedS3Get({
    endpoint: config.idrive.endpoint,
    region: config.idrive.region,
    accessKey: config.idrive.accessKey,
    secretKey: config.idrive.secretKey,
    bucket: config.idrive.bucket,
    key
  });
  return JSON.parse(body);
}

export async function putJson(config, key, value) {
  return signedS3Put({
    endpoint: config.idrive.endpoint,
    region: config.idrive.region,
    accessKey: config.idrive.accessKey,
    secretKey: config.idrive.secretKey,
    bucket: config.idrive.bucket,
    key,
    body: JSON.stringify(value, null, 2),
    contentType: "application/json"
  });
}
