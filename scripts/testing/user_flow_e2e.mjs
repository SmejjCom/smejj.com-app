const baseUrl = process.env.SMEJJ_E2E_BASE_URL || "http://127.0.0.1:3100";
const checks = [];
const tempPath = "tmp/e2e-user-flow-generated.js";
const fixedContent = [
  "export function describeE2eUserFlow() {",
  "  return { ok: true, flow: 'chat-code-upload-repair-versioning' };",
  "}",
  ""
].join("\n");

async function check(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    checks.push({ name, ok: true, ms: Date.now() - started, result });
  } catch (error) {
    checks.push({ name, ok: false, ms: Date.now() - started, error: error.message || String(error) });
  }
}

async function request(path, options = {}, timeoutMs = 7_000) {
  const response = await fetch(baseUrl + path, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
}

async function get(path, timeoutMs) {
  return request(path, {}, timeoutMs);
}

async function postJson(path, payload, timeoutMs) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, timeoutMs);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(response, allowed, label = "status") {
  assert(allowed.includes(response.status), label + " " + response.status);
}

await check("browser shell routes load", async () => {
  const root = await get("/");
  assert(root.response.ok, "root " + root.response.status);
  assert(root.text.includes('id="start"'), "missing start view");
  assert(root.text.includes('id="code"'), "missing code view");
  assert(root.text.includes('id="files"'), "missing files view");
  assert(root.text.includes('manifest.webmanifest'), "missing PWA manifest link");
  for (const path of ["/home", "/chat", "/code", "/files", "/projects", "/profile", "/settings"]) {
    const result = await get(path);
    assert(result.response.ok, path + " " + result.response.status);
    assert(result.text.includes("smejj.com"), path + " missing shell");
  }
  return "routes-ok";
});

await check("pwa seo security surfaces load", async () => {
  for (const path of ["/manifest.webmanifest", "/sw.js", "/robots.txt", "/sitemap.xml", "/llms.txt"]) {
    const result = await get(path);
    assert(result.response.ok, path + " " + result.response.status);
    assert(result.text.length > 20, path + " empty");
  }
  const root = await get("/");
  assert((root.response.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), "missing frame CSP");
  assert(root.response.headers.get("x-frame-options") === "DENY", "missing frame deny");
  return "pwa-security-ok";
});

await check("upload validation accepts safe text files and blocks unsafe files", async () => {
  const { validateUploadBatch } = await import("../../src/shared/securityPolicy.js");
  const safe = validateUploadBatch([{ name: "notes.md", size: 512, type: "text/markdown" }]);
  assert(safe.ok, "safe upload rejected: " + safe.reason);
  const unsafe = validateUploadBatch([{ name: "malware.exe", size: 512, type: "application/x-msdownload" }]);
  assert(!unsafe.ok && unsafe.reason === "upload_mime_not_allowed", "unsafe upload not blocked");
  const page = await get("/files");
  assert(page.text.includes('id="upload"'), "missing upload input");
  assert(page.text.includes("application/json") && page.text.includes("image/svg+xml"), "upload accept list drifted");
  return "upload-policy-ok";
});

await check("chat starts and streams local coding response", async () => {
  const result = await postJson("/api/agent", {
    task: "Analysiere public/config.js und gib einen kurzen Coding-Hinweis.",
    files: ["public/config.js"]
  });
  assert(result.response.ok, "agent " + result.response.status);
  assert(result.text.includes("kostenlosen smejj-Local-Modus"), "missing local response");
  assert(!result.text.includes("Server-KI disabled"), "old disabled response returned");
  return "chat-stream-ok";
});

await check("project file can be read for code analysis", async () => {
  const result = await postJson("/api/files/read", { path: "public/config.js" });
  assert(result.response.ok, "read " + result.response.status);
  assert(result.body?.content?.includes("CLIENT_ROUTES"), "config source not returned");
  return result.body.path;
});

await check("write preview does not mutate project file", async () => {
  const result = await postJson("/api/files/write", {
    path: tempPath,
    content: "export const previewOnly = true;\n",
    apply: false
  });
  assert(result.response.ok, "preview " + result.response.status);
  assert(result.body?.approved === false, "preview unexpectedly wrote file");
  return "preview-only";
});

await check("coding task writes a broken file and detects the error", async () => {
  const written = await postJson("/api/files/write", {
    path: tempPath,
    content: "export const broken = ;\n",
    apply: true
  });
  assert(written.response.ok, "write broken " + written.response.status);
  assert(written.body?.approved === true, "broken test file was not saved");
  const checkResult = await postJson("/api/terminal/run", { command: "node --check " + tempPath });
  assert(checkResult.response.ok, "terminal " + checkResult.response.status);
  assert(checkResult.body?.code !== 0, "broken file was not detected");
  assert(String(checkResult.body?.stderr || "").length > 0, "missing syntax error output");
  return "bug-detected";
});

await check("automatic repair writes fixed code and terminal check passes", async () => {
  const repaired = await postJson("/api/files/write", {
    path: tempPath,
    content: fixedContent,
    apply: true
  });
  assert(repaired.response.ok, "repair " + repaired.response.status);
  assert(repaired.body?.approved === true, "fixed file was not saved");
  const readBack = await postJson("/api/files/read", { path: tempPath });
  assert(readBack.body?.content === fixedContent, "fixed content was not read back");
  const checkResult = await postJson("/api/terminal/run", { command: "node --check " + tempPath });
  assert(checkResult.response.ok, "terminal repair " + checkResult.response.status);
  assert(checkResult.body?.code === 0, checkResult.body?.stderr || "fixed code failed syntax check");
  return "bug-repaired";
});

await check("frontend tests run through app terminal", async () => {
  const result = await postJson("/api/terminal/run", { command: "npm run check:frontend" }, 35_000);
  assert(result.response.ok, "terminal tests " + result.response.status);
  assert(result.body?.code === 0, result.body?.stderr || result.body?.stdout || "frontend tests failed");
  assert(/pass\s+1[5-9]/.test(String(result.body?.stdout || "")), "frontend pass count missing");
  return "frontend-tests-ok";
});

await check("storage model and salad preflight stay fail-closed", async () => {
  const storage = await get("/api/storage/status", 6_000);
  assertStatus(storage.response, [200, 502], "storage status");
  assert(storage.body?.provider === "idrive-e2" || storage.body?.storageRole === "primary", "wrong storage provider");
  const modelsStarted = Date.now();
  const models = await get("/api/models/status", 6_000);
  assert(models.response.ok, "models " + models.response.status);
  assert(Date.now() - modelsStarted < 6_000, "models status too slow");
  assert(Array.isArray(models.body?.models) && models.body.models.length >= 1, "missing models");
  const preflight = await get("/api/workers/preflight?mode=full-model", 6_000);
  assert(preflight.response.status === 409, "preflight " + preflight.response.status);
  assert(preflight.body?.preflight?.reasons?.includes("glm_5_2_full_run_blocked_on_300gb_salad_worker"), "missing GLM/Salad block");
  return "safe-status-ok";
});

await check("versioning reports repository state and ignores temp E2E artifact", async () => {
  const result = await get("/api/git/status");
  assert(result.response.ok, "git " + result.response.status);
  assert(result.body?.code === 0, result.body?.stderr || "git status failed");
  assert(!String(result.body?.stdout || "").includes(tempPath), "ignored temp file leaked into git status");
  return "git-status-ok";
});

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ baseUrl, ok: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
