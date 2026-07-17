import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { handleGatekeeperRequest } from "../gatekeeper/index.js";
import { createPresignedIdriveUrl } from "../gatekeeper/presignIdrive.js";
import { validateUploadBatch, validateUploadMetadata } from "../src/shared/securityPolicy.js";

const env = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.invalid",
  IDRIVE_E2_REGION: "us-test-1",
  IDRIVE_E2_ACCESS_KEY: "example_access_key",
  IDRIVE_E2_SECRET_KEY: "example_secret_key",
  IDRIVE_E2_BUCKET: "example-bucket",
  PRESIGN_HARD_LIMIT_ALLOWED: "true",
  PRESIGN_REMAINING: "2"
};

test("wrong MIME is blocked", () => {
  const result = validateUploadMetadata({ name: "bad.exe", size: 12, type: "application/x-msdownload" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "upload_mime_not_allowed");
});

test("too large upload is blocked", () => {
  const result = validateUploadMetadata({ name: "large.txt", size: 1_000_001, type: "text/plain" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "upload_too_large");
});

test("too many uploads are blocked", () => {
  const files = Array.from({ length: 9 }, (_, index) => ({ name: `${index}.txt`, size: 1, type: "text/plain" }));
  const result = validateUploadBatch(files);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "upload_batch_too_large");
});

test("presign blocks MIME and size before URL generation", async () => {
  const wrongMime = await createPresignedIdriveUrl({
    env,
    operation: "upload",
    key: "objects/sha256/ab/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    contentType: "application/x-msdownload",
    contentLength: 12
  });
  assert.equal(wrongMime.ok, false);
  assert.equal(wrongMime.reason, "upload_mime_not_allowed");

  const tooLarge = await createPresignedIdriveUrl({
    env,
    operation: "upload",
    key: "objects/sha256/ab/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    contentType: "text/plain",
    contentLength: 1_000_001
  });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.reason, "upload_too_large");
});

test("rate limit reached blocks presign", async () => {
  const response = await handleGatekeeperRequest(new Request("https://example.test/gatekeeper/presign", {
    method: "POST",
    body: JSON.stringify({
      operation: "upload",
      key: "objects/sha256/ab/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      contentType: "text/plain",
      contentLength: 12
    })
  }), { ...env, PRESIGN_REMAINING: "0" });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.reason, "presign_rate_limit_reached_or_unclear");
});

test("service worker does not offline-cache API fallback", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /event\.respondWith\(fetch\(request\)\)/);
});

test("CSP and CORS stay restrictive", () => {
  const platform = fs.readFileSync("src/shared/platform.js", "utf8");
  assert.match(platform, /frame-ancestors 'none'/);
  assert.match(platform, /object-src 'none'/);
  assert.doesNotMatch(platform, /Access-Control-Allow-Origin["']?:\s*["']\*/);
});
