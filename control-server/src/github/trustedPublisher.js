import crypto from "node:crypto";
import { issueGithubAppJwt } from "./githubApp.js";

const GITHUB_API_VERSION = "2026-03-10";
const MAX_TOKEN_TTL_MS = 60 * 60_000;
const MAX_CHANGE_SET_BYTES = 650_000;
const MAX_CHANGED_FILES = 100;
const PUBLISH_PERMISSIONS = Object.freeze({ contents: "write", metadata: "read", pull_requests: "write" });

export async function publishVerifiedJobToGithub({
  job,
  env = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
  title = "",
  body = ""
} = {}) {
  if (env.SMEJJ_GITHUB_PUBLISHER_ENABLED !== "YES" || env.CONFIRM_GITHUB_PUBLISH !== "YES") {
    return failure("github_publisher_not_enabled");
  }
  const validated = validatePublication(job, env);
  if (!validated.ok) return validated;
  const { target, baseRef, baseCommit, branch, changeSet } = validated;
  const issued = await issueGithubPublisherToken({ target, env, fetchImpl, nowMs });
  if (!issued.ok) return issued;
  const request = githubRequester({ token: issued.token, fetchImpl });

  const base = await readRef(request, target, baseRef);
  if (!base.ok) return base;
  if (base.sha !== baseCommit) return failure("github_publish_remote_base_changed");
  const baseCommitResult = await request("GET", repoPath(target, `/git/commits/${baseCommit}`));
  const baseTree = String(baseCommitResult.data?.tree?.sha || "");
  if (!baseCommitResult.ok || !validSha(baseTree)) return failure("github_publish_base_commit_unavailable");

  const sourceProof = await verifyRemoteChangeSet(request, target, baseCommit, changeSet);
  if (!sourceProof.ok) return sourceProof;
  const treeEntries = [];
  for (const change of changeSet.changes) {
    if (change.status === "deleted") {
      treeEntries.push({ path: change.path, mode: change.mode, type: "blob", sha: null });
      continue;
    }
    const blob = await request("POST", repoPath(target, "/git/blobs"), {
      content: change.contentBase64,
      encoding: "base64"
    });
    const blobSha = String(blob.data?.sha || "");
    if (!blob.ok || !validSha(blobSha)) return failure("github_publish_blob_create_failed");
    treeEntries.push({ path: change.path, mode: change.mode, type: "blob", sha: blobSha });
  }

  const tree = await request("POST", repoPath(target, "/git/trees"), { base_tree: baseTree, tree: treeEntries });
  const treeSha = String(tree.data?.sha || "");
  if (!tree.ok || !validSha(treeSha)) return failure("github_publish_tree_create_failed");
  const commit = await request("POST", repoPath(target, "/git/commits"), {
    message: `smejj.com verified job ${job.id}`,
    tree: treeSha,
    parents: [baseCommit]
  });
  const commitSha = String(commit.data?.sha || "");
  if (!commit.ok || !validSha(commitSha)) return failure("github_publish_commit_create_failed");

  const baseBeforeBranch = await readRef(request, target, baseRef);
  if (!baseBeforeBranch.ok || baseBeforeBranch.sha !== baseCommit) return failure("github_publish_remote_base_changed");
  const branchResult = await createOrVerifyBranch(request, target, branch, commitSha);
  if (!branchResult.ok) return branchResult;
  const baseBeforePr = await readRef(request, target, baseRef);
  if (!baseBeforePr.ok || baseBeforePr.sha !== baseCommit) return failure("github_publish_remote_base_changed_after_branch");

  const pullRequest = await createOrFindDraftPullRequest(request, target, {
    title: safeTitle(title || job.task),
    body: safeBody(body, job, changeSet),
    head: branch,
    base: baseRef
  });
  if (!pullRequest.ok) return pullRequest;
  const verified = await verifyPublishedState(request, target, {
    branch,
    baseRef,
    baseCommit,
    commitSha,
    number: pullRequest.number
  });
  if (!verified.ok) return verified;
  return {
    ok: true,
    status: "draft_pr_created",
    repository: target.fullName,
    draftPullRequest: {
      number: pullRequest.number,
      url: pullRequest.url,
      draft: true,
      branch,
      baseRef,
      commit: commitSha
    },
    mergePerformed: false,
    permissions: PUBLISH_PERMISSIONS,
    baseCommitVerified: true,
    changeSetVerified: true
  };
}

export async function issueGithubPublisherToken({ target, env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const config = publisherConfig(env);
  if (!config.configured) return failure("github_publisher_app_not_configured", { missing: config.missing });
  let jwt;
  try {
    jwt = issueGithubAppJwt({ appId: config.appId, privateKey: config.privateKey, nowMs });
  } catch {
    return failure("github_publisher_app_credentials_invalid");
  }
  let response;
  try {
    response = await fetchImpl(`${config.apiBase}/app/installations/${config.installationId}/access_tokens`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: githubHeaders(jwt),
      body: JSON.stringify({ repositories: [target.repo], permissions: PUBLISH_PERMISSIONS })
    });
  } catch {
    return failure("github_publisher_token_unreachable");
  }
  const data = await response.json().catch(() => ({}));
  const token = String(data.token || "");
  const expiresAtMs = Date.parse(data.expires_at);
  const repositoryProof = Array.isArray(data.repositories)
    && data.repositories.length === 1
    && String(data.repositories[0]?.full_name || "").toLowerCase() === target.fullName.toLowerCase();
  if (response.status !== 201
    || !/^[a-zA-Z0-9_.-]{20,500}$/.test(token)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= nowMs + 60_000
    || expiresAtMs > nowMs + MAX_TOKEN_TTL_MS + 60_000
    || !repositoryProof
    || !permissionsExactly(data.permissions, PUBLISH_PERMISSIONS)) {
    return failure(`github_publisher_token_status_${response.status}`);
  }
  return { ok: true, token, expiresAt: new Date(expiresAtMs).toISOString(), repository: target.fullName };
}

function validatePublication(job, env) {
  if (job?.status !== "passed" || job?.approval?.status !== "human_approved") return failure("github_publish_human_approval_required");
  const diffSha256 = String(job?.result?.diffSha256 || "");
  if (!validDigest(diffSha256) || job.approval.approvedDiffSha256 !== diffSha256) {
    return failure("github_publish_diff_approval_mismatch");
  }
  let target;
  try { target = githubTarget(job?.repository?.url); }
  catch { return failure("github_publish_repository_invalid"); }
  const allowlist = new Set(String(env.SMEJJ_GITHUB_PUBLISH_REPOSITORY_ALLOWLIST || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!allowlist.size || !allowlist.has(target.fullName.toLowerCase())) return failure("github_publish_repository_not_allowed");
  if (job.repository?.visibility === "private") return failure("github_free_private_draft_pr_unavailable");
  const baseRef = String(job.repository?.baseRef || "main");
  const baseCommit = String(job.result?.repository?.baseCommit || job.repository?.baseCommit || "");
  const branch = expectedBranch(job.id);
  if (!validRef(baseRef) || !validSha(baseCommit) || job.result?.repository?.branch !== branch) {
    return failure("github_publish_repository_state_invalid");
  }
  const changeSet = normalizeChangeSet(job.result?.changeSet, { diffSha256, baseCommit });
  if (!changeSet.ok) return changeSet;
  return { ok: true, target, baseRef, baseCommit, branch, changeSet: changeSet.value };
}

function normalizeChangeSet(value, { diffSha256, baseCommit }) {
  if (value?.schemaVersion !== 1
    || value.diffSha256 !== diffSha256
    || value.baseCommit !== baseCommit
    || !Array.isArray(value.changes)
    || value.changes.length < 1
    || value.changes.length > MAX_CHANGED_FILES) return failure("github_publish_change_set_invalid");
  const seen = new Set();
  let totalBytes = 0;
  const changes = [];
  for (const entry of value.changes) {
    const status = String(entry?.status || "");
    const filePath = String(entry?.path || "");
    const mode = String(entry?.mode || "");
    if (!new Set(["added", "modified", "deleted"]).has(status)
      || !safeRepositoryPath(filePath)
      || seen.has(filePath)
      || !new Set(["100644", "100755"]).has(mode)) return failure("github_publish_change_set_invalid");
    seen.add(filePath);
    const baseBlobSha = entry.baseBlobSha === null ? null : String(entry.baseBlobSha || "");
    if ((status === "added" && baseBlobSha !== null) || (status !== "added" && !validSha(baseBlobSha))) {
      return failure("github_publish_change_set_invalid");
    }
    if (status === "deleted") {
      if (entry.contentBase64 !== null || entry.contentSha256 !== null || Number(entry.bytes) !== 0) {
        return failure("github_publish_change_set_invalid");
      }
      changes.push({ status, path: filePath, mode, baseBlobSha, bytes: 0, contentSha256: null, contentBase64: null });
      continue;
    }
    let content;
    try { content = Buffer.from(String(entry.contentBase64 || ""), "base64"); }
    catch { return failure("github_publish_change_set_invalid"); }
    if (content.length !== Number(entry.bytes)
      || sha256(content) !== entry.contentSha256
      || content.includes(0)
      || !Buffer.from(content.toString("utf8"), "utf8").equals(content)) return failure("github_publish_change_set_invalid");
    totalBytes += content.length;
    if (totalBytes > MAX_CHANGE_SET_BYTES) return failure("github_publish_change_set_too_large");
    changes.push({ status, path: filePath, mode, baseBlobSha, bytes: content.length, contentSha256: entry.contentSha256, contentBase64: entry.contentBase64 });
  }
  if (Number(value.totalBytes) !== totalBytes) return failure("github_publish_change_set_invalid");
  return { ok: true, value: { schemaVersion: 1, baseCommit, diffSha256, totalBytes, changes } };
}

async function verifyRemoteChangeSet(request, target, baseCommit, changeSet) {
  for (const change of changeSet.changes) {
    const path = `/contents/${encodePath(change.path)}?ref=${encodeURIComponent(baseCommit)}`;
    const current = await request("GET", repoPath(target, path), undefined, { allow404: true });
    if (change.status === "added") {
      if (current.status !== 404) return failure("github_publish_added_path_exists");
      continue;
    }
    if (!current.ok
      || current.data?.type !== "file"
      || String(current.data?.sha || "") !== change.baseBlobSha) {
      return failure("github_publish_base_blob_changed");
    }
  }
  return { ok: true };
}

async function createOrVerifyBranch(request, target, branch, commitSha) {
  const created = await request("POST", repoPath(target, "/git/refs"), { ref: `refs/heads/${branch}`, sha: commitSha }, { allow422: true });
  if (created.ok) return { ok: true, created: true };
  if (created.status !== 422) return failure("github_publish_branch_create_failed");
  const existing = await readRef(request, target, branch);
  return existing.ok && existing.sha === commitSha
    ? { ok: true, created: false, idempotent: true }
    : failure("github_publish_branch_conflict");
}

async function createOrFindDraftPullRequest(request, target, input) {
  const created = await request("POST", repoPath(target, "/pulls"), { ...input, draft: true, maintainer_can_modify: false }, { allow422: true });
  if (created.ok) return normalizePullRequest(created.data);
  if (created.status !== 422) return failure("github_publish_pull_request_create_failed");
  const query = `?state=open&head=${encodeURIComponent(`${target.owner}:${input.head}`)}&base=${encodeURIComponent(input.base)}`;
  const existing = await request("GET", repoPath(target, `/pulls${query}`));
  if (!existing.ok || !Array.isArray(existing.data) || existing.data.length !== 1) return failure("github_publish_pull_request_conflict");
  return normalizePullRequest(existing.data[0]);
}

async function verifyPublishedState(request, target, expected) {
  const branch = await readRef(request, target, expected.branch);
  if (!branch.ok || branch.sha !== expected.commitSha) return failure("github_publish_branch_verification_failed");
  const pull = await request("GET", repoPath(target, `/pulls/${expected.number}`));
  if (!pull.ok
    || pull.data?.state !== "open"
    || pull.data?.draft !== true
    || pull.data?.merged === true
    || String(pull.data?.head?.ref || "") !== expected.branch
    || String(pull.data?.head?.sha || "") !== expected.commitSha
    || String(pull.data?.base?.ref || "") !== expected.baseRef
    || String(pull.data?.base?.sha || "") !== expected.baseCommit) {
    return failure("github_publish_pull_request_verification_failed");
  }
  return { ok: true };
}

function githubRequester({ token, fetchImpl }) {
  return async (method, path, body, options = {}) => {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: githubHeaders(token),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      return { ok: false, status: 0, data: null };
    }
    const data = await response.json().catch(() => null);
    const allowed = (options.allow404 && response.status === 404) || (options.allow422 && response.status === 422);
    return { ok: response.ok, status: response.status, data, allowed };
  };
}

async function readRef(request, target, ref) {
  const result = await request("GET", repoPath(target, `/git/ref/heads/${encodePath(ref)}`));
  const sha = String(result.data?.object?.sha || "");
  return result.ok && validSha(sha) ? { ok: true, sha } : failure("github_publish_ref_unavailable");
}

function normalizePullRequest(value) {
  const number = Number(value?.number);
  const url = String(value?.html_url || "");
  if (!Number.isSafeInteger(number) || number < 1 || !/^https:\/\/github\.com\//.test(url)) {
    return failure("github_publish_pull_request_response_invalid");
  }
  return { ok: true, number, url };
}

function publisherConfig(env) {
  const appId = String(env.SMEJJ_GITHUB_PUBLISHER_APP_ID || "").trim();
  const installationId = String(env.SMEJJ_GITHUB_PUBLISHER_APP_INSTALLATION_ID || "").trim();
  const privateKey = publisherPrivateKey(env);
  const missing = [
    !/^[0-9]{1,20}$/.test(appId) && "SMEJJ_GITHUB_PUBLISHER_APP_ID",
    !/^[0-9]{1,20}$/.test(installationId) && "SMEJJ_GITHUB_PUBLISHER_APP_INSTALLATION_ID",
    !privateKey && "SMEJJ_GITHUB_PUBLISHER_APP_PRIVATE_KEY_BASE64"
  ].filter(Boolean);
  return { configured: missing.length === 0, missing, appId, installationId, privateKey, apiBase: "https://api.github.com" };
}

function publisherPrivateKey(env) {
  try {
    const key = Buffer.from(String(env.SMEJJ_GITHUB_PUBLISHER_APP_PRIVATE_KEY_BASE64 || ""), "base64").toString("utf8").trim();
    return /^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(key) ? key : "";
  } catch {
    return "";
  }
}

function githubTarget(value) {
  const url = new URL(String(value || ""));
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !match) throw new Error("repository_invalid");
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "smejj.com-control-publisher"
  };
}

function permissionsExactly(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
    && expectedKeys.every((key) => actual[key] === expected[key]);
}

function safeRepositoryPath(value) {
  const path = String(value || "");
  if (!path || path.length > 500 || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) return false;
  return !/(^|\/)(?:\.git|\.env(?:\.|$)|\.npmrc$|\.pypirc$|id_rsa$|id_ed25519$|credentials$|secrets?)(?:\/|$)/i.test(path);
}

function expectedBranch(jobId) {
  const safe = String(jobId || "job").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  return `smejj.com/agent/${safe}`;
}

function safeTitle(value) {
  return String(value || "Verified smejj.com change").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "Verified smejj.com change";
}

function safeBody(value, job, changeSet) {
  const prefix = [
    "Verified by the smejj.com coding pipeline.",
    "",
    `Job: ${job.id}`,
    `Diff SHA-256: ${changeSet.diffSha256}`,
    `Changed files: ${changeSet.changes.length}`,
    "Merge performed: no"
  ].join("\n");
  const suffix = String(value || "").trim().slice(0, 2_000);
  return suffix ? `${prefix}\n\n${suffix}` : prefix;
}

function repoPath(target, suffix) {
  return `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}${suffix}`;
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function validRef(value) {
  const ref = String(value || "");
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(ref) && !ref.includes("..") && !ref.endsWith("/");
}

function validSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value || ""));
}

function validDigest(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}
