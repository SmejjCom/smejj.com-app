import crypto from "node:crypto";
import { signedS3Get } from "../storage/s3Signer.js";

const EXPECTED_IMAGE = "docker.io/library/node@sha256:c1f4f4e7afa4f73df11ad95392ff316a4af82df0cb5ca114de1fe7c4dc4dcd20";
const EXPECTED_IMAGE_INDEX = "docker.io/library/node@sha256:09dbe0a53523c2482d85a037efc6b0e8e8bb16c6f1acf431fe36aa0ebc871c06";
const EXPECTED_RUNTIME = Object.freeze({
  node: "v20.15.1",
  git: "git version 2.45.4",
  python: "Python 3.12.13",
  pytest: "8.3.5",
  playwright: "1.49.1",
  browser: "Chromium 131.0.6778.108 Alpine Linux"
});
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

export async function verifyEphemeralRuntimeAttestation({
  env = process.env,
  getObject
} = {}) {
  const config = idriveConfig(env);
  const key = String(env.SMEJJ_EPHEMERAL_RUNTIME_IDRIVE_KEY || "").trim();
  const expectedSha256 = String(env.SMEJJ_EPHEMERAL_RUNTIME_IDRIVE_SHA256 || "").trim().toLowerCase();
  const expectedBootstrapSha256 = String(env.SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256 || "").trim().toLowerCase();
  const expectedManifestSha256 = String(env.SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256 || "").trim().toLowerCase();
  if (!config.ok
    || !/^runtime\/ephemeral-worker\/releases\/\d{4}-\d{2}-\d{2}\/[a-z0-9._-]+\/bundle\.json$/.test(key)
    || key.includes("..")
    || !/^[a-f0-9]{64}$/.test(expectedSha256)
    || !/^[a-f0-9]{64}$/.test(expectedBootstrapSha256)
    || !/^[a-f0-9]{64}$/.test(expectedManifestSha256)) {
    return failure("ephemeral_runtime_attestation_configuration_invalid");
  }
  const reader = getObject || ((objectKey) => signedS3Get({ ...config, key: objectKey }));
  let readback;
  try {
    readback = await reader(key, config);
  } catch {
    return failure("ephemeral_runtime_attestation_read_failed");
  }
  const body = String(readback?.body || "");
  if (readback?.ok !== true || !body || Buffer.byteLength(body, "utf8") > MAX_BUNDLE_BYTES) {
    return failure("ephemeral_runtime_attestation_read_failed");
  }
  if (sha256(body) !== expectedSha256) return failure("ephemeral_runtime_attestation_sha256_mismatch");
  let bundle;
  try {
    bundle = JSON.parse(body);
  } catch {
    return failure("ephemeral_runtime_attestation_bundle_invalid");
  }
  const validation = validateBundle(bundle, {
    allowStagingCandidate: env.SMEJJ_EPHEMERAL_RUNTIME_ALLOW_STAGING_CANDIDATE === "YES"
  });
  if (!validation.ok) return validation;
  if (bundle.bootstrap.sha256 !== expectedBootstrapSha256 || bundle.manifestSha256 !== expectedManifestSha256) {
    return failure("ephemeral_runtime_attestation_source_binding_mismatch");
  }
  return {
    ok: true,
    provider: "idrive-e2",
    key,
    sha256: expectedSha256,
    contentVerified: true,
    immutableReleaseRequired: true,
    image: bundle.baseImage,
    fileCount: bundle.files.length,
    bootstrapSha256: bundle.bootstrap.sha256,
    manifestSha256: bundle.manifestSha256,
    runtimeVersions: bundle.runtimeVersions,
    productionEligible: bundle.productionEligible,
    privileged: bundle.smokeEvidence.privileged,
    browserChecksPassed: bundle.smokeEvidence.browserChecks.length,
    providerOutboundNetworkRestrictionAvailable: false,
    repositoryScope: bundle.securityAttestation.repositoryScope
  };
}

function validateBundle(bundle, { allowStagingCandidate = false } = {}) {
  if (bundle?.schemaVersion !== 1
    || bundle.recordType !== "smejj.com-immutable-ephemeral-runtime-bundle"
    || bundle.baseImage !== EXPECTED_IMAGE
    || bundle.runtimeProfiles?.default !== "coding"
    || bundle.runtimeProfiles?.browserVerification !== "browser"
    || bundle.runtimeProfiles?.browserInstall !== "conditional-pinned-alpine-package"
    || typeof bundle.productionEligible !== "boolean"
    || bundle.entrypoint !== "smejj-worker/worker.mjs"
    || JSON.stringify(bundle.runtimeVersions) !== JSON.stringify(EXPECTED_RUNTIME)
    || !Array.isArray(bundle.files)
    || bundle.files.length < 1
    || bundle.files.length > 40
    || bundle.trainingEligible !== false
    || bundle.memoryMayLearn !== false) {
    return failure("ephemeral_runtime_attestation_bundle_invalid");
  }
  if (bundle.productionEligible !== true && !allowStagingCandidate) {
    return failure("ephemeral_runtime_candidate_not_production_eligible");
  }
  const seen = new Set();
  for (const file of bundle.files) {
    if (!/^smejj-worker\/[a-z0-9][a-z0-9.-]*\.(?:mjs|js)$/i.test(String(file?.path || ""))
      || seen.has(file.path)
      || !/^[a-f0-9]{64}$/.test(String(file?.sha256 || ""))
      || file.encoding !== "base64") return failure("ephemeral_runtime_attestation_file_invalid");
    let content;
    try { content = Buffer.from(String(file.content || ""), "base64").toString("utf8"); }
    catch { return failure("ephemeral_runtime_attestation_file_invalid"); }
    if (sha256(content) !== file.sha256) return failure("ephemeral_runtime_attestation_file_digest_mismatch");
    seen.add(file.path);
  }
  if (!seen.has("smejj-worker/worker.mjs")) return failure("ephemeral_runtime_attestation_entry_missing");
  const manifestText = `${JSON.stringify({
    schemaVersion: 1,
    files: bundle.files.map(({ path, sha256: digest }) => ({ path, sha256: digest }))
  }, null, 2)}\n`;
  if (sha256(manifestText) !== bundle.manifestSha256) return failure("ephemeral_runtime_attestation_manifest_mismatch");
  let bootstrap;
  try { bootstrap = Buffer.from(String(bundle.bootstrap?.content || ""), "base64").toString("utf8"); }
  catch { return failure("ephemeral_runtime_attestation_bootstrap_invalid"); }
  if (bundle.bootstrap?.path !== "bootstrap.mjs"
    || bundle.bootstrap?.encoding !== "base64"
    || sha256(bootstrap) !== bundle.bootstrap?.sha256) {
    return failure("ephemeral_runtime_attestation_bootstrap_invalid");
  }
  const smoke = bundle.smokeEvidence;
  const security = bundle.securityAttestation;
  if (smoke?.recordType !== "smejj.com-ephemeral-runtime-smoke"
    || smoke.exitCode !== 0
    || smoke.image !== EXPECTED_IMAGE_INDEX
    || smoke.targetImage !== EXPECTED_IMAGE
    || smoke.runtimeProfile !== "browser"
    || smoke.testedPlatform !== "linux/arm64"
    || smoke.targetPlatform !== "linux/amd64"
    || smoke.targetImageManifestSha256 !== "c1f4f4e7afa4f73df11ad95392ff316a4af82df0cb5ca114de1fe7c4dc4dcd20"
    || smoke.targetAmd64CoreBootstrapVerified !== true
    || smoke.targetAmd64BrowserBlockedByLocalEmulation !== true
    || smoke.nativeAmd64ProviderVerified !== bundle.productionEligible
    || JSON.stringify(smoke.runtime) !== JSON.stringify(EXPECTED_RUNTIME)
    || smoke.privileged !== false
    || smoke.pytest?.ok !== true
    || smoke.screenshotCount !== 2
    || !Array.isArray(smoke.browserChecks)
    || smoke.browserChecks.length !== 2
    || smoke.browserChecks.some((check) => check.ok !== true)
    || security?.privileged !== false
    || security?.authenticatedRunIngressRequired !== true
    || security?.containerEnvironmentContainsPlatformSecrets !== false
    || security?.repositoryScope !== "trusted-owner-and-repository-allowlist-only"
    || security?.providerOutboundNetworkRestrictionAvailable !== false
    || security?.globalCapacityCasRequiredBeforeStart !== true
    || security?.nativeAmd64ProviderVerified !== bundle.productionEligible
    || security?.runtimeSmokeSha256 !== sha256(`${JSON.stringify(smoke, null, 2)}\n`)
    || security?.deletionPerformed !== false) {
    return failure("ephemeral_runtime_attestation_security_invalid");
  }
  return { ok: true };
}

function idriveConfig(env) {
  const value = {
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_MODEL_BUCKET || env.IDRIVE_E2_BUCKET
  };
  return { ...value, ok: Boolean(value.endpoint && value.accessKey && value.secretKey && value.bucket) };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function failure(reason) {
  return { ok: false, reason };
}
