import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { publishVerifiedJobToGithub } from "../control-server/src/github/trustedPublisher.js";

const BASE_COMMIT = "a".repeat(40);
const BASE_TREE = "b".repeat(40);
const BLOB_SHA = "c".repeat(40);
const TREE_SHA = "d".repeat(40);
const PUBLISHED_COMMIT = "e".repeat(40);

test("trusted publisher creates and verifies a draft PR for an empty text file without giving credentials to the worker", async () => {
  const job = publicationJob();
  const env = publisherEnv();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const requestBody = options.body ? JSON.parse(options.body) : null;
    calls.push({ method: options.method, path, requestBody });
    if (path.endsWith("/access_tokens")) {
      assert.deepEqual(requestBody, {
        repositories: ["smejj-control"],
        permissions: { contents: "write", metadata: "read", pull_requests: "write" }
      });
      return response(201, {
        token: "ghs_publisher_installation_token_123456789",
        expires_at: "2026-07-11T13:59:00.000Z",
        permissions: { contents: "write", metadata: "read", pull_requests: "write" },
        repositories: [{ full_name: "SmejjCom/smejj-control" }]
      });
    }
    assert.equal(options.headers.Authorization, "Bearer ghs_publisher_installation_token_123456789");
    if (path === "/repos/SmejjCom/smejj-control/git/ref/heads/main") return response(200, { object: { sha: BASE_COMMIT } });
    if (path === `/repos/SmejjCom/smejj-control/git/commits/${BASE_COMMIT}`) return response(200, { tree: { sha: BASE_TREE } });
    if (path === `/repos/SmejjCom/smejj-control/contents/docs%2Fpublisher-proof.md?ref=${BASE_COMMIT}`
      || path === `/repos/SmejjCom/smejj-control/contents/docs/publisher-proof.md?ref=${BASE_COMMIT}`) return response(404, { message: "Not Found" });
    if (path === "/repos/SmejjCom/smejj-control/git/blobs") {
      assert.equal(requestBody.encoding, "base64");
      return response(201, { sha: BLOB_SHA });
    }
    if (path === "/repos/SmejjCom/smejj-control/git/trees") {
      assert.equal(requestBody.base_tree, BASE_TREE);
      assert.deepEqual(requestBody.tree, [{ path: "docs/publisher-proof.md", mode: "100644", type: "blob", sha: BLOB_SHA }]);
      return response(201, { sha: TREE_SHA });
    }
    if (path === "/repos/SmejjCom/smejj-control/git/commits") {
      assert.deepEqual(requestBody.parents, [BASE_COMMIT]);
      assert.equal(requestBody.tree, TREE_SHA);
      return response(201, { sha: PUBLISHED_COMMIT });
    }
    if (path === "/repos/SmejjCom/smejj-control/git/refs") {
      assert.deepEqual(requestBody, { ref: "refs/heads/smejj.com/agent/job_publish_001", sha: PUBLISHED_COMMIT });
      return response(201, { ref: requestBody.ref, object: { sha: PUBLISHED_COMMIT } });
    }
    if (path === "/repos/SmejjCom/smejj-control/pulls" && options.method === "POST") {
      assert.equal(requestBody.draft, true);
      assert.equal(requestBody.maintainer_can_modify, false);
      return response(201, { number: 17, html_url: "https://github.com/SmejjCom/smejj-control/pull/17" });
    }
    if (path === "/repos/SmejjCom/smejj-control/git/ref/heads/smejj.com/agent/job_publish_001") {
      return response(200, { object: { sha: PUBLISHED_COMMIT } });
    }
    if (path === "/repos/SmejjCom/smejj-control/pulls/17") {
      return response(200, {
        state: "open",
        draft: true,
        merged: false,
        head: { ref: "smejj.com/agent/job_publish_001", sha: PUBLISHED_COMMIT },
        base: { ref: "main", sha: BASE_COMMIT }
      });
    }
    throw new Error(`unexpected_request:${options.method}:${path}`);
  };

  const result = await publishVerifiedJobToGithub({
    job,
    env,
    fetchImpl,
    nowMs: Date.parse("2026-07-11T13:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "draft_pr_created");
  assert.equal(result.draftPullRequest.number, 17);
  assert.equal(result.draftPullRequest.draft, true);
  assert.equal(result.mergePerformed, false);
  assert.equal(result.baseCommitVerified, true);
  assert.equal(result.changeSetVerified, true);
  assert.equal(calls.some((call) => /merge/i.test(call.path)), false);
});

test("publisher rejects an unapproved diff, a private draft and an overbroad token before writes", async () => {
  let fetchCalls = 0;
  const mismatch = publicationJob();
  mismatch.approval.approvedDiffSha256 = "f".repeat(64);
  const denied = await publishVerifiedJobToGithub({
    job: mismatch,
    env: publisherEnv(),
    fetchImpl: async () => { fetchCalls += 1; throw new Error("must_not_fetch"); }
  });
  assert.equal(denied.reason, "github_publish_diff_approval_mismatch");
  assert.equal(fetchCalls, 0);

  const privateJob = publicationJob();
  privateJob.repository.visibility = "private";
  const privateDenied = await publishVerifiedJobToGithub({
    job: privateJob,
    env: publisherEnv(),
    fetchImpl: async () => { fetchCalls += 1; throw new Error("must_not_fetch"); }
  });
  assert.equal(privateDenied.reason, "github_free_private_draft_pr_unavailable");
  assert.equal(fetchCalls, 0);

  const overbroad = await publishVerifiedJobToGithub({
    job: publicationJob(),
    env: publisherEnv(),
    nowMs: Date.parse("2026-07-11T13:00:00.000Z"),
    fetchImpl: async () => {
      fetchCalls += 1;
      return response(201, {
        token: "ghs_overbroad_installation_token_123456789",
        expires_at: "2026-07-11T13:59:00.000Z",
        permissions: { contents: "write", metadata: "read", pull_requests: "write", issues: "read" },
        repositories: [{ full_name: "SmejjCom/smejj-control" }]
      });
    }
  });
  assert.equal(overbroad.reason, "github_publisher_token_status_201");
  assert.equal(fetchCalls, 1);
});

test("publisher rejects a directory masquerading as a modified file", async () => {
  const job = publicationJob();
  const change = job.result.changeSet.changes[0];
  change.status = "modified";
  change.baseBlobSha = BLOB_SHA;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/access_tokens")) {
      return response(201, {
        token: "ghs_publisher_installation_token_123456789",
        expires_at: "2026-07-11T13:59:00.000Z",
        permissions: { contents: "write", metadata: "read", pull_requests: "write" },
        repositories: [{ full_name: "SmejjCom/smejj-control" }]
      });
    }
    if (path === "/repos/SmejjCom/smejj-control/git/ref/heads/main") return response(200, { object: { sha: BASE_COMMIT } });
    if (path === `/repos/SmejjCom/smejj-control/git/commits/${BASE_COMMIT}`) return response(200, { tree: { sha: BASE_TREE } });
    if (path.endsWith("/contents/docs%2Fpublisher-proof.md") || path.endsWith("/contents/docs/publisher-proof.md")) {
      return response(200, { type: "dir", sha: BLOB_SHA });
    }
    throw new Error(`unexpected_request:${options.method}:${path}`);
  };
  const result = await publishVerifiedJobToGithub({
    job,
    env: publisherEnv(),
    fetchImpl,
    nowMs: Date.parse("2026-07-11T13:00:00.000Z")
  });
  assert.equal(result.reason, "github_publish_base_blob_changed");
});

function publicationJob() {
  const content = Buffer.alloc(0);
  const diffSha256 = "9".repeat(64);
  return {
    id: "job_publish_001",
    task: "Add a harmless publisher proof",
    status: "passed",
    repository: {
      url: "https://github.com/SmejjCom/smejj-control",
      baseRef: "main",
      visibility: "public",
      publishMode: "draft-pr"
    },
    approval: {
      status: "human_approved",
      approvedDiffSha256: diffSha256,
      mergeAllowed: false
    },
    result: {
      diffSha256,
      repository: {
        baseCommit: BASE_COMMIT,
        branch: "smejj.com/agent/job_publish_001"
      },
      changeSet: {
        schemaVersion: 1,
        baseCommit: BASE_COMMIT,
        diffSha256,
        totalBytes: content.length,
        changes: [{
          status: "added",
          path: "docs/publisher-proof.md",
          mode: "100644",
          baseBlobSha: null,
          bytes: content.length,
          contentSha256: crypto.createHash("sha256").update(content).digest("hex"),
          contentBase64: content.toString("base64")
        }]
      }
    }
  };
}

function publisherEnv() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  return {
    SMEJJ_GITHUB_PUBLISHER_ENABLED: "YES",
    CONFIRM_GITHUB_PUBLISH: "YES",
    SMEJJ_GITHUB_PUBLISHER_APP_ID: "123456",
    SMEJJ_GITHUB_PUBLISHER_APP_INSTALLATION_ID: "654321",
    SMEJJ_GITHUB_PUBLISHER_APP_PRIVATE_KEY_BASE64: Buffer.from(pem).toString("base64"),
    SMEJJ_GITHUB_PUBLISH_REPOSITORY_ALLOWLIST: "SmejjCom/smejj-control"
  };
}

function response(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}
