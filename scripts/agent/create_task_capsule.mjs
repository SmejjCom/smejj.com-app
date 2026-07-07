#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROJECT_ID = "project_smejj_app_example";
const DEFAULT_JOB_ID = "job_local_example";

const STANDARD_EXCLUSIONS = [
  [".git/", "git internals are never model context"],
  ["node_modules/", "dependency cache is too large and reproducible"],
  [".pnpm-store/", "local package store is not project context"],
  ["model-files/", "model weights stay in IDrive e2 and are never repo context"],
  ["idrive-layout/model-files/", "model vault examples are not loaded as weights"],
  ["tmp/", "local generated output is not source context"]
];

const DEFAULT_CANDIDATES = [
  ["AGENTS.md", "local agent rules"],
  ["README.md", "project entry policy"],
  ["docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md", "GLM-5.2-first architecture policy"],
  ["docs/model-management/GLM_5_2_STORAGE.md", "GLM-5.2 vault status"],
  ["idrive-layout/manifests/models/registry.json", "model registry"],
  ["src/ai/router.js", "AI routing behavior"],
  ["scripts/validate-manifests.mjs", "manifest validation rules"],
  ["package.json", "available checks"]
];

export function buildContextPlan({
  rootDir = process.cwd(),
  jobId = DEFAULT_JOB_ID,
  projectId = DEFAULT_PROJECT_ID,
  maxContextTokens = 1000000,
  reservedOutputTokens = 16000,
  candidateFiles = DEFAULT_CANDIDATES
} = {}) {
  const selectedFiles = [];
  for (const candidate of candidateFiles) {
    const [filePath, reason = "task-relevant file"] = Array.isArray(candidate)
      ? candidate
      : [candidate.path, candidate.reason];
    if (!filePath || isExcluded(filePath)) continue;
    const absolute = path.join(rootDir, filePath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    selectedFiles.push({
      path: filePath,
      sha256: sha256File(absolute),
      reason
    });
  }

  return {
    schemaVersion: 1,
    jobId,
    projectId,
    planner: {
      strategy: "targeted-repo-pack",
      blindFullRepoLoadAllowed: false
    },
    limits: {
      maxContextTokens,
      reservedOutputTokens
    },
    selectedFiles,
    repoPack: {
      manifestKey: `projects/smejj/repo-pack/${jobId}/manifest.json`,
      symbolGraphKey: "projects/smejj/symbol-graph/current.json",
      ragShardKeys: ["projects/smejj/file-shards/architecture-rules.jsonl"]
    },
    exclusions: STANDARD_EXCLUSIONS.map(([excludedPath, reason]) => ({ path: excludedPath, reason }))
  };
}

export function buildTaskCapsule({
  jobId = DEFAULT_JOB_ID,
  projectId = DEFAULT_PROJECT_ID,
  effort = "high",
  createdAt = "2026-06-25T00:00:00Z"
} = {}) {
  const prefix = `task-capsules/2026/06/${jobId}`;
  return {
    schemaVersion: 1,
    jobId,
    projectId,
    createdAt,
    policy: {
      replayable: true,
      rollbackBeforePatch: true,
      blindFullRepoLoadAllowed: false,
      testsAreTruth: true
    },
    model: {
      id: "glm-5-2",
      effort,
      inferenceDefault: "disabled-until-explicit-compute-approval"
    },
    objects: {
      input: `${prefix}/input.json`,
      budget: `${prefix}/budget.json`,
      contextPlan: `${prefix}/context-plan.json`,
      repoPack: `${prefix}/repo-pack-manifest.json`,
      promptBlocks: `${prefix}/prompt-blocks.json`,
      patch: `${prefix}/patch.diff`,
      testResults: `${prefix}/test-results.json`,
      browserResults: `${prefix}/browser-results.json`,
      screenshots: `${prefix}/screenshots/`,
      errors: `${prefix}/errors.json`,
      selfFixAttempts: `${prefix}/self-fix-attempts.json`,
      verifierReport: `${prefix}/verifier-report.md`,
      benchmarkResults: `${prefix}/benchmark-results.json`,
      rollbackManifest: `${prefix}/rollback-manifest.json`,
      finalAnswer: `${prefix}/final-answer.md`
    },
    verification: {
      required: [
        "rollback-created",
        "patch-applied",
        "targeted-tests-passed",
        "browser-check-passed-when-ui-changed"
      ],
      selfFixMaxAttempts: 3
    },
    memory: {
      learnDirectlyFromModelOutput: false,
      proposalKey: `${prefix}/memory-proposals.json`
    }
  };
}

export function writeTaskCapsuleFiles({ rootDir = process.cwd(), outDir, jobId, projectId, effort } = {}) {
  const outputDir = outDir || path.join(rootDir, "tmp", "task-capsules", jobId || DEFAULT_JOB_ID);
  fs.mkdirSync(outputDir, { recursive: true });
  const contextPlan = buildContextPlan({ rootDir, jobId, projectId });
  const taskCapsule = buildTaskCapsule({ jobId, projectId, effort });
  fs.writeFileSync(path.join(outputDir, "context-plan.json"), `${JSON.stringify(contextPlan, null, 2)}
`);
  fs.writeFileSync(path.join(outputDir, "task-capsule.json"), `${JSON.stringify(taskCapsule, null, 2)}
`);
  return { outputDir, contextPlan, taskCapsule };
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isExcluded(filePath) {
  return STANDARD_EXCLUSIONS.some(([excludedPath]) => filePath === excludedPath || filePath.startsWith(excludedPath));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--job-id") {
      args.jobId = value;
      index += 1;
    } else if (key === "--project-id") {
      args.projectId = value;
      index += 1;
    } else if (key === "--effort") {
      args.effort = value;
      index += 1;
    } else if (key === "--out") {
      args.outDir = value;
      index += 1;
    }
  }
  return args;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = writeTaskCapsuleFiles(parseArgs(process.argv));
  console.log(JSON.stringify({ ok: true, outputDir: result.outputDir }, null, 2));
}
