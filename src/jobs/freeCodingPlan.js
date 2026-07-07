const DEFAULT_CONTEXT_FILES = Object.freeze([
  ["AGENTS.md", "agent and free-only rules"],
  ["README.md", "project overview"],
  ["package.json", "available build, typecheck and test commands"],
  ["docs/architecture/FREE_ONLY_MASTER_POLICY.md", "free-only cost policy"],
  ["docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md", "GLM-5.2 coding OS target architecture"]
]);

const EXCLUDED_PREFIXES = Object.freeze([
  ".git/",
  "node_modules/",
  ".pnpm-store/",
  "model-files/",
  "idrive-layout/model-files/",
  "tmp/"
]);

export function buildFreeCodingExecutionPlan({ job, body = {}, codingFlow = {}, now = new Date().toISOString() } = {}) {
  if (!job?.taskCapsule?.rootPrefix) throw new Error("Task capsule is required");

  const fileRefs = normalizeFileRefs(body.files || body.fileRefs || body.contextFiles || []);
  const selectedFiles = selectContextFiles(fileRefs);
  const uiChange = codingFlow.verification?.uiChange === true;
  const commands = codingFlow.verification?.commands || ["build", "typecheck", "tests"];

  return {
    ok: true,
    mode: "free-ai-coding-plan",
    createdAt: now,
    model: {
      primary: "glm-5-2",
      inference: "disabled_until_explicit_budget_and_worker_start",
      freePlanner: true
    },
    repoPack: {
      status: "planned",
      strategy: "targeted-repo-pack",
      manifestKey: job.taskCapsule.repoPackManifest,
      selectedContextKey: job.taskCapsule.selectedContext,
      selectedFiles,
      excludedPrefixes: EXCLUDED_PREFIXES,
      fullRepoUploadRequired: false,
      blindFullRepoLoadAllowed: false
    },
    contextPlanner: {
      status: "planned",
      contextPlanKey: job.taskCapsule.contextPlan,
      promptBlocksKey: job.taskCapsule.promptBlocks,
      rules: [
        "read task capsule first",
        "load only selected repo-pack files",
        "prefer tests and package scripts as truth",
        "do not load model weights through the control router"
      ]
    },
    patchPlan: {
      status: "awaiting_worker_or_local_executor",
      patchKey: job.taskCapsule.patch,
      rollbackManifestKey: job.taskCapsule.rollbackManifest,
      finalPatchRequires: [
        "rollback-manifest-written",
        "build-passed",
        "typecheck-passed",
        "tests-passed",
        ...(uiChange ? ["browser-screenshot-passed"] : [])
      ],
      selfFixMaxAttempts: 3
    },
    verification: {
      status: "pending",
      commands,
      testResultsKey: job.taskCapsule.testResults,
      browserResultsKey: job.taskCapsule.browserResults,
      screenshotsPrefix: job.taskCapsule.browserScreenshots,
      uiChange
    },
    workerHandoff: {
      status: "blocked_until_explicit_budget",
      provider: "salad",
      taskCapsuleRoot: job.taskCapsule.rootPrefix,
      startWorker: false,
      inferenceStarted: false,
      stopAfterIdleMinutes: 5
    },
    memory: {
      status: "blocked_until_verified_success",
      updateKey: job.taskCapsule.memoryUpdate,
      learnFromFailedRuns: false
    }
  };
}

function selectContextFiles(fileRefs) {
  const explicit = fileRefs.map((filePath) => [filePath, "user referenced file"]);
  const combined = [...explicit, ...DEFAULT_CONTEXT_FILES];
  const seen = new Set();
  const selected = [];

  for (const [filePath, reason] of combined) {
    const normalized = normalizePath(filePath);
    if (!normalized || seen.has(normalized) || isExcluded(normalized)) continue;
    seen.add(normalized);
    selected.push({
      path: normalized,
      reason,
      fingerprint: stableFingerprint(normalized)
    });
    if (selected.length >= 24) break;
  }

  return selected;
}

function normalizeFileRefs(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return list.map(normalizePath).filter(Boolean);
}

function normalizePath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.includes("..") || path.length > 240) return "";
  if (!/^[a-zA-Z0-9._@/+ -]+$/.test(path)) return "";
  return path;
}

function isExcluded(path) {
  return EXCLUDED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function stableFingerprint(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
