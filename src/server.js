import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { APP_INFO, CAPABILITIES, CONTENT_TYPES, COST_POLICY, ROUTES, SECURITY_HEADERS, STORAGE } from "./shared/platform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

loadDotEnv(path.resolve(process.cwd(), ".env.local"));
loadDotEnv(path.resolve(process.cwd(), ".env"));

const config = {
  port: Number(process.env.PORT || 3000),
  projectRoot: path.resolve(process.env.PROJECT_ROOT || process.cwd()),
  baseUrl: (process.env.SMEJJ_LLM_BASE_URL || process.env.BRIRT_LLM_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/$/, ""),
  apiKey: process.env.SMEJJ_LLM_API_KEY || process.env.BRIRT_LLM_API_KEY || "",
  model: process.env.SMEJJ_LLM_MODEL || process.env.BRIRT_LLM_MODEL || "kimi-k2.7-code"
};

const forbiddenSegments = new Set([".env", ".git", "node_modules", "dist", "build"]);
const allowedCommands = new Set(["npm", "pnpm", "yarn", "node", "git"]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const readMethod = req.method === "GET" || req.method === "HEAD";
    if (readMethod && url.pathname === ROUTES.root) return serveFile(res, "index.html");
    if (readMethod && url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.replace("/assets/", ""));
    if (readMethod && isPublicAsset(url.pathname)) return serveFile(res, url.pathname.slice(1));
    if (readMethod && url.pathname === ROUTES.api.health) return handleHealth(res);
    if (readMethod && url.pathname === ROUTES.api.capabilities) return handleCapabilities(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.chat) return handleChat(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.agent) return handleAgent(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileRead) return handleRead(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileWrite) return handleWrite(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.terminalRun) return handleTerminal(req, res);
    if (readMethod && url.pathname === ROUTES.api.gitStatus) return handleGitStatus(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.gitCommit) return handleGitCommit(req, res);
    if (readMethod && url.pathname === ROUTES.api.storageStatus) return handleStorageStatus(res);
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
  if (!config.apiKey) return json(res, 400, { error: "Missing SMEJJ_LLM_API_KEY" });
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
  return [ROUTES.manifest, ROUTES.serviceWorker, ROUTES.robots, ROUTES.llms, ROUTES.sitemap].includes(pathname);
}

async function serveFile(res, file) {
  const safePath = path.resolve(publicDir, file);
  if (!safePath.startsWith(publicDir + path.sep) && safePath !== publicDir) return json(res, 403, { error: "Forbidden" });
  const contentType = CONTENT_TYPES[path.extname(safePath)] || "application/octet-stream";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request too large"));
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

function json(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
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
