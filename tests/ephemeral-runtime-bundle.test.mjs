import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildEphemeralRuntimeBundle } from "../scripts/deploy/build-ephemeral-runtime-bundle.mjs";

test("IDrive runtime bundle is self-contained, content-addressed and honest about provider egress", async () => {
  const result = await buildEphemeralRuntimeBundle();
  const bundle = JSON.parse(result.text);
  assert.equal(bundle.recordType, "smejj.com-immutable-ephemeral-runtime-bundle");
  assert.equal(bundle.entrypoint, "smejj-worker/worker.mjs");
  assert.equal(bundle.runtimeProfiles.default, "coding");
  assert.equal(bundle.runtimeProfiles.browserVerification, "browser");
  assert.equal(bundle.runtimeProfiles.browserInstall, "conditional-pinned-alpine-package");
  assert.equal(bundle.files.length, result.fileCount);
  assert.equal(bundle.smokeEvidence.exitCode, 0);
  assert.equal(bundle.smokeEvidence.privileged, false);
  assert.equal(bundle.securityAttestation.authenticatedRunIngressRequired, true);
  assert.equal(bundle.securityAttestation.globalCapacityCasRequiredBeforeStart, true);
  assert.equal(bundle.securityAttestation.providerOutboundNetworkRestrictionAvailable, false);
  assert.equal(bundle.securityAttestation.containerEnvironmentContainsPlatformSecrets, false);
  assert.equal(bundle.securityAttestation.nativeAmd64ProviderVerified, false);
  assert.equal(bundle.productionEligible, false);
  assert.equal(bundle.trainingEligible, false);
  for (const file of bundle.files) {
    assert.equal(sha256(Buffer.from(file.content, "base64").toString("utf8")), file.sha256);
  }
  assert.equal(sha256(Buffer.from(bundle.bootstrap.content, "base64").toString("utf8")), bundle.bootstrap.sha256);
  assert.equal(sha256(result.text), result.sha256);
  assert.equal(JSON.stringify(bundle).includes("SALAD_API_KEY"), false);
  assert.equal(JSON.stringify(bundle).includes("IDRIVE_E2_SECRET_KEY"), false);
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
