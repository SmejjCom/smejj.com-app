import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { APP_INFO, CAPABILITIES, CONTENT_TYPES, COST_POLICY, ROUTES, SECURITY_HEADERS, STORAGE } from "./shared/platform.js";
import { SECURITY_LIMITS, isAllowedRequestOrigin } from "./shared/securityPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const storageSourceDir = path.resolve(__dirname, "storage");
const aiSourceDir = path.resolve(__dirname, "ai");
const sharedSourceDir = path.resolve(__dirname, "shared");

loadDotEnv(path.resolve(process.cwd(), ".env.local"));
loadDotEnv(path.resolve(process.cwd(), ".env"));

const config = {
  port: Number(process.env.PORT || 3000),
  projectRoot: path.resolve(process.env.PROJECT_ROOT || process.cwd()),
  baseUrl: (process.env.SMEJJ_LLM_BASE_URL || process.env.BRIRT_LLM_BASE_URL || "").replace(/\/$/, ""),
  apiKey: process.env.SMEJJ_LLM_API_KEY || process.env.BRIRT_LLM_API_KEY || "",
  model: process.env.SMEJJ_LLM_MODEL || process.env.BRIRT_LLM_MODEL || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleAllowedEmail: (process.env.GOOGLE_ALLOWED_EMAIL || "smejjcom@gmail.com").toLowerCase(),
  sessionSecret: normalizeSecret(process.env.SMEJJ_SESSION_SECRET || process.env.GOOGLE_SESSION_SECRET || "")
};

const forbiddenSegments = new Set([".env", ".git", "node_modules", "dist", "build"]);
const allowedCommands = new Set(["npm", "pnpm", "yarn", "node", "git"]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (!isSafeMutatingRequest(req, url)) return json(res, 403, { error: "Origin not allowed" });
    const readMethod = req.method === "GET" || req.method === "HEAD";
    if (readMethod && url.pathname === ROUTES.root) return serveFile(res, "index.html");
    if (readMethod && url.pathname.startsWith("/assets/storage/")) return serveStorageModule(res, url.pathname.replace("/assets/storage/", ""));
    if (readMethod && url.pathname.startsWith("/assets/ai/")) return serveAiModule(res, url.pathname.replace("/assets/ai/", ""));
    if (readMethod && url.pathname.startsWith("/assets/shared/")) return serveSharedModule(res, url.pathname.replace("/assets/shared/", ""));
    if (readMethod && url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.replace("/assets/", ""));
    if (readMethod && isPublicAsset(url.pathname)) return serveFile(res, url.pathname.slice(1));
    if (readMethod && url.pathname === ROUTES.api.health) return handleHealth(res);
    if (readMethod && url.pathname === ROUTES.api.capabilities) return handleCapabilities(res);
    if (readMethod && url.pathname === ROUTES.api.authConfig) return handleAuthConfig(res);
    if (readMethod && url.pathname === ROUTES.api.authMe) return handleAuthMe(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await handleGoogleAuth(req, res);
      } catch (error) {
        return json(res, 400, { error: error.message || "Google Login fehlgeschlagen." });
      }
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.authLogout) return handleAuthLogout(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.chat) return await handleChat(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.agent) return await handleAgent(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileRead) return await handleRead(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileWrite) return await handleWrite(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.terminalRun) return await handleTerminal(req, res);
    if (readMethod && url.pathname === ROUTES.api.gitStatus) return handleGitStatus(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.gitCommit) return await handleGitCommit(req, res);
    if (readMethod && url.pathname === ROUTES.api.storageStatus) return await handleStorageStatus(res);
    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 500, { error: error.message || "Internal error" });
  }
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`smejj.com Code MVP: http://127.0.0.1:${config.port}`);
  console.log(`Sandbox: ${config.projectRoot}`);
});

async function handleChat(req, res) {
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [{ role: "user", content: String(body.message || "") }];
  return streamLLM(res, messages);
}

async function handleHealth(res) {
  json(res, 200, {
    ok: true,
    app: APP_INFO.name,
    costPolicy: COST_POLICY,
    ai: Boolean(config.apiKey),
    storage: Boolean(process.env.IDRIVE_E2_ENDPOINT && process.env.IDRIVE_E2_ACCESS_KEY && process.env.IDRIVE_E2_SECRET_KEY && process.env.IDRIVE_E2_BUCKET)
  });
}

async function handleCapabilities(res) {
  json(res, 200, {
    ok: true,
    app: APP_INFO.name,
    costPolicy: COST_POLICY,
    capabilities: CAPABILITIES
  });
}

function handleAuthConfig(res) {
  json(res, 200, {
    configured: Boolean(config.googleClientId),
    clientId: config.googleClientId,
    allowedEmail: config.googleAllowedEmail
  });
}

function handleAuthMe(req, res) {
  const user = readSession(req);
  json(res, 200, { authenticated: Boolean(user), user });
}

async function handleGoogleAuth(req, res) {
  if (!config.googleClientId) return json(res, 503, { error: "Google Login ist noch nicht konfiguriert." });
  if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
  const body = await readAuthBody(req);
  const payload = await verifyGoogleIdToken(String(body.credential || ""));
  const email = String(payload.email || "").toLowerCase();
  if (!payload.email_verified) return json(res, 403, { error: "Google E-Mail ist nicht verifiziert." });
  if (config.googleAllowedEmail && email !== config.googleAllowedEmail) {
    return json(res, 403, { error: "Dieses Google Konto ist fuer smejj.com nicht freigegeben." });
  }
  const user = {
    email,
    name: String(payload.name || email),
    picture: String(payload.picture || ""),
    sub: String(payload.sub || "")
  };
  const headers = {
    ...SECURITY_HEADERS,
    "Set-Cookie": serializeSessionCookie(user)
  };
  if (body.redirect) {
    res.writeHead(303, { ...headers, Location: "/" });
    return res.end();
  }
  res.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ authenticated: true, user }, null, 2));
}

function handleAuthLogout(res) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": "smejj_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  });
  res.end(JSON.stringify({ authenticated: false }, null, 2));
}

async function handleAgent(req, res) {
  const body = await readJson(req);
  const task = String(body.task || "").trim();
  const files = Array.isArray(body.files) ? body.files.slice(0, 8) : [];
  if (!task) return json(res, 400, { error: "Missing task" });

  const fileBlocks = [];
  for (const file of files) {
    const safePath = safeResolve(file);
    const content = await readLimited(safePath, 120_000);
    fileBlocks.push(`--- ${file} ---\n${content}`);
  }

  const messages = [
    {
      role: "system",
      content: [
        "You are smejj.com Code Agent.",
        "Return a concise plan and unified diff suggestions only.",
        "Do not claim that files were changed.",
        "Dangerous terminal, git, network, secrets, and deletion actions require user approval."
      ].join("\n")
    },
    { role: "user", content: `Task:\n${task}\n\nFiles:\n${fileBlocks.join("\n\n")}` }
  ];
  return streamLLM(res, messages);
}

async function handleRead(req, res) {
  const body = await readJson(req);
  const safePath = safeResolve(body.path);
  const content = await readLimited(safePath, 250_000);
  json(res, 200, { path: path.relative(config.projectRoot, safePath), content });
}

async function handleWrite(req, res) {
  const body = await readJson(req);
  const safePath = safeResolve(body.path);
  const content = String(body.content || "");
  if (content.length > 500_000) return json(res, 413, { error: "File too large" });
  if (body.apply !== true) {
    return json(res, 200, {
      approved: false,
      message: "Preview only. Send apply:true after user review to write.",
      path: path.relative(config.projectRoot, safePath),
      proposedContent: content
    });
  }
  await writeFile(safePath, content, "utf8");
  json(res, 200, { approved: true, path: path.relative(config.projectRoot, safePath) });
}

async function handleTerminal(req, res) {
  const body = await readJson(req);
  const command = String(body.command || "").trim();
  const [bin, ...args] = command.split(/\s+/);
  if (!allowedCommands.has(bin)) return json(res, 403, { error: "Command not allowed" });
  if (/(^| )rm |sudo|curl |wget |chmod |chown |>|>>|\|\||&&|;/.test(command)) {
    return json(res, 403, { error: "Command needs manual review" });
  }
  const result = await run(bin, args, config.projectRoot, 30_000);
  json(res, 200, result);
}

async function handleGitStatus(res) {
  const result = await run("git", ["status", "--short"], config.projectRoot, 10_000);
  json(res, 200, result);
}

async function handleGitCommit(req, res) {
  const body = await readJson(req);
  const message = String(body.message || "").trim();
  if (!message) return json(res, 400, { error: "Missing commit message" });
  const result = await run("git", ["commit", "-am", message], config.projectRoot, 30_000);
  json(res, 200, result);
}

async function handleStorageStatus(res) {
  const endpoint = process.env.IDRIVE_E2_ENDPOINT;
  const accessKey = process.env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = process.env.IDRIVE_E2_SECRET_KEY;
  const bucket = process.env.IDRIVE_E2_BUCKET;
  const region = process.env.IDRIVE_E2_REGION || "us-west-2";
  const prefix = process.env.MODEL_S3_PREFIX || STORAGE.defaultModelPrefix;
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return json(res, 200, {
      configured: false,
      ok: false,
      message: "IDrive e2 is not configured in local environment."
    });
  }

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const { response, body } = await signedS3List({
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    prefix: normalizedPrefix
  });
  if (!response.ok) {
    return json(res, 502, {
      configured: true,
      ok: false,
      bucket,
      prefix: normalizedPrefix,
      status: response.status
    });
  }
  const keys = parseS3Keys(body);
  json(res, 200, {
    configured: true,
    ok: true,
    provider: STORAGE.provider,
    bucket,
    prefix: normalizedPrefix,
    objectCount: keys.length,
    keys,
    storageRole: STORAGE.role
  });
}

async function streamLLM(res, messages) {
  if (process.env.SMEJJ_SERVER_AI_ENABLED !== "true") {
    return json(res, 400, {
      error: "AI mode disabled. Server AI requires explicit enablement and a hard limit."
    });
  }
  const remaining = Number(process.env.SMEJJ_SERVER_AI_REMAINING || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return json(res, 429, { error: "AI rate limit reached or unclear." });
  }
  if (!config.apiKey || !config.baseUrl || !config.model || config.baseUrl === "disabled" || config.model === "disabled") {
    return json(res, 400, {
      error: "AI mode disabled. Configure an explicit BYOK/local endpoint to enable inference."
    });
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 1.0,
      top_p: 0.95
    })
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    res.write(`event: error\ndata: ${JSON.stringify({ error: text })}\n\n`);
    return res.end();
  }

  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

function safeResolve(inputPath) {
  const rel = String(inputPath || "").replace(/^\/+/, "");
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => forbiddenSegments.has(part))) throw new Error("Path is not allowed");
  const resolved = path.resolve(config.projectRoot, rel);
  if (!resolved.startsWith(config.projectRoot + path.sep) && resolved !== config.projectRoot) {
    throw new Error("Path escapes project sandbox");
  }
  return resolved;
}

async function readLimited(file, limit) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Path is not a file");
  if (info.size > limit) throw new Error(`File too large. Limit: ${limit} bytes`);
  return readFile(file, "utf8");
}

function run(bin, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.slice(-20_000), stderr: stderr.slice(-20_000) });
    });
  });
}

function isPublicAsset(pathname) {
  if (pathname.startsWith("/icons/")) return true;
  return [ROUTES.manifest, ROUTES.serviceWorker, ROUTES.robots, ROUTES.llms, ROUTES.sitemap].includes(pathname);
}

async function serveFile(res, file) {
  const safePath = path.resolve(publicDir, file);
  if (!safePath.startsWith(publicDir + path.sep) && safePath !== publicDir) return json(res, 403, { error: "Forbidden" });
  const contentType = CONTENT_TYPES[path.extname(safePath)] || "application/octet-stream";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

async function serveStorageModule(res, file) {
  const safePath = path.resolve(storageSourceDir, file);
  if (!safePath.startsWith(storageSourceDir + path.sep) && safePath !== storageSourceDir) return json(res, 403, { error: "Forbidden" });
  const contentType = CONTENT_TYPES[path.extname(safePath)] || "application/javascript; charset=utf-8";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

async function serveAiModule(res, file) {
  const safePath = path.resolve(aiSourceDir, file);
  if (!safePath.startsWith(aiSourceDir + path.sep) && safePath !== aiSourceDir) return json(res, 403, { error: "Forbidden" });
  const contentType = CONTENT_TYPES[path.extname(safePath)] || "application/javascript; charset=utf-8";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

async function serveSharedModule(res, file) {
  const safePath = path.resolve(sharedSourceDir, file);
  if (!safePath.startsWith(sharedSourceDir + path.sep) && safePath !== sharedSourceDir) return json(res, 403, { error: "Forbidden" });
  const contentType = CONTENT_TYPES[path.extname(safePath)] || "application/javascript; charset=utf-8";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > SECURITY_LIMITS.maxJsonBodyBytes) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function readAuthBody(req) {
  const contentType = String(req.headers["content-type"] || "");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > SECURITY_LIMITS.maxJsonBodyBytes) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(raw);
          return resolve({ credential: params.get("credential") || "", redirect: true });
        }
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid auth request"));
      }
    });
  });
}

function json(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function isSafeMutatingRequest(req, url) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) return true;
  const origin = String(req.headers.origin || "");
  const allowed = [`http://${req.headers.host}`, "https://smejj.com", "https://www.smejj.com"];
  if (url.pathname === ROUTES.api.authGoogle) allowed.push("https://accounts.google.com");
  return isAllowedRequestOrigin(origin, allowed);
}

async function verifyGoogleIdToken(token) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Ungueltiges Google Token.");
  const header = parseJwtPart(headerPart);
  const payload = parseJwtPart(payloadPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Ungueltige Google Signatur.");
  if (payload.aud !== config.googleClientId) throw new Error("Google Client-ID passt nicht.");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) throw new Error("Ungueltiger Google Issuer.");
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) throw new Error("Google Token ist abgelaufen.");
  const key = await getGooglePublicKey(header.kid);
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    base64UrlDecode(signaturePart)
  );
  if (!ok) throw new Error("Google Signatur konnte nicht geprueft werden.");
  return payload;
}

async function getGooglePublicKey(kid) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google Zertifikate konnten nicht geladen werden.");
  const { keys = [] } = await response.json();
  const jwk = keys.find((key) => key.kid === kid);
  if (!jwk) throw new Error("Passendes Google Zertifikat fehlt.");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

function serializeSessionCookie(user) {
  const payload = base64UrlEncode(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  const signature = hmac(config.sessionSecret, payload, "base64url");
  return `smejj_session=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

function readSession(req) {
  const match = String(req.headers.cookie || "").match(/(?:^|;\s*)smejj_session=([^;]+)/);
  if (!match || !config.sessionSecret) return null;
  const [payload, signature] = match[1].split(".");
  const expected = hmac(config.sessionSecret, payload, "base64url");
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const user = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    if (Number(user.exp || 0) <= Date.now()) return null;
    delete user.exp;
    return user;
  } catch {
    return null;
  }
}

function parseJwtPart(part) {
  return JSON.parse(base64UrlDecode(part).toString("utf8"));
}

function base64UrlDecode(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizeSecret(value) {
  const secret = String(value || "").trim();
  if (!secret || secret === "replace_with_long_random_secret") return "";
  return secret;
}

async function signedS3List({ endpoint, region, accessKey, secretKey, bucket, prefix }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const method = "GET";
  const canonicalUri = `/${bucket}`;
  const queryPairs = [
    ["list-type", "2"],
    ["max-keys", "1000"],
    ["prefix", prefix]
  ];
  const canonicalQuery = queryPairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const { amzDate, dateStamp } = getS3Dates(new Date());
  const payloadHash = sha256("");
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ""
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpoint.replace(/\/$/, "")}${canonicalUri}?${canonicalQuery}`;
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    }
  });
  return { response, body: await response.text() };
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256(data, encoding = "hex") {
  return crypto.createHash("sha256").update(data, "utf8").digest(encoding);
}

function getS3Dates(date) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function parseS3Keys(xml) {
  return Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (match) => match[1]);
}

function loadDotEnv(file) {
  try {
    const text = requireReadFile(file);
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional.
  }
}

function requireReadFile(file) {
  return new TextDecoder().decode(createReadStreamSync(file));
}

function createReadStreamSync(file) {
  const fs = globalThis.process.getBuiltinModule ? globalThis.process.getBuiltinModule("fs") : null;
  if (!fs) throw new Error("fs unavailable");
  return fs.readFileSync(file);
}
