// smejj.com — Maus-Replay Stufe A (2026-07-15): Leseweg-Tests fuer den
// zusaetzlichen, ausschliesslich lesenden Presign-Prefix capsules/maus-engine/.
// Bewusst als EIGENE Datei: tests/presign.failclosed.test.mjs ist ein
// digest-gepinntes Foundation-Benchmark-Asset und bleibt byte-identisch.
import test from "node:test";
import assert from "node:assert/strict";
import { createPresignedIdriveUrl } from "../gatekeeper/presignIdrive.js";
import { normalizeObjectKey } from "../gatekeeper/policy.js";

const demoEnv = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.invalid",
  IDRIVE_E2_REGION: "us-test-1",
  IDRIVE_E2_ACCESS_KEY: "example_access_key",
  IDRIVE_E2_SECRET_KEY: "example_secret_key",
  IDRIVE_E2_BUCKET: "example-bucket",
  PRESIGN_HARD_LIMIT_ALLOWED: "true",
  PRESIGN_REMAINING: "5"
};

test("download of capsules/maus-engine/ artifacts is allowed (read-only Leseweg)", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "capsules/maus-engine/maus-demo-sprachwelle-2026-07-15-r5/result/httpbin-form-post-demo/aktionsprotokoll.json.gz"
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, "GET");
  assert.equal(result.proxiedByWorker, false);
  assert.match(result.url, /capsules\/maus-engine\//);
});

test("upload to capsules/ stays blocked (fail-closed, no write path)", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "upload",
    key: "capsules/maus-engine/x/result/y/aktionsprotokoll.json.gz",
    contentType: "application/gzip",
    contentLength: 10
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "object_key_not_allowed");
});

test("download of other capsules/ prefixes stays blocked", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "capsules/other-area/secret.json"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "object_key_not_allowed");
});

test("traversal inside capsules/maus-engine/ stays blocked", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "capsules/maus-engine/../deployments/control/x.tar.gz"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "object_key_not_allowed");
});

test("existing download prefixes stay allowed (non-regression)", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "objects/sha256/ab/example"
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, "GET");
});

test("normalizeObjectKey without operation keeps old behaviour (non-regression)", () => {
  assert.equal(normalizeObjectKey("capsules/maus-engine/x/result/y/manifest.json"), null);
  assert.equal(normalizeObjectKey("objects/sha256/ab/example"), "objects/sha256/ab/example");
  assert.equal(
    normalizeObjectKey("capsules/maus-engine/x/result/y/manifest.json", { operation: "download" }),
    "capsules/maus-engine/x/result/y/manifest.json"
  );
  assert.equal(normalizeObjectKey("capsules/maus-engine/x/y", { operation: "upload" }), null);
});

test("capsules bucket override signs capsule downloads in IDRIVE_E2_CAPSULES_BUCKET", async () => {
  const result = await createPresignedIdriveUrl({
    env: { ...demoEnv, IDRIVE_E2_CAPSULES_BUCKET: "example-capsules" },
    operation: "download",
    key: "capsules/maus-engine/x/result/y/manifest.json"
  });
  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/s3\.example\.invalid\/example-capsules\/capsules\/maus-engine\//);
});

test("capsules bucket override does NOT affect other prefixes (non-regression)", async () => {
  const result = await createPresignedIdriveUrl({
    env: { ...demoEnv, IDRIVE_E2_CAPSULES_BUCKET: "example-capsules" },
    operation: "download",
    key: "objects/sha256/ab/example"
  });
  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/s3\.example\.invalid\/example-bucket\/objects\//);
});

test("without IDRIVE_E2_CAPSULES_BUCKET capsule downloads use the default bucket (fail-safe)", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "capsules/maus-engine/x/result/y/manifest.json"
  });
  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/s3\.example\.invalid\/example-bucket\/capsules\/maus-engine\//);
});
