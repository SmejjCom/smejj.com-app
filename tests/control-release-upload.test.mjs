import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { uploadControlRelease, validateControlReleaseInput } from "../scripts/deploy/upload_control_release_to_idrive.mjs";

const CONFIG = Object.freeze({
  endpoint: "https://s3.example.test",
  region: "us-west-2",
  accessKey: "staging-access",
  secretKey: "staging-secret-never-log",
  bucket: "smejj-staging"
});
const KEY = "deployments/control/staging/2026-07-11/base/control.tar.gz";

test("control release upload uses conditional create, overwrite proof and binary readback", async () => {
  const fixture = await releaseFixture();
  const requests = [];
  try {
    const result = await uploadControlRelease({
      ...fixture,
      key: KEY,
      config: CONFIG,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (options.method === "PUT" && requests.filter((item) => item.options.method === "PUT").length === 2) {
          return new Response("", { status: 412 });
        }
        if (options.method === "GET") return new Response(fixture.body, { status: 200 });
        return new Response("", { status: 200 });
      }
    });
    assert.equal(result.created, true);
    assert.equal(result.immutable, true);
    assert.equal(result.overwriteProofStatus, 412);
    assert.equal(result.contentVerified, true);
    const puts = requests.filter((item) => item.options.method === "PUT");
    assert.equal(puts.length, 2);
    assert.ok(puts.every((item) => item.options.headers["If-None-Match"] === "*"));
    assert.ok(puts.every((item) => /if-none-match/.test(item.options.headers.Authorization)));
    assert.doesNotMatch(JSON.stringify(requests), /staging-secret-never-log/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("control release upload accepts an existing object only after exact readback", async () => {
  const fixture = await releaseFixture();
  try {
    const result = await uploadControlRelease({
      ...fixture,
      key: KEY,
      config: CONFIG,
      fetchImpl: async (_url, options) => options.method === "PUT"
        ? new Response("", { status: 412 })
        : new Response(fixture.body, { status: 200 })
    });
    assert.equal(result.created, false);
    assert.equal(result.overwriteProofStatus, 412);
    assert.equal(result.contentVerified, true);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("control release upload fails closed on overwrite or readback mismatch", async () => {
  const fixture = await releaseFixture();
  try {
    await assert.rejects(uploadControlRelease({
      ...fixture,
      key: KEY,
      config: CONFIG,
      fetchImpl: async () => new Response("", { status: 200 })
    }), /overwrite proof failed/);
    await assert.rejects(uploadControlRelease({
      ...fixture,
      key: KEY,
      config: CONFIG,
      fetchImpl: async (_url, options) => options.method === "PUT"
        ? new Response("", { status: 412 })
        : new Response("wrong", { status: 200 })
    }), /verification mismatch/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("control release input blocks mutable paths, unapproved hashes and HTTP", () => {
  assert.throws(() => validateControlReleaseInput({
    filePath: "release.tar.gz",
    key: "deployments/control/../secret.tar.gz",
    expectedSha256: "a".repeat(64),
    config: CONFIG
  }), /approved prefix/);
  assert.throws(() => validateControlReleaseInput({
    filePath: "release.tar.gz",
    key: KEY,
    expectedSha256: "",
    config: CONFIG
  }), /SHA256|SHA-256/);
  assert.throws(() => validateControlReleaseInput({
    filePath: "release.tar.gz",
    key: KEY,
    expectedSha256: "a".repeat(64),
    config: { ...CONFIG, endpoint: "http://s3.example.test" }
  }), /HTTPS/);
});

async function releaseFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smejj.com-control-release-upload-"));
  const filePath = path.join(directory, "control.tar.gz");
  const body = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x73, 0x6d, 0x65, 0x6a, 0x6a]);
  await writeFile(filePath, body);
  return {
    directory,
    filePath,
    body,
    expectedSha256: crypto.createHash("sha256").update(body).digest("hex")
  };
}
