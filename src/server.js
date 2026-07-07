import http from "node:http";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { APP_INFO, CAPABILITIES, CONTENT_TYPES, COST_POLICY, GLM_5_2_FP8_STATUS, KIMI_K2_7_STATUS, MODEL_STATUSES, ROUTES, SECURITY_HEADERS, STORAGE } from "./shared/platform.js";
import { SECURITY_LIMITS, isAllowedRequestOrigin } from "./shared/securityPolicy.js";
import { evaluateWorkerPreflight } from "./jobs/index.js";
import { json, readJson } from "../control-server/src/http/respond.js";
import { hmac } from "../control-server/src/shared/hash.js";
import { parseS3Keys, signedS3List } from "../control-server/src/storage/s3Signer.js";
import { handleAutonomousRun, handleCreateJob, handleFreeExecutor, handleJobEvents, handleJobStatus, handleWorkerStatusUpdate } from "../control-server/src/routes/jobRoutes.js";
import { handleSaladCreate, handleSaladGpuClasses, handleSaladPlan, handleSaladStart, handleSaladStatus, handleSaladStop } from "../control-server/src/routes/saladRoutes.js";
import { handleStoragePresign } from "../control-server/src/routes/storagePresignRoutes.js";
import { buildRagContextBlock, searchKnowledge } from "../control-server/src/rag/agentContext.js";
import { classifyProfile, executeWithFallback, resolveChain } from "../control-server/src/llm/modelRouter.js";
import { pipeVisibleModelStream } from "../control-server/src/llm/streamFilter.js";
import { streamLiveInternetAnswer } from "../control-server/src/live/liveInternet.js";
import { corsHeadersFor, handlePreflight } from "../control-server/src/http/cors.js";
import { installCrashGuard } from "../control-server/src/http/crashGuard.js";

installCrashGuard(); // kein stiller Tod: unbehandelte Fehler -> Log mit Stack + Exit 1 (Probes uebernehmen)
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
  baseUrl: (process.env.SMEJJ_LLM_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || process.env.BRIRT_LLM_BASE_URL || "").replace(/\/$/, ""),
  apiKey: process.env.SMEJJ_LLM_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY || process.env.BRIRT_LLM_API_KEY || "",
  model: process.env.SMEJJ_LLM_MODEL || process.env.OPENAI_COMPATIBLE_MODEL || process.env.OPENAI_MODEL || process.env.BRIRT_LLM_MODEL || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleAllowedEmail: (process.env.GOOGLE_ALLOWED_EMAIL || "smejjcom@gmail.com").toLowerCase(),
  sessionSecret: normalizeSecret(process.env.SMEJJ_SESSION_SECRET || process.env.GOOGLE_SESSION_SECRET || "")
};

const forbiddenSegments = new Set([".env", ".git", "node_modules", "dist", "build"]);
const allowedCommands = new Set(["npm", "pnpm", "yarn", "node", "git"]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      if (handlePreflight(req, res)) return; // OPTIONS-Preflight (204 erlaubt / 403 fremd)
      const cors = corsHeadersFor(req.headers.origin);
      if (cors) for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
    }
    if (!isSafeMutatingRequest(req, url)) return json(res, 403, { error: "Origin not allowed" });
    const readMethod = req.method === "GET" || req.method === "HEAD";
    if (readMethod && url.pathname === ROUTES.root) return serveFile(res, "index.html");
    if (readMethod && url.pathname.startsWith("/assets/storage/")) return serveStorageModule(res, url.pathname.replace("/assets/storage/", ""));
    if (readMethod && url.pathname.startsWith("/assets/ai/")) return serveAiModule(res, url.pathname.replace("/assets/ai/", ""));
    if (readMethod && url.pathname.startsWith("/assets/shared/")) return serveSharedModule(res, url.pathname.replace("/assets/shared/", ""));
    if (readMethod && url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.replace("/assets/", ""));
    if (readMethod && isPublicAsset(url.pathname)) return serveFile(res, url.pathname.slice(1));
    if (readMethod && url.pathname === "/impressum") return serveFile(res, "impressum.html");
    if (readMethod && url.pathname === "/datenschutz") return serveFile(res, "datenschutz.html");
    if (readMethod && url.pathname === ROUTES.api.health) return handleHealth(res);
    if (readMethod && url.pathname === ROUTES.api.capabilities) return handleCapabilities(res);
    if (readMethod && url.pathname === ROUTES.api.authConfig) return handleAuthConfig(res);
    if (readMethod && url.pathname === ROUTES.api.authMe) return handleAuthMe(req, res);
    if (readMethod && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await handleGoogleAuthStart(req, res, url);
      } catch (error) {
        return json(res, 400, { error: error.message || "Google Login konnte nicht gestartet werden." });
      }
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await handleGoogleAuth(req, res);
      } catch (error) {
        return json(res, 400, { error: error.message || "Google Login fehlgeschlagen." });
      }
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.authLogout) return handleAuthLogout(res);
    if (readMethod && url.pathname === ROUTES.api.ragSearch) return await handleRagSearch(url, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.chat) return await handleChat(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.agent) return await handleAgent(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileRead) return await handleRead(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileWrite) return await handleWrite(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.terminalRun) return await handleTerminal(req, res);
    if (readMethod && url.pathname === ROUTES.api.gitStatus) return handleGitStatus(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.gitCommit) return await handleGitCommit(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.storagePresign) return await handleStoragePresign(req, res);
    if (readMethod && url.pathname === ROUTES.api.storageStatus) return await handleStorageStatus(res);
    if (readMethod && url.pathname === ROUTES.api.modelStatus) return await handleModelStatus(res, KIMI_K2_7_STATUS, process.env.KIMI_K2_7_PREFIX);
    if (readMethod && url.pathname === ROUTES.api.glmModelStatus) return await handleModelStatus(res, GLM_5_2_FP8_STATUS, process.env.GLM_5_2_FP8_PREFIX);
    if (readMethod && url.pathname === ROUTES.api.modelsStatus) return await handleModelsStatus(res);
    if (readMethod && url.pathname === ROUTES.api.workerPreflight) return await handleWorkerPreflight(url, res);

    if (readMethod && url.pathname === ROUTES.api.saladPlan) return handleSaladPlan(res);
    if (readMethod && url.pathname === ROUTES.api.saladStatus) return await handleSaladStatus(res);
    if (readMethod && url.pathname === ROUTES.api.saladGpuClasses) return await handleSaladGpuClasses(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladCreate) return await handleSaladCreate(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladStart) return await handleSaladStart(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladStop) return await handleSaladStop(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.jobs) return await handleCreateJob(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.freeExecutor) return await handleFreeExecutor(req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/status")) return await handleWorkerStatusUpdate(url, req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/autonomous-run")) return await handleAutonomousRun(url, req, res);
    if (readMethod && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/events")) return handleJobEvents(url, req, res);
    if (readMethod && url.pathname.startsWith(`${ROUTES.api.jobs}/`)) return handleJobStatus(url, res);
    if (readMethod && isAppRoute(url.pathname)) return serveFile(res, "index.html");
    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 500, { error: error.message || "Internal error" });
  }
});

// HOST bleibt lokal 127.0.0.1 (sicher); Container/Salad setzen SMEJJ_HOST=0.0.0.0.
const listenHost = process.env.SMEJJ_HOST || "127.0.0.1";
server.listen(config.port, listenHost, () => {
  console.log(`smejj.com Code MVP: http://${listenHost}:${config.port}`);
  console.log(`Sandbox: ${config.projectRoot}`);
});

// RAG: semantische Suche (BM25) ueber das Projektwissen. Nur lesend, Cache im agentContext-Modul.
async function handleRagSearch(url, res) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return json(res, 400, { ok: false, error: "Missing query parameter q" });
  const hits = await searchKnowledge(config.projectRoot, query, Number(url.searchParams.get("k") || 5));
  return json(res, 200, { ok: true, query, hits });
}

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
  const state = body.state ? verifyGoogleAuthState(String(body.state)) : null;
  const payload = await verifyGoogleIdToken(String(body.credential || body.idToken || ""), state?.nonce);
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
    res.writeHead(303, { ...headers, Location: state?.returnTo || "/profile?google=ok" });
    return res.end();
  }
  res.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ authenticated: true, user }, null, 2));
}

async function handleGoogleAuthStart(req, res, url) {
  if (!config.googleClientId) return json(res, 503, { error: "Google Login ist noch nicht konfiguriert." });
  if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
  const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
  const origin = `${proto}://${req.headers.host}`;
  const nonce = crypto.randomBytes(18).toString("base64url");
  const state = signGoogleAuthState({
    nonce,
    returnTo: "/profile?google=ok",
    exp: Date.now() + 10 * 60 * 1000
  });
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.googleClientId);
  authUrl.searchParams.set("redirect_uri", `${origin}${ROUTES.api.authGoogle}`);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("response_mode", "form_post");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("login_hint", config.googleAllowedEmail);
  res.writeHead(303, { ...SECURITY_HEADERS, Location: authUrl.toString() });
  res.end();
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
  if (await streamLiveInternetAnswer(res, task)) return;

  const fileBlocks = [];
  for (const file of files) {
    const safePath = safeResolve(file);
    const content = await readLimited(safePath, 120_000);
    fileBlocks.push(`--- ${file} ---\n${content}`);
  }
  // Agent recherchiert vor der Aufgabe automatisch im eigenen Projektwissen (fail-closed leer).
  const ragContext = await buildRagContextBlock(config.projectRoot, task, 3);

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
    { role: "user", content: `Task:\n${task}\n\n${ragContext ? `${ragContext}\n\n` : ""}Files:\n${fileBlocks.join("\n\n")}` }
  ];
  return streamLLM(res, messages, classifyProfile(task));
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
  await mkdir(path.dirname(safePath), { recursive: true });
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
      provider: STORAGE.provider,
      bucket,
      prefix: normalizedPrefix,
      status: response.status,
      message: body.slice(0, 300),
      storageRole: STORAGE.role
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

async function handleWorkerPreflight(url, res) {
  const model = MODEL_STATUSES[url.searchParams.get("model") || GLM_5_2_FP8_STATUS.id] || GLM_5_2_FP8_STATUS;
  const mode = url.searchParams.get("mode") || "planner-vault";
  const modelStatus = await readModelStatus(model, model.id === KIMI_K2_7_STATUS.id ? process.env.KIMI_K2_7_PREFIX : process.env.GLM_5_2_FP8_PREFIX);
  const preflight = evaluateWorkerPreflight({
    model,
    liveStorage: modelStatus.liveStorage || {},
    request: {
      mode,
      gpuRequired: mode === "full-model" || mode === "gpu-coding",
      minGpuVramGb: Number(url.searchParams.get("minGpuVramGb") || 24)
    },
    worker: {
      provider: "salad",
      gpuCount: Number(process.env.SALAD_WORKER_GPU_COUNT || 1),
      gpuVramGb: Number(process.env.SALAD_WORKER_GPU_VRAM_GB || 24),
      vcpu: Number(process.env.SALAD_WORKER_VCPU || 16),
      ramGb: Number(process.env.SALAD_WORKER_RAM_GB || 64),
      localCacheGb: Number(process.env.SALAD_WORKER_LOCAL_CACHE_GB || 300),
      quotaRemainingReplicas: Number(process.env.SALAD_QUOTA_REMAINING_REPLICAS || 10)
    }
  });
  json(res, preflight.ok ? 200 : 409, {
    ok: preflight.ok,
    modelStatus,
    preflight
  });
}

async function handleModelsStatus(res) {
  const results = await Promise.all(Object.values(MODEL_STATUSES).map((model) => (
    readModelStatus(model, model.id === KIMI_K2_7_STATUS.id ? process.env.KIMI_K2_7_PREFIX : process.env.GLM_5_2_FP8_PREFIX)
  )));
  json(res, 200, {
    ok: results.every((result) => result.ok || result.model.verification.status === "awaiting-full-weight-transfer"),
    configured: results.some((result) => result.configured),
    models: results,
    router: {
      planner: GLM_5_2_FP8_STATUS.id,
      coder: GLM_5_2_FP8_STATUS.id,
      inferenceDefault: "disabled"
    }
  });
}

async function handleModelStatus(res, model, overridePrefix) {
  json(res, 200, await readModelStatus(model, overridePrefix));
}

async function readModelStatus(model, overridePrefix) {
  const endpoint = process.env.IDRIVE_E2_ENDPOINT;
  const accessKey = process.env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = process.env.IDRIVE_E2_SECRET_KEY;
  const bucket = process.env.IDRIVE_E2_BUCKET;
  const region = process.env.IDRIVE_E2_REGION || "us-west-2";
  const prefix = overridePrefix || (model.verification.status === "awaiting-full-weight-transfer" ? model.sourceArchive?.prefix : model.storage.prefix) || "";
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return {
      ok: true,
      configured: false,
      model,
      liveStorage: {
        ok: false,
        missing: ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]
          .filter((key) => !process.env[key])
      }
    };
  }

  const { response, body } = await signedS3List({
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    prefix
  });
  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      model,
      liveStorage: {
        ok: false,
        bucket,
        prefix,
        status: response.status,
        message: body.slice(0, 300)
      }
    };
  }

  const objectCount = parseS3Keys(body).length;
  const expectedObjectCount = model.verification.sourceFileCount || model.sourceArchive?.archivedObjects?.length || 0;
  const archiveOnlyOk = model.verification.status === "awaiting-full-weight-transfer" && objectCount >= (model.sourceArchive?.archivedObjects?.length || 0);
  return {
    ok: objectCount >= expectedObjectCount,
    configured: true,
    model,
    liveStorage: {
      ok: objectCount >= expectedObjectCount || archiveOnlyOk,
      provider: STORAGE.provider,
      bucket,
      prefix,
      objectCount,
      expectedObjectCount,
      archiveOnlyOk,
      checkedAt: new Date().toISOString()
    }
  };
}

async function streamLLM(res, messages, profile = "default") {
  if (process.env.SMEJJ_SERVER_AI_ENABLED !== "true") {
    return localAssistantStream(res, messages);
  }
  const remaining = Number(process.env.SMEJJ_SERVER_AI_REMAINING || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return json(res, 429, { error: "AI rate limit reached or unclear." });
  }
  // Multi-Modell-Router: Salad (eigene GPU) -> OpenRouter -> generischer Endpoint.
  const chain = resolveChain(profile, process.env);
  if (chain.length === 0) {
    return json(res, 400, {
      error: "AI mode disabled. Configure Salad (SMEJJ_LLM_SALAD_*), OpenRouter (SMEJJ_LLM_OPENROUTER_API_KEY) or a custom endpoint (SMEJJ_LLM_*)."
    });
  }
  const result = await executeWithFallback(chain, messages, { temperature: 1.0 });
  if (!result.ok || !result.response.body) {
    return json(res, 502, { error: "All model backends failed.", attempts: result.attempts });
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "x-smejj-model-backend": `${result.backend}:${result.model}`
  });
  await pipeVisibleModelStream(result.response.body, res);
  res.end();
}

function localAssistantStream(res, messages) {
  const prompt = latestUserMessage(messages);
  const lower = prompt.toLowerCase();
  const wantsGreeting = /^(hi|hallo|hey|servus|moin)\b/i.test(prompt);
  const wantsCode = /\b(code|coding|programm|bug|fehler|test|datei|repo|patch|fix|build)\b/i.test(lower);
  const wantsModel = /\b(glm|kimi|idrive|salad|modell|model|ki|ai|gpu|compute)\b/i.test(lower);
  const reply = buildLocalAssistantReply({ prompt, wantsGreeting, wantsCode, wantsModel });
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function buildLocalAssistantReply({ prompt, wantsGreeting, wantsCode, wantsModel }) {
  if (!prompt) return "Ich bin da. Schreib mir, was ich fuer dich bauen, pruefen oder verbessern soll.";
  if (wantsGreeting) return "Hi, ich bin da. Was soll ich als Naechstes fuer dich bauen oder pruefen?";
  if (wantsCode) {
    return [
      "Verstanden. Ich behandle das als Coding-Aufgabe.",
      "Ich wuerde so vorgehen:",
      "1. Relevante Dateien gezielt lesen.",
      "2. Ursache finden, nicht blind umbauen.",
      "3. Kleine, messbare Aenderung machen.",
      "4. Danach genau den passenden Test laufen lassen.",
      "Sag mir die konkrete Datei, Fehlermeldung oder Aufgabe, dann gehe ich direkt rein."
    ].join("\n");
  }
  if (wantsModel) {
    return [
      "GLM-5.2 ist als IDrive-e2-Vault vorbereitet und bleibt der Hauptpfad fuer Coding und Planung.",
      "Salad/Compute startet nur mit expliziter Freigabe, damit keine GPU-Kosten unbemerkt loslaufen.",
      "Ich kann Architektur, Jobs, Storage, Worker-Planung und Tests hier weiter ausarbeiten."
    ].join("\n");
  }
  return [
    "Verstanden.",
    "Ich kann daraus eine konkrete Aufgabe machen, die Dateien pruefen, einen Plan schreiben oder direkt eine kleine Aenderung umsetzen.",
    "Schick mir den naechsten Schritt oder sag, welchen Bereich ich anfassen soll."
  ].join("\n");
}

function latestUserMessage(messages) {
  const userMessages = Array.isArray(messages) ? messages.filter((message) => message?.role === "user") : [];
  const content = String(userMessages.at(-1)?.content || "").trim();
  return content.replace(/\s+/g, " ").slice(0, 180);
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
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout: "", stderr: error.message || "Command failed to start" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.slice(-20_000), stderr: stderr.slice(-20_000) });
    });
  });
}

function isPublicAsset(pathname) {
  if (pathname.startsWith("/icons/")) return true;
  return [ROUTES.manifest, ROUTES.serviceWorker, ROUTES.robots, ROUTES.llms, ROUTES.sitemap, ROUTES.impressum, ROUTES.datenschutz].includes(pathname);
}

function isAppRoute(pathname) {
  return !path.extname(pathname);
}

// Streamt eine Datei aus einem erlaubten Basisverzeichnis; fehlende Dateien
// antworten mit 404 statt den Prozess zu crashen (ReadStream-ENOENT war fatal).
async function streamFromDir(res, baseDir, file, fallbackDir = null, defaultType = "application/octet-stream") {
  const safePath = path.resolve(baseDir, file);
  if (!safePath.startsWith(baseDir + path.sep) && safePath !== baseDir) return json(res, 403, { error: "Forbidden" });
  const exists = await stat(safePath).then((info) => info.isFile()).catch(() => false);
  if (!exists) {
    if (fallbackDir) return streamFromDir(res, fallbackDir, file, null, defaultType);
    return json(res, 404, { error: "Not found" });
  }
  const contentType = CONTENT_TYPES[path.extname(safePath)] || defaultType;
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
  createReadStream(safePath).pipe(res);
}

async function serveFile(res, file) {
  return streamFromDir(res, publicDir, file);
}

async function serveStorageModule(res, file) {
  return streamFromDir(res, storageSourceDir, file, path.join(publicDir, "storage"), "application/javascript; charset=utf-8");
}

async function serveAiModule(res, file) {
  // Fallback auf public/ai: dort liegen Browser-Module wie chatClient.js.
  return streamFromDir(res, aiSourceDir, file, path.join(publicDir, "ai"), "application/javascript; charset=utf-8");
}

async function serveSharedModule(res, file) {
  return streamFromDir(res, sharedSourceDir, file, path.join(publicDir, "shared"), "application/javascript; charset=utf-8");
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
          return resolve({
            credential: params.get("credential") || "",
            idToken: params.get("id_token") || "",
            state: params.get("state") || "",
            redirect: true
          });
        }
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid auth request"));
      }
    });
  });
}

function isSafeMutatingRequest(req, url) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) return true;
  const origin = String(req.headers.origin || "");
  const allowed = [`http://${req.headers.host}`, "https://smejj.com", "https://www.smejj.com"];
  if (url.pathname === ROUTES.api.authGoogle) allowed.push("https://accounts.google.com");
  return isAllowedRequestOrigin(origin, allowed);
}

async function verifyGoogleIdToken(token, expectedNonce = "") {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Ungueltiges Google Token.");
  const header = parseJwtPart(headerPart);
  const payload = parseJwtPart(payloadPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Ungueltige Google Signatur.");
  if (payload.aud !== config.googleClientId) throw new Error("Google Client-ID passt nicht.");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) throw new Error("Ungueltiger Google Issuer.");
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) throw new Error("Google Token ist abgelaufen.");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("Google Login Nonce passt nicht.");
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

function signGoogleAuthState(data) {
  const payload = base64UrlEncode(JSON.stringify(data));
  const signature = hmac(config.sessionSecret, payload, "base64url");
  return `${payload}.${signature}`;
}

function verifyGoogleAuthState(state) {
  const [payload, signature] = state.split(".");
  const expected = hmac(config.sessionSecret, payload || "", "base64url");
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Google Login State ist ungueltig.");
  }
  const data = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  if (Number(data.exp || 0) <= Date.now()) throw new Error("Google Login State ist abgelaufen.");
  return data;
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
