import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyEphemeralRuntimeAttestation } from "../control-server/src/orchestrator/ephemeralRuntimeAttestation.js";
import { buildEphemeralRuntimeBundle } from "../scripts/deploy/build-ephemeral-runtime-bundle.mjs";

test("Control verifies the exact immutable IDrive runtime before enabling ephemeral work", async () => {
  const release = await buildEphemeralRuntimeBundle();
  const env = attestationEnv(release);
  const result = await verifyEphemeralRuntimeAttestation({
    env,
    getObject: async (_key, config) => {
      assert.equal(config.bucket, "runtime-test");
      return { ok: true, status: 200, body: release.text };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.contentVerified, true);
  assert.equal(result.sha256, release.sha256);
  assert.equal(result.fileCount, release.fileCount);
  assert.equal(result.privileged, false);
  assert.equal(result.browserChecksPassed, 2);
  assert.equal(result.providerOutboundNetworkRestrictionAvailable, false);
  assert.equal(result.files, undefined);
  assert.equal(JSON.stringify(result).includes(release.bundle.files[0].content), false);
});

test("Control rejects digest drift and a bundle that lies about Salad egress", async () => {
  const release = await buildEphemeralRuntimeBundle();
  const drift = await verifyEphemeralRuntimeAttestation({
    env: attestationEnv(release),
    getObject: async () => ({ ok: true, body: `${release.text}\n` })
  });
  assert.equal(drift.reason, "ephemeral_runtime_attestation_sha256_mismatch");

  const tampered = structuredClone(release.bundle);
  tampered.securityAttestation.providerOutboundNetworkRestrictionAvailable = true;
  const text = `${JSON.stringify(tampered, null, 2)}\n`;
  const dishonest = await verifyEphemeralRuntimeAttestation({
    env: attestationEnv({ ...release, sha256: sha256(text) }),
    getObject: async () => ({ ok: true, body: text })
  });
  assert.equal(dishonest.reason, "ephemeral_runtime_attestation_security_invalid");
});

test("Control rejects a staging-only runtime candidate without the explicit staging gate", async () => {
  const release = await buildEphemeralRuntimeBundle();
  const env = attestationEnv(release);
  delete env.SMEJJ_EPHEMERAL_RUNTIME_ALLOW_STAGING_CANDIDATE;
  const result = await verifyEphemeralRuntimeAttestation({
    env,
    getObject: async () => ({ ok: true, status: 200, body: release.text })
  });
  assert.equal(result.reason, "ephemeral_runtime_candidate_not_production_eligible");
});

function attestationEnv(release) {
  return {
    IDRIVE_E2_ENDPOINT: "https://storage.example",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_ACCESS_KEY: "test",
    IDRIVE_E2_SECRET_KEY: "test",
    IDRIVE_E2_BUCKET: "test",
    IDRIVE_E2_MODEL_BUCKET: "runtime-test",
    SMEJJ_EPHEMERAL_RUNTIME_IDRIVE_KEY: "runtime/ephemeral-worker/releases/2026-07-11/codex-parity-rc1/bundle.json",
    SMEJJ_EPHEMERAL_RUNTIME_IDRIVE_SHA256: release.sha256,
    SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256: release.bundle.bootstrap.sha256,
    SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: release.bundle.manifestSha256,
    SMEJJ_EPHEMERAL_RUNTIME_ALLOW_STAGING_CANDIDATE: "YES"
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
