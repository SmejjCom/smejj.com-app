import crypto from "node:crypto";

const GITHUB_API_VERSION = "2026-03-10";
const TOKEN_TTL_MS = 60 * 60_000;

export function githubAppConfig(env = process.env) {
  const appId = String(env.SMEJJ_GITHUB_APP_ID || "").trim();
  const installationId = String(env.SMEJJ_GITHUB_APP_INSTALLATION_ID || "").trim();
  const privateKey = privateKeyFromEnv(env);
  const missing = [
    !/^[0-9]{1,20}$/.test(appId) && "SMEJJ_GITHUB_APP_ID",
    !/^[0-9]{1,20}$/.test(installationId) && "SMEJJ_GITHUB_APP_INSTALLATION_ID",
    !privateKey && "SMEJJ_GITHUB_APP_PRIVATE_KEY or SMEJJ_GITHUB_APP_PRIVATE_KEY_BASE64"
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    appId,
    installationId,
    privateKey,
    apiBase: "https://api.github.com"
  };
}

export function issueGithubAppJwt({ appId, privateKey, nowMs = Date.now() } = {}) {
  if (!/^[0-9]{1,20}$/.test(String(appId || ""))) throw new Error("github_app_id_invalid");
  if (!validPrivateKey(privateKey)) throw new Error("github_app_private_key_invalid");
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const nowSeconds = Math.floor(Number(nowMs) / 1000);
  const payload = base64UrlJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: String(appId)
  });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

export async function issueGithubRepositoryToken({
  repository,
  write = false,
  env = process.env,
  fetchImpl = fetch,
  nowMs = Date.now()
} = {}) {
  if (write !== false) return failure("trusted_publisher_boundary_required");
  const target = githubTarget(repository?.url);
  enforceRepositoryAllowlist(target, env);
  const config = githubAppConfig(env);
  if (!config.configured) return failure("github_app_not_configured", { missing: config.missing });
  const jwt = issueGithubAppJwt({ appId: config.appId, privateKey: config.privateKey, nowMs });
  const permissions = { contents: "read", metadata: "read" };
  let response;
  try {
    response = await fetchImpl(`${config.apiBase}/app/installations/${config.installationId}/access_tokens`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "smejj.com-control"
      },
      body: JSON.stringify({ repositories: [target.repo], permissions })
    });
  } catch {
    return failure("github_installation_token_unreachable");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status !== 201) return failure(`github_installation_token_status_${response.status}`);
  const token = String(data.token || "");
  const expiresAtMs = Date.parse(data.expires_at);
  const repositoryProof = Array.isArray(data.repositories)
    && data.repositories.length === 1
    && String(data.repositories[0]?.full_name || "").toLowerCase() === target.fullName.toLowerCase();
  if (!/^[a-zA-Z0-9_.-]{20,500}$/.test(token)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= nowMs + 60_000
    || expiresAtMs > nowMs + TOKEN_TTL_MS + 60_000
    || !repositoryProof
    || !permissionsExactly(data.permissions, permissions)) {
    return failure("github_installation_token_response_invalid");
  }
  return {
    ok: true,
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    repository: target.fullName,
    permissions
  };
}

export async function attachGithubInstallationToken(payload, { env = process.env, fetchImpl = fetch } = {}) {
  if (!payload?.repository?.url) return payload;
  const privateRepository = payload.repository.visibility === "private";
  const publishing = payload.approval?.createDraftPr === true;
  if (publishing) throw new Error("trusted_publisher_boundary_required");
  if (!privateRepository && !publishing) return payload;
  const issued = await issueGithubRepositoryToken({
    repository: payload.repository,
    write: false,
    env,
    fetchImpl
  });
  if (issued.ok !== true) throw new Error(issued.reason || "github_installation_token_failed");
  return {
    ...payload,
    repository: { ...payload.repository, token: issued.token },
    credentialLease: {
      provider: "github-app",
      repository: issued.repository,
      expiresAt: issued.expiresAt,
      permissions: issued.permissions,
      persisted: false
    }
  };
}

export function publicGithubAppStatus(env = process.env) {
  const config = githubAppConfig(env);
  return { configured: config.configured, missing: config.missing };
}

export function assertGithubRepositoryAllowed(repository, env = process.env) {
  const target = githubTarget(repository?.url);
  enforceRepositoryAllowlist(target, env);
  return target;
}

function privateKeyFromEnv(env) {
  const encoded = String(env.SMEJJ_GITHUB_APP_PRIVATE_KEY_BASE64 || "").trim();
  let value = String(env.SMEJJ_GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (encoded) {
    try { value = Buffer.from(encoded, "base64").toString("utf8").trim(); }
    catch { return ""; }
  }
  return validPrivateKey(value) ? value : "";
}

function validPrivateKey(value) {
  const key = String(value || "");
  return /^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(key);
}

function githubTarget(value) {
  let parsed;
  try { parsed = new URL(String(value || "")); }
  catch { throw new Error("github_repository_invalid"); }
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || !match) throw new Error("github_repository_invalid");
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

function enforceRepositoryAllowlist(target, env) {
  const owners = new Set(String(env.SMEJJ_GITHUB_OWNER_ALLOWLIST || env.SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST || "")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!owners.size || !owners.has(target.owner.toLowerCase())) throw new Error("github_repository_owner_not_allowed");
  const repositories = new Set(String(env.SMEJJ_GITHUB_REPOSITORY_ALLOWLIST || "")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (repositories.size && !repositories.has(target.fullName.toLowerCase())) {
    throw new Error("github_repository_not_allowed");
  }
}

function permissionsExactly(actual, required) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const requiredKeys = Object.keys(required).sort();
  return JSON.stringify(actualKeys) === JSON.stringify(requiredKeys)
    && requiredKeys.every((name) => actual[name] === required[name]);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}
