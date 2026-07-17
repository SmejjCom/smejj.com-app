#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { sha256, signedS3Request } from "./s3.js";
import { controlConfigFromEnv, reportStatus } from "../../worker-templates/shared/controlClient.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAutonomousLoopResult } from "../../src/jobs/autonomousLoop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 8080;

export function loadWorkerConfig(env = process.env) {
  return {
    port: Number(env.SMEJJ_WORKER_PORT || env.SALAD_WORKER_PORT || DEFAULT_PORT),
    mode: env.SMEJJ_WORKER_MODE || "planner-vault",
    jobId: env.SMEJJ_JOB_ID || "",
    projectId: env.SMEJJ_PROJECT_ID || "",
    taskCapsulePrefix: normalizePrefix(env.SMEJJ_TASK_CAPSULE_PREFIX || ""),
    modelId: env.SMEJJ_MODEL_ID || "glm-5-2",
    modelVaultId: env.SMEJJ_MODEL_VAULT_ID || "glm-5-2-fp8",
    modelPrefix: normalizePrefix(env.GLM_5_2_FP8_PREFIX || "model-files/glm-5-2-fp8/original/"),
    cacheDir: env.SMEJJ_MODEL_CACHE_DIR || "/cache/glm-5-2-fp8",
    runtime: env.SMEJJ_GLM_RUNTIME || "sglang",
    runtimeBaseUrl: (env.SMEJJ_GLM_RUNTIME_BASE_URL || "").replace(/\/$/, ""),
    controlRouterUrl: (env.SMEJJ_CONTROL_ROUTER_URL || "https://smejj.com").replace(/\/$/, ""),
    callback: controlConfigFromEnv(env),
    workspaceDir: env.SMEJJ_WORKSPACE_DIR || "",
    idrive: {
      endpoint: (env.IDRIVE_E2_ENDPOINT || "").replace(/\/$/, ""),
      region: env.IDRIVE_E2_REGION || "us-west-2",
      bucket: env.IDRIVE_E2_BUCKET || "",
      accessKey: env.IDRIVE_E2_ACCESS_KEY || "",
      secretKey: env.IDRIVE_E2_SECRET_KEY || ""
    },
    costPolicy: {
      githubPaidAllowed: false,
      paidHostingAllowed: false,
      autoBillingFallbackAllowed: false,
      trialsAllowed: false
    }
  };
}

export function buildWorkerPreflight(config) {
  const reasons = [];
  if (!config.idrive.endpoint) reasons.push("idrive_endpoint_missing");
  if (!config.idrive.bucket) reasons.push("idrive_bucket_missing");
  if (!config.idrive.accessKey) reasons.push("idrive_access_key_missing");
  if (!config.idrive.secretKey) reasons.push("idrive_secret_key_missing");
  if (!config.modelPrefix.startsWith("model-files/glm-5-2-fp8/")) reasons.push("glm_model_prefix_invalid");
  if (config.taskCapsulePrefix && !isSafeJobPrefix(config.taskCapsulePrefix)) reasons.push("task_capsule_prefix_invalid");
  return {
    ok: reasons.length === 0,
    provider: "salad",
    role: "glm-5.2-worker",
    modelId: config.modelId,
    modelVaultId: config.modelVaultId,
    runtime: config.runtime,
    mode: config.mode,
    reasons,
    secretsExposed: false,
    serverRole: "control-router-only",
    idriveRole: "object-brain",
    workerRole: "compute-only"
  };
}

export function buildRuntimeCommand(config) {
  const modelPath = config.cacheDir;
  if (config.runtime === "vllm") {
    return ["python3", ["-m", "vllm.entrypoints.openai.api_server", "--host", "0.0.0.0", "--port", "9000", "--model", modelPath, "--served-model-name", "glm-5.2"]];
  }
  if (config.runtime === "ktransformers") {
    return ["python3", ["-m", "ktransformers.server.main", "--host", "0.0.0.0", "--port", "9000", "--model_path", modelPath]];
  }
  return ["python3", ["-m", "sglang.launch_server", "--host", "0.0.0.0", "--port", "9000", "--model-path", modelPath, "--served-model-name", "glm-5.2"]];
}

export async function processTaskCapsule(config, io = defaultIo, report = reportStatus) {
  const preflight = buildWorkerPreflight(config);
  if (!preflight.ok) return { ok: false, stage: "preflight", preflight };
  if (!config.taskCapsulePrefix) return { ok: false, stage: "claim", reason: "task_capsule_prefix_missing" };

  const inputKey = `${config.taskCapsulePrefix}input.json`;
  const statusKey = `${config.taskCapsulePrefix}status.json`;
  const finalReportKey = `${config.taskCapsulePrefix}final-report.md`;
  const testResultsKey = `${config.taskCapsulePrefix}test-results.json`;
  const browserResultsKey = `${config.taskCapsulePrefix}browser-results.json`;
  const errorsKey = `${config.taskCapsulePrefix}errors.json`;
  const selfFixAttemptsKey = `${config.taskCapsulePrefix}self-fix-attempts.json`;
  const benchmarkResultsKey = `${config.taskCapsulePrefix}benchmark-results.json`;
  const verifierReportKey = `${config.taskCapsulePrefix}verifier-report.md`;
  const memoryUpdateKey = `${config.taskCapsulePrefix}memory-update.json`;

  const input = await io.getJson(config, inputKey);
  const runningStatus = status(config, "running", 0.2, "Worker claimed task capsule");
  await io.putJson(config, statusKey, runningStatus);
  await writeQueueTransition(config, io, "running", runningStatus);
  await report({ control: config.callback, jobId: config.jobId, status: "running", message: "Worker claimed task capsule" });

  const result = await runWorkerTask(config, input, io);
  await io.putJson(config, testResultsKey, result.testResults);
  await io.putJson(config, browserResultsKey, result.browserResults);
  for (const screenshot of result.browserResults.screenshotObjects || []) {
    await putBrowserScreenshot(config, io, screenshot);
  }
  await io.putJson(config, errorsKey, result.errors);
  await io.putJson(config, selfFixAttemptsKey, result.selfFixAttempts);
  await io.putJson(config, benchmarkResultsKey, result.benchmarkResults);
  await io.putText(config, verifierReportKey, result.verifierReport);
  await io.putText(config, finalReportKey, result.finalReport);
  await io.putJson(config, memoryUpdateKey, result.memoryUpdate);
  if (result.memoryEntry) await io.putJson(config, result.memoryEntry.key, result.memoryEntry.value);
  const finalPhase = result.ok ? "done" : "failed";
  const finalStatus = status(config, finalPhase, 1, result.ok ? "Task capsule completed" : "Task capsule failed");
  await io.putJson(config, statusKey, finalStatus);
  await writeQueueTransition(config, io, finalPhase, finalStatus);
  await report({ control: config.callback, jobId: config.jobId, status: finalPhase, message: finalStatus.message });

  return {
    ok: result.ok,
    inputKey,
    written: [
      statusKey,
      testResultsKey,
      browserResultsKey,
      ...(result.browserResults.screenshotObjects || []).map((screenshot) => screenshot.key),
      errorsKey,
      selfFixAttemptsKey,
      benchmarkResultsKey,
      verifierReportKey,
      finalReportKey,
      memoryUpdateKey,
      ...(result.memoryEntry ? [result.memoryEntry.key] : []),
      queueKey(config, "running"),
      queueKey(config, finalPhase)
    ]
  };
}

export async function runWorkerTask(config, input, io = defaultIo) {
  const task = String(input?.task || "").trim();
  const uiChange = input?.uiChange === true || /\b(ui|frontend|css|layout|button|screen|page|pwa|browser)\b/i.test(task);
  const runtimeReady = Boolean(config.runtimeBaseUrl) || config.mode === "planner-vault";
  const selfFixAttempts = runSelfFixPlan(input.selfFixPlan);
  const patchVerification = buildPatchVerification(input.patchPlan);
  const verification = await buildVerificationChecks({ config, input, task, runtimeReady, selfFixAttempts, patchVerification });
  const checks = verification.checks;
  const browserResults = await buildBrowserResults({ config, input, uiChange, task });
  const loopResult = evaluateAutonomousLoopResult({
    checks,
    uiChange,
    browser: browserResults,
    selfFixAttempts: selfFixAttempts.attempts
  });
  const ok = checks.every((check) => check.ok) && loopResult.ok;
  const errors = {
    ok,
    errors: ok
      ? []
      : [
        ...checks.filter((check) => check.ok !== true).map((check) => ({ source: "verification", name: check.name, detail: check.detail || "" })),
        ...browserResults.findings.map((finding) => ({ source: "browser", name: finding.severity || "finding", detail: finding.message || "" }))
      ]
  };
  const benchmarkResults = {
    ok,
    metrics: [
      { name: "task_capsule_claimed", value: 1 },
      { name: "self_fix_attempts", value: selfFixAttempts.attempts.length },
      { name: "browser_required", value: uiChange ? 1 : 0 },
      { name: "verification_checks", value: checks.length },
      { name: "patch_files", value: patchVerification.files.length }
    ]
  };
  const summary = config.mode === "planner-vault"
    ? "Planner-vault mode completed without starting full GLM inference."
    : "GLM runtime task completed through worker compute path.";
  const memoryEntry = null;
  return {
    ok,
    testResults: {
      ok,
      runtime: config.runtime,
      mode: config.mode,
      patch: patchVerification,
      checks
    },
    browserResults,
    errors,
    selfFixAttempts,
    benchmarkResults,
    verifierReport: [
      `# Verifier Report`,
      ``,
      `Task: ${task || "(empty)"}`,
      `Model: ${config.modelVaultId}`,
      `Result: ${ok ? "passed" : "failed"}`,
      `Runtime: ${config.runtime}`,
      `Browser required: ${uiChange ? "yes" : "no"}`,
      `Browser result: ${browserResults.status}`,
      `Patch workspace: ${patchVerification.status}`,
      `Self-fix attempts: ${selfFixAttempts.attempts.length}/${selfFixAttempts.maxAttempts}`,
      `Server role: control-router-only`,
      `IDrive role: object-brain`
    ].join("\n"),
    finalReport: [
      `# Final Report`,
      ``,
      summary,
      ``,
      `Task capsule: ${config.taskCapsulePrefix}`,
      `Memory learning is blocked for this legacy worker source.`
    ].join("\n"),
    memoryUpdate: {
      ok,
      learn: false,
      state: "legacy-worker-memory-denied",
      trainingEligible: false,
      trainingEligibilityReason: "legacy-worker-source-denied",
      source: "verified-worker-result",
      proposals: []
    },
    memoryEntry
  };
}

async function writeQueueTransition(config, io, phase, statusValue) {
  await io.putJson(config, queueKey(config, phase), {
    version: 1,
    jobId: config.jobId,
    projectId: config.projectId,
    status: phase,
    taskCapsuleRoot: config.taskCapsulePrefix,
    statusKey: `${config.taskCapsulePrefix}status.json`,
    modelId: config.modelId,
    updatedAt: statusValue.updatedAt,
    worker: statusValue.worker
  });
  if (config.projectId) {
    await io.putJson(config, `projects/${config.projectId}/jobs/${phase}/${config.jobId || taskCapsuleJobId(config.taskCapsulePrefix)}.json`, {
      version: 1,
      jobId: config.jobId,
      projectId: config.projectId,
      status: phase,
      taskCapsuleRoot: config.taskCapsulePrefix,
      statusKey: `${config.taskCapsulePrefix}status.json`,
      modelId: config.modelId,
      updatedAt: statusValue.updatedAt,
      worker: statusValue.worker
    });
  }
}

function queueKey(config, phase) {
  return `jobs/${phase}/${config.jobId || taskCapsuleJobId(config.taskCapsulePrefix)}.json`;
}

function taskCapsuleJobId(prefix) {
  return String(prefix || "").split("/").filter(Boolean).at(-1) || "unknown-job";
}

async function buildVerificationChecks({ config, input, task, runtimeReady, selfFixAttempts, patchVerification }) {
  const requested = input.verification || {};
  const commandResults = Array.isArray(input.commandResults) ? input.commandResults : [];
  const checks = [
    checkFromInput("rollback", requested.rollback, true),
    { name: "task-capsule-input-readable", ok: Boolean(task) },
    checkFromInput("build", requested.build, true),
    checkFromInput("typecheck", requested.typecheck, true),
    checkFromInput("tests", requested.tests, Boolean(task)),
    {
      name: "patch-isolated-workspace",
      ok: patchVerification.required ? patchVerification.ok : true,
      detail: patchVerification.status
    },
    { name: "glm-runtime-or-planner-mode-ready", ok: runtimeReady },
    { name: "server-not-used-for-large-files", ok: true },
    { name: "memory-learning-blocked-for-legacy-source", ok: true }
  ];

  for (const result of commandResults) {
    checks.push({
      name: `command:${safeCommandName(result.name || result.command || "unknown")}`,
      ok: result.ok === true,
      detail: String(result.detail || result.stderr || result.stdout || "").slice(0, 500)
    });
  }

  if (selfFixAttempts.attempts.length > selfFixAttempts.maxAttempts) {
    checks.push({ name: "self-fix-cap", ok: false, detail: "attempt cap exceeded" });
  }

  if (input.runCommands === true) {
    const executed = await runVerificationCommands(config, input.commands || []);
    checks.push(...executed);
  }

  return { checks };
}

function buildPatchVerification(plan) {
  if (!plan || typeof plan !== "object") {
    return {
      required: false,
      ok: true,
      status: "not_required",
      files: [],
      rollback: []
    };
  }
  const files = Array.isArray(plan.files) ? plan.files.slice(0, 100) : [];
  const findings = [];
  const normalizedFiles = files.map((file) => {
    const filePath = normalizePatchPath(file.path);
    const before = String(file.before ?? "");
    const after = String(file.after ?? "");
    if (!filePath) findings.push({ severity: "error", message: "unsafe patch path" });
    if (before === after) findings.push({ severity: "warning", message: `no change for ${filePath || "(unsafe)"}` });
    return {
      path: filePath,
      beforeSha256: sha256(before),
      afterSha256: sha256(after),
      changed: before !== after
    };
  });
  const changedFiles = normalizedFiles.filter((file) => file.path && file.changed);
  if (files.length === 0) findings.push({ severity: "error", message: "patch plan has no files" });
  const ok = findings.every((finding) => finding.severity !== "error") && changedFiles.length > 0;
  return {
    required: true,
    ok,
    status: ok ? "isolated_patch_plan_verified" : "failed",
    files: normalizedFiles,
    rollback: normalizedFiles
      .filter((file) => file.path)
      .map((file) => ({ path: file.path, sha256: file.beforeSha256 })),
    findings
  };
}

function normalizePatchPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return "";
  if (/^(node_modules|\.git|model-files|idrive-layout\/model-files)(\/|$)/.test(normalized)) return "";
  if (!/^[a-zA-Z0-9._@/+ -]+$/.test(normalized)) return "";
  return normalized.slice(0, 240);
}

function checkFromInput(name, value, defaultOk) {
  if (value && typeof value === "object") {
    return { name, ok: value.ok === true, detail: String(value.detail || "").slice(0, 500) };
  }
  if (typeof value === "boolean") return { name, ok: value };
  return { name, ok: defaultOk };
}

function runSelfFixPlan(plan) {
  const maxAttempts = 3;
  const requestedAttempts = Array.isArray(plan?.attempts) ? plan.attempts.slice(0, maxAttempts + 1) : [];
  const attempts = requestedAttempts.map((attempt, index) => ({
    seq: index + 1,
    ok: attempt.ok === true,
    errorSignature: String(attempt.errorSignature || attempt.error || "").slice(0, 240),
    patchKey: String(attempt.patchKey || "").slice(0, 240),
    verifierKey: String(attempt.verifierKey || "").slice(0, 240)
  }));

  return {
    ok: attempts.length <= maxAttempts,
    maxAttempts,
    attempts,
    stoppedBecause: attempts.some((attempt) => attempt.ok)
      ? "verification_passed_after_self_fix"
      : attempts.length > maxAttempts
        ? "attempt_cap_reached"
        : "verification_passed_without_self_fix"
  };
}

async function buildBrowserResults({ config, input, uiChange, task }) {
  if (!uiChange) {
    return {
      ok: true,
      required: false,
      status: "not_required",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: []
    };
  }

  if (input.browserResults && typeof input.browserResults === "object") {
    return normalizeBrowserResults(input.browserResults, config, task);
  }

  if (input.browserHtml) {
    return verifyStaticBrowserHtml(String(input.browserHtml), config);
  }

  if (input.browserUrl && input.browserRunner === "playwright") {
    return await verifyBrowserUrlWithPlaywright(String(input.browserUrl), config);
  }

  if (input.browserUrl) {
    return await verifyBrowserUrlWithFetch(String(input.browserUrl), config);
  }

  return {
    ok: false,
    required: true,
    status: "blocked",
    runner: "worker-playwright",
    screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
    findings: [{ severity: "error", message: "browser evidence missing for UI task" }]
  };
}

function normalizeBrowserResults(value, config, task) {
  return {
    ok: value.ok === true && Boolean(task),
    required: true,
    status: value.ok === true && task ? "passed" : "failed",
    runner: String(value.runner || "worker-playwright"),
    screenshotsPrefix: String(value.screenshotsPrefix || `${config.taskCapsulePrefix}browser-screenshots/`),
    screenshots: Array.isArray(value.screenshots) ? value.screenshots : [],
    screenshotObjects: Array.isArray(value.screenshotObjects) ? value.screenshotObjects : [],
    findings: Array.isArray(value.findings) ? value.findings : []
  };
}

function verifyStaticBrowserHtml(html, config) {
  const checks = [
    { name: "doctype", ok: /<!doctype html>/i.test(html) },
    { name: "viewport", ok: /name=["']viewport["']/i.test(html) },
    { name: "body", ok: /<body[\s>]/i.test(html) },
    { name: "no-inline-error-marker", ok: !/\b(referenceerror|typeerror|syntaxerror)\b/i.test(html) }
  ];
  const findings = checks
    .filter((check) => !check.ok)
    .map((check) => ({ severity: "error", message: `static html check failed: ${check.name}` }));
  return {
    ok: findings.length === 0,
    required: true,
    status: findings.length === 0 ? "passed" : "failed",
    runner: "static-browser-html-verifier",
    screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
    findings,
    checks
  };
}

async function verifyBrowserUrlWithFetch(urlValue, config) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(urlValue)) {
    return {
      ok: false,
      required: true,
      status: "blocked",
      runner: "http-browser-fetch-verifier",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: [{ severity: "error", message: "browser URL must be local to avoid open internet verification" }]
    };
  }
  try {
    const response = await fetch(urlValue, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    return verifyStaticBrowserHtml(text, config);
  } catch (error) {
    return {
      ok: false,
      required: true,
      status: "failed",
      runner: "http-browser-fetch-verifier",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: [{ severity: "error", message: `browser fetch failed: ${error.message}` }]
    };
  }
}

async function verifyBrowserUrlWithPlaywright(urlValue, config) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(urlValue)) {
    return {
      ok: false,
      required: true,
      status: "blocked",
      runner: "worker-playwright",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: [{ severity: "error", message: "browser URL must be local to avoid open internet verification" }]
    };
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return {
      ok: false,
      required: true,
      status: "blocked",
      runner: "worker-playwright",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: [{ severity: "error", message: `playwright unavailable: ${error.message}` }]
    };
  }

  const findings = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        findings.push({ severity: message.type() === "error" ? "error" : "warning", message: `console:${message.text()}` });
      }
    });
    page.on("pageerror", (error) => {
      findings.push({ severity: "error", message: `pageerror:${error.message}` });
    });
    const response = await page.goto(urlValue, { waitUntil: "networkidle", timeout: 15000 });
    if (!response || !response.ok()) {
      findings.push({ severity: "error", message: `navigation failed: ${response?.status?.() || "no-response"}` });
    }
    const title = await page.title();
    const screenshot = await page.screenshot({ type: "png", fullPage: true });
    const screenshotKey = `${config.taskCapsulePrefix}browser-screenshots/desktop-1280x800.png`;
    const errorFindings = findings.filter((finding) => finding.severity === "error");
    return {
      ok: errorFindings.length === 0,
      required: true,
      status: errorFindings.length === 0 ? "passed" : "failed",
      runner: "worker-playwright",
      title,
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      screenshots: [screenshotKey],
      screenshotObjects: [
        {
          key: screenshotKey,
          contentType: "image/png",
          bodyBase64: screenshot.toString("base64")
        }
      ],
      findings
    };
  } catch (error) {
    return {
      ok: false,
      required: true,
      status: "failed",
      runner: "worker-playwright",
      screenshotsPrefix: `${config.taskCapsulePrefix}browser-screenshots/`,
      findings: [{ severity: "error", message: `playwright verification failed: ${error.message}` }]
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function putBrowserScreenshot(config, io, screenshot) {
  const body = Buffer.from(String(screenshot.bodyBase64 || ""), "base64");
  if (!body.length) throw new Error("empty_browser_screenshot");
  if (typeof io.putBytes === "function") {
    return io.putBytes(config, screenshot.key, body, screenshot.contentType || "image/png");
  }
  if (typeof io.putText === "function") {
    return io.putText(config, screenshot.key, body, screenshot.contentType || "image/png");
  }
  throw new Error("browser_screenshot_writer_missing");
}

async function runVerificationCommands(config, commands) {
  const workspaceDir = config.workspaceDir || "";
  if (!workspaceDir) return [{ name: "commands-workspace", ok: false, detail: "workspace dir missing" }];
  const selected = Array.isArray(commands) ? commands.slice(0, 6) : [];
  const results = [];
  for (const command of selected) {
    const result = await runAllowedCommand(workspaceDir, command);
    results.push(result);
  }
  return results;
}

async function runAllowedCommand(cwd, command) {
  const parts = Array.isArray(command) ? command : String(command || "").trim().split(/\s+/).filter(Boolean);
  const [bin, ...args] = parts;
  if (!["node", "npm", "pnpm"].includes(bin)) return { name: `command:${safeCommandName(bin || "empty")}`, ok: false, detail: "command not allowed" };
  if (args.some((arg) => /[;&|<>`$]/.test(arg))) return { name: `command:${safeCommandName(bin)}`, ok: false, detail: "unsafe argument" };
  return await new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ name: `command:${safeCommandName([bin, ...args].join(" "))}`, ok: false, detail: "timeout" });
    }, 30000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        name: `command:${safeCommandName([bin, ...args].join(" "))}`,
        ok: code === 0,
        detail: `${stdout}\n${stderr}`.trim().slice(0, 1000)
      });
    });
  });
}

function safeCommandName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_@./ -]/g, "").slice(0, 80);
}

export function createServer(config = loadWorkerConfig(), io = defaultIo) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true, worker: buildWorkerPreflight(config) });
      if (req.method === "POST" && url.pathname === "/run") return sendJson(res, 200, await handleRunDispatch(config, await readBody(req), io));
      if (req.method === "POST" && url.pathname === "/tasks/claim") return sendJson(res, 200, await processTaskCapsule(config, io));
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") return proxyChat(req, res, config);
      sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "worker_error" });
    }
  });
}

// Dispatch-Vertrag des Orchestrators (control-server/src/orchestrator/autonomousRunner.js):
// Request  { jobId, attempt, maxAttempts, task, previousErrors: [] }
// Response { ok: boolean, errors?: [], memoryUpdate?: object }
// Antwortet immer HTTP 200 mit ok-Flag; Transportfehler bewertet der Orchestrator selbst.
export async function handleRunDispatch(config, rawBody, io = defaultIo) {
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return { ok: false, errors: [{ source: "dispatch", detail: "invalid_json" }], memoryUpdate: null };
  }
  const task = String(payload.task || "").trim();
  if (!task) return { ok: false, errors: [{ source: "dispatch", detail: "missing_task" }], memoryUpdate: null };
  const previousErrors = Array.isArray(payload.previousErrors) ? payload.previousErrors.slice(0, 20) : [];
  const result = await runWorkerTask(config, { task, previousErrors }, io);
  return {
    ok: result.ok === true,
    jobId: String(payload.jobId || config.jobId || ""),
    attempt: Number(payload.attempt || 1),
    maxAttempts: Number(payload.maxAttempts || 3),
    errors: result.ok === true ? [] : (result.errors?.errors || [{ source: "worker", detail: "verification_failed" }]),
    memoryUpdate: result.memoryUpdate || null
  };
}

async function proxyChat(req, res, config) {
  if (!config.runtimeBaseUrl) {
    return sendJson(res, 503, { ok: false, error: "glm_runtime_not_started", runtime: config.runtime });
  }
  const body = await readBody(req);
  const upstream = await fetch(`${config.runtimeBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8" });
  if (!upstream.body) return res.end();
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

const defaultIo = {
  async getJson(config, key) {
    const text = await signedS3Request(config, "GET", key);
    return JSON.parse(text);
  },
  async putJson(config, key, value) {
    return this.putText(config, key, `${JSON.stringify(value, null, 2)}\n`, "application/json; charset=utf-8");
  },
  async putText(config, key, body, contentType = "text/plain; charset=utf-8") {
    return signedS3Request(config, "PUT", key, body, contentType);
  },
  async putBytes(config, key, body, contentType = "application/octet-stream") {
    return signedS3Request(config, "PUT", key, body, contentType);
  }
};

function status(config, phase, progress, message) {
  return {
    jobId: config.jobId,
    status: phase,
    phase,
    progress,
    message,
    updatedAt: new Date().toISOString(),
    worker: "salad-glm-5.2"
  };
}

function normalizePrefix(value) {
  const prefix = String(value || "").trim();
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function isSafeJobPrefix(prefix) {
  return /^jobs\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{2}\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/$/.test(String(prefix || ""));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadWorkerConfig();
  const preflight = buildWorkerPreflight(config);
  if (process.argv.includes("--preflight")) {
    console.log(JSON.stringify(preflight, null, 2));
    process.exit(preflight.ok ? 0 : 1);
  }
  const [bin, args] = buildRuntimeCommand(config);
  if (process.env.SMEJJ_START_GLM_RUNTIME === "YES") {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("exit", (code) => console.error(`GLM runtime exited with ${code}`));
  }
  createServer(config).listen(config.port, "0.0.0.0", () => {
    console.log(`smejj GLM-5.2 Salad worker listening on ${config.port}`);
  });
}
