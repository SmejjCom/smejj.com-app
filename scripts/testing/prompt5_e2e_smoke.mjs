const baseUrl = process.env.SMEJJ_E2E_BASE_URL || "http://127.0.0.1:3000";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(baseUrl);

const checks = [];

async function check(name, fn) {
  try {
    const result = await fn();
    checks.push({ name, ok: true, result });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message || String(error) });
  }
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return { response, text };
}

async function json(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  try {
    return { response, body: JSON.parse(text), text };
  } catch {
    return { response, body: null, text };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await check("desktop shell", async () => {
  const { response, text } = await get("/");
  assert(response.ok, `status ${response.status}`);
  assert(text.includes("<title>smejj.com</title>") || text.includes("smejj.com Code"), "missing brand");
  assert(text.includes("logoutLocal"), "missing logout flow");
  assert(text.includes("manifest.webmanifest"), "missing manifest link");
  return "ok";
});

await check("pwa manifest", async () => {
  const { response, body } = await json("/manifest.webmanifest");
  assert(response.ok, `status ${response.status}`);
  assert(Array.isArray(body.icons) && body.icons.length >= 2, "missing icons");
  return body.display;
});

await check("service worker cache version", async () => {
  const { response, text } = await get("/sw.js");
  assert(response.ok, `status ${response.status}`);
  assert(text.includes("smejj-shell-v4"), "service worker cache not bumped");
  assert(text.includes("/icons/icon.svg"), "icons not cached");
  return "v4";
});

await check("security headers", async () => {
  const { response } = await get("/");
  assert((response.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), "missing CSP frame guard");
  assert((response.headers.get("content-security-policy") || "").includes("https://accounts.google.com"), "missing Google auth CSP");
  assert(response.headers.get("x-frame-options") === "DENY", "missing frame deny");
  assert((response.headers.get("permissions-policy") || "").includes("payment=()"), "missing permissions policy");
  return "ok";
});

await check("health api", async () => {
  const { response, body } = await json("/api/health");
  assert(response.ok, `status ${response.status}`);
  assert(body.ok === true, "health not ok");
  assert(body.storage === true, "storage not configured");
  return body.costPolicy;
});

await check("idrive storage api", async () => {
  const { response, body } = await json("/api/storage/status");
  assert(response.ok, `status ${response.status}`);
  assert(body.ok === true, "storage not ok");
  assert(body.provider === "idrive-e2", "wrong provider");
  return body.storageRole;
});

await check("google auth config has safe shape", async () => {
  const { response, body } = await json("/api/auth/config");
  assert(response.ok, `status ${response.status}`);
  assert(body.configured === false || typeof body.clientId === "string", "invalid auth config shape");
  return body.configured ? "configured" : "not-configured";
});

await check("auth session defaults to logged out", async () => {
  const { response, body } = await json("/api/auth/me");
  assert(response.ok, `status ${response.status}`);
  assert(body.authenticated === false, "unexpected authenticated session");
  assert(body.user === null, "unexpected session user");
  return "logged-out";
});

await check("auth logout clears session", async () => {
  const { response, body } = await json("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert(response.ok, `status ${response.status}`);
  assert(body.authenticated === false, "logout did not return logged-out state");
  assert((response.headers.get("set-cookie") || "").includes("smejj_session="), "missing session clear cookie");
  return "cleared";
});

await check("google auth rejects invalid credential with json", async () => {
  const { body } = await json("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: "bad" })
  });
  assert(typeof body?.error === "string", "invalid credential did not return json error");
  return "rejected";
});

await check("file read ok", async () => {
  const { response, body } = await json("/api/files/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "public/config.js" })
  });
  if (!isLocal) {
    assert(response.status === 403, `online file read should be blocked, got ${response.status}`);
    assert(body.error, "missing online block error");
    return "blocked-online";
  }
  assert(response.ok, `status ${response.status}`);
  assert(body.content.includes("CLIENT_ROUTES"), "missing config content");
  return body.path;
});

await check("forbidden file read fails closed", async () => {
  const { response, body } = await json("/api/files/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "../.env" })
  });
  if (!isLocal) {
    assert(response.status === 403, `online forbidden read should be blocked, got ${response.status}`);
    return "blocked-online";
  }
  assert(body.error === "Path is not allowed", "forbidden path did not fail closed");
  return "blocked";
});

await check("write preview does not mutate", async () => {
  const { response, body } = await json("/api/files/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "tmp/prompt5-preview.txt", content: "preview only", apply: false })
  });
  if (!isLocal) {
    assert(response.status === 403, `online write should be blocked, got ${response.status}`);
    assert(body.error, "missing online write block error");
    return "blocked-online";
  }
  assert(body.approved === false, "preview unexpectedly approved");
  return body.path;
});

await check("chat fallback", async () => {
  const { response, text } = await get("/api/agent");
  assert(response.status === 404 || text.includes("Not found"), "unexpected GET agent response");
  return "fail-closed";
});

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ baseUrl, ok: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
