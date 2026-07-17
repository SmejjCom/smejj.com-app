import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { boundedNumber, signedS3Get, signedS3Put } from "../../control-server/src/storage/s3Signer.js";
import { buildEphemeralRuntimeBundle } from "./build-ephemeral-runtime-bundle.mjs";

loadSecureLocalEnv();

if (process.env.CONFIRM_EPHEMERAL_RUNTIME_UPLOAD !== "YES") {
  throw new Error("confirm_ephemeral_runtime_upload_required");
}

const key = String(process.env.SMEJJ_EPHEMERAL_RUNTIME_IDRIVE_KEY || "").trim();
if (!/^runtime\/ephemeral-worker\/releases\/\d{4}-\d{2}-\d{2}\/[a-z0-9._-]+\/bundle\.json$/.test(key) || key.includes("..")) {
  throw new Error("ephemeral_runtime_idrive_key_invalid");
}
const config = {
  endpoint: required("IDRIVE_E2_ENDPOINT"),
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: required("IDRIVE_E2_ACCESS_KEY"),
  secretKey: required("IDRIVE_E2_SECRET_KEY"),
  bucket: required("IDRIVE_E2_BUCKET")
};
const release = await buildEphemeralRuntimeBundle();
const timeoutMs = boundedNumber(process.env.IDRIVE_E2_RELEASE_TIMEOUT_MS, 30_000, 5_000, 30_000);
const object = {
  ...config,
  key,
  body: release.text,
  contentType: "application/json; charset=utf-8",
  ifNoneMatch: "*",
  timeoutMs
};
const created = await signedS3Put(object);
if (created?.ok !== true || created?.created !== true || created?.conditionEnforced !== true) {
  throw new Error(created?.status === 412 ? "ephemeral_runtime_release_already_exists" : "ephemeral_runtime_conditional_create_failed");
}
const overwriteProof = await signedS3Put(object);
if (overwriteProof?.status !== 412 || overwriteProof?.created !== false || overwriteProof?.conditionEnforced !== true) {
  throw new Error("ephemeral_runtime_overwrite_proof_failed");
}
const readback = await signedS3Get({ ...config, key, timeoutMs });
if (readback?.ok !== true || readback.body !== release.text) {
  throw new Error("ephemeral_runtime_readback_failed");
}

console.log(JSON.stringify({
  ok: true,
  provider: "idrive-e2",
  bucket: config.bucket,
  key,
  bytes: release.bytes,
  sha256: release.sha256,
  immutable: true,
  overwriteProofStatus: 412,
  contentVerified: true,
  fileCount: release.fileCount
}, null, 2));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name}_required`);
  return value;
}
