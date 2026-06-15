import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

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
    if (req.method === "GET" && url.pathname === "/") return serveFile(res, "index.html", "text/html");
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const file = url.pathname.replace("/assets/", "");
      const type = file.endsWith(".css") ? "text/css" : "application/javascript";
      return serveFile(res, file, type);
    }
    if (req.method === "POST" && url.pathname === "/api/chat") return handleChat(req, res);
    if (req.method === "POST" && url.pathname === "/api/agent") return handleAgent(req, res);
    if (req.method === "POST" && url.pathname === "/api/files/read") return handleRead(req, res);
    if (req.method === "POST" && url.pathname === "/api/files/write") return handleWrite(req, res);
    if (req.method === "POST" && url.pathname === "/api/terminal/run") return handleTerminal(req, res);
    if (req.method === "GET" && url.pathname === "/api/git/status") return handleGitStatus(res);
    if (req.method === "POST" && url.pathname === "/api/git/commit") return handleGitCommit(req, res);
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

async function streamLLM(res, messages) {
  if (!config.apiKey) return json(res, 400, { error: "Missing SMEJJ_LLM_API_KEY" });
  res.writeHead(200, {
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

async function serveFile(res, file, contentType) {
  const safePath = path.resolve(publicDir, file);
  if (!safePath.startsWith(publicDir + path.sep) && safePath !== publicDir) return json(res, 403, { error: "Forbidden" });
  res.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
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
