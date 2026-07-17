import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  createSignedGet,
  downloadVerifiedArtifact,
  readBootstrapConfig,
  validateArchiveEntries
} from "../public/deploy/idrive-control-bootstrap.mjs";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://s3.example.test",
  IDRIVE_E2_REGION: "us-west-2",
  IDRIVE_E2_ACCESS_KEY: "access-key",
  IDRIVE_E2_SECRET_KEY: "secret-key",
  IDRIVE_E2_BUCKET: "smejj-app",
  SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/rc1/smejj-control-context.tar.gz",
  SMEJJ_CONTROL_ARTIFACT_SHA256: "a".repeat(64)
});

test("bootstrap config is fail-closed and accepts only the control deployment prefix", () => {
  const config = readBootstrapConfig(ENV);
  assert.equal(config.bucket, "smejj-app");
  assert.equal(config.key, ENV.SMEJJ_CONTROL_ARTIFACT_KEY);
  assert.equal(config.attempts, 12);
  assert.equal(config.retryDelayMs, 5_000);
  assert.throws(() => readBootstrapConfig({ ...ENV, IDRIVE_E2_ENDPOINT: "http://unsafe.test" }), /HTTPS/);
  assert.throws(() => readBootstrapConfig({ ...ENV, SMEJJ_CONTROL_ARTIFACT_KEY: "models/kimi/model.tar.gz" }), /approved prefix/);
  assert.throws(() => readBootstrapConfig({ ...ENV, SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/../secret.tar.gz" }), /approved prefix/);
  assert.throws(() => readBootstrapConfig({ ...ENV, SMEJJ_CONTROL_ARTIFACT_SHA256: "unknown" }), /SHA-256/);
});

test("signed IDrive request never exposes the secret in URL or headers", () => {
  const request = createSignedGet(readBootstrapConfig(ENV), new Date("2026-07-10T00:00:00.000Z"));
  assert.equal(request.url, "https://s3.example.test/smejj-app/deployments/control/rc1/smejj-control-context.tar.gz");
  assert.match(request.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=access-key\//);
  assert.doesNotMatch(JSON.stringify(request), /secret-key/);
});

test("download verifies byte limit and immutable SHA-256", async () => {
  const archive = Buffer.from("verified release artifact");
  const config = readBootstrapConfig({
    ...ENV,
    SMEJJ_CONTROL_ARTIFACT_SHA256: crypto.createHash("sha256").update(archive).digest("hex")
  });
  const fetchImpl = async () => new Response(archive, {
    status: 200,
    headers: { "content-length": String(archive.length) }
  });
  const result = await downloadVerifiedArtifact(config, fetchImpl);
  assert.deepEqual(result.archive, archive);
  await assert.rejects(
    downloadVerifiedArtifact({ ...config, expectedSha256: "b".repeat(64) }, fetchImpl),
    /mismatch/
  );
});

test("download retries transient failures but never retries permission or digest failures", async () => {
  const archive = Buffer.from("verified retry artifact");
  const config = readBootstrapConfig({
    ...ENV,
    SMEJJ_CONTROL_ARTIFACT_SHA256: crypto.createHash("sha256").update(archive).digest("hex"),
    SMEJJ_CONTROL_BOOTSTRAP_ATTEMPTS: "4",
    SMEJJ_CONTROL_BOOTSTRAP_RETRY_DELAY_MS: "100"
  });
  let transientCalls = 0;
  let transientSleeps = 0;
  const transient = await downloadVerifiedArtifact(config, async () => {
    transientCalls += 1;
    if (transientCalls === 1) throw new TypeError("fetch failed");
    if (transientCalls === 2) return new Response("temporary", { status: 503 });
    return new Response(archive, { status: 200, headers: { "content-length": String(archive.length) } });
  }, { sleep: async () => { transientSleeps += 1; } });
  assert.equal(transientCalls, 3);
  assert.equal(transientSleeps, 2);
  assert.deepEqual(transient.archive, archive);

  let deniedCalls = 0;
  await assert.rejects(downloadVerifiedArtifact(config, async () => {
    deniedCalls += 1;
    return new Response("denied", { status: 403 });
  }, { sleep: async () => {} }), /HTTP 403/);
  assert.equal(deniedCalls, 1);

  let driftCalls = 0;
  await assert.rejects(downloadVerifiedArtifact({ ...config, expectedSha256: "b".repeat(64) }, async () => {
    driftCalls += 1;
    return new Response(archive, { status: 200 });
  }, { sleep: async () => {} }), /mismatch/);
  assert.equal(driftCalls, 1);
});

test("archive validator blocks traversal and requires the server entrypoint", () => {
  assert.deepEqual(validateArchiveEntries("package.json\nsrc/\nsrc/server.js\n"), ["package.json", "src/", "src/server.js"]);
  assert.throws(() => validateArchiveEntries("package.json\n../escape\nsrc/server.js\n"), /unsafe path/);
  assert.throws(() => validateArchiveEntries("package.json\nREADME.md\n"), /required entrypoint/);
});
