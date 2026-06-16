import test from "node:test";
import assert from "node:assert/strict";
import { runIdriveConnectionTest, validatePresignedEnvelope } from "../src/storage/idriveConnectionTest.js";
import { createPresignedIdriveUrl } from "../cloudflare-worker/presignIdrive.js";
import { createMemoryStore } from "../src/storage/indexedDbStore.js";
import { createMemoryOpfsStore } from "../src/storage/opfsStore.js";
import { createLocalWorkspace } from "../src/storage/localWorkspace.js";

const demoEnv = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.invalid",
  IDRIVE_E2_REGION: "us-test-1",
  IDRIVE_E2_ACCESS_KEY: "example_access_key",
  IDRIVE_E2_SECRET_KEY: "example_secret_key",
  IDRIVE_E2_BUCKET: "example-bucket",
  IDRIVE_E2_COST_MODE: "free-safe-idrive-storage-only",
  PRESIGN_HARD_LIMIT_ALLOWED: "true",
  PRESIGN_REMAINING: "5"
};

function createMockFetch() {
  const objects = new Map();
  return async (url, init = {}) => {
    const method = init.method || "GET";
    if (!String(url).includes("X-Amz-Signature=")) return new Response("invalid signature", { status: 403 });
    if (String(url).includes("expired=true")) return new Response("expired", { status: 403 });
    if (method === "PUT") {
      objects.set(new URL(url).pathname, String(init.body || ""));
      return new Response("", { status: 200 });
    }
    if (method === "GET") {
      const body = objects.get(new URL(url).pathname);
      return body === undefined ? new Response("missing", { status: 404 }) : new Response(body, { status: 200 });
    }
    return new Response("blocked", { status: 405 });
  };
}

test("small file upload, download, checksum, manifest update and restore work through presigned flow", async () => {
  const result = await runIdriveConnectionTest({
    env: demoEnv,
    fetchImpl: createMockFetch(),
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore(),
    content: "small idrive test"
  });
  assert.equal(result.ok, true);
  assert.equal(result.upload, true);
  assert.equal(result.download, true);
  assert.equal(result.checksum, true);
  assert.equal(result.restore, true);
  assert.equal(result.proxiedByWorker, false);
  assert.equal(result.secretsInBrowser, false);
});

test("wrong checksum is blocked", async () => {
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "PUT") return new Response("", { status: 200 });
    return new Response("tampered", { status: 200 });
  };
  const result = await runIdriveConnectionTest({
    env: demoEnv,
    fetchImpl,
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore(),
    content: "original"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "checksum_mismatch_blocked");
});

test("missing manifest is reported cleanly", async () => {
  const workspace = createLocalWorkspace({
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore(),
    onlineRef: { onLine: true }
  });
  await assert.rejects(() => workspace.getManifest("missing"), /Project manifest not found/);
});

test("invalid presigned URL is blocked", () => {
  const result = validatePresignedEnvelope({
    ok: true,
    method: "PUT",
    proxiedByWorker: false,
    url: "not-a-url"
  }, { expectedMethod: "PUT" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "presigned_url_invalid");
});

test("expired presigned URL is blocked", async () => {
  const envelope = await createPresignedIdriveUrl({
    env: demoEnv,
    operation: "download",
    key: "objects/sha256/ab/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  });
  const oldDate = new URL(envelope.url).searchParams.get("X-Amz-Date");
  const result = validatePresignedEnvelope(envelope, {
    expectedMethod: "GET",
    now: new Date(Date.UTC(
      Number(oldDate.slice(0, 4)),
      Number(oldDate.slice(4, 6)) - 1,
      Number(oldDate.slice(6, 8)),
      Number(oldDate.slice(9, 11)),
      Number(oldDate.slice(11, 13)),
      Number(oldDate.slice(13, 15)) + 301
    ))
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "presigned_url_expired");
});

test("missing config is blocked", async () => {
  const result = await runIdriveConnectionTest({
    env: {},
    fetchImpl: createMockFetch(),
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore()
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /missing_env/);
});

test("cost risk is blocked before presign", async () => {
  const result = await runIdriveConnectionTest({
    env: { ...demoEnv, IDRIVE_E2_COST_MODE: "auto-billing-paid" },
    fetchImpl: createMockFetch(),
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "paid_or_trial_risk_detected");
});
