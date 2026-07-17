import test from "node:test";
import assert from "node:assert/strict";
import { createPresignedIdriveUrl } from "../gatekeeper/presignIdrive.js";

const demoEnv = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.invalid",
  IDRIVE_E2_REGION: "us-test-1",
  IDRIVE_E2_ACCESS_KEY: "example_access_key",
  IDRIVE_E2_SECRET_KEY: "example_secret_key",
  IDRIVE_E2_BUCKET: "example-bucket",
  PRESIGN_HARD_LIMIT_ALLOWED: "true",
  PRESIGN_REMAINING: "5"
};

test("missing IDrive env is blocked", async () => {
  const result = await createPresignedIdriveUrl({
    env: {},
    operation: "upload",
    key: "objects/sha256/ab/example"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.match(result.reason, /missing_env/);
});

test("unsafe object key is blocked", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "upload",
    key: "/Users/private/file.txt"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "object_key_not_allowed");
});

test("unsupported operation is blocked", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "proxy",
    key: "objects/sha256/ab/example"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "presign_operation_not_allowed");
});

test("upload returns only a presigned URL envelope and no file proxy", async () => {
  const result = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "upload",
    key: "objects/sha256/ab/example",
    contentType: "text/plain",
    contentLength: 12
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, "PUT");
  assert.equal(result.proxiedByWorker, false);
  assert.match(result.url, /^https:\/\/s3\.example\.invalid\/example-bucket\/objects\/sha256\/ab\/example\?/);
  assert.match(result.url, /X-Amz-Signature=/);
});
