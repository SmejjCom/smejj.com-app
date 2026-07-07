import test from "node:test";
import assert from "node:assert/strict";
import { createStorageFirstJobEnvelope, runFreeAppExecutor } from "../src/jobs/index.js";

test("job API envelope creates GLM-5.2 task capsule write plan without starting inference", () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-25T12:00:00Z",
    body: {
      jobId: "job_api_001",
      projectId: "project_smejj",
      task: "Fix the storage-first job route"
    },
    env: {}
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.mode, "glm-5.2-storage-first-job");
  assert.equal(envelope.inferenceStarted, false);
  assert.equal(envelope.idriveConfigured, false);
  assert.equal(envelope.job.model.id, "glm-5-2");
  assert.equal(envelope.job.model.runtime, "glm-5.2-storage-first");
  assert.equal(envelope.job.model.fallback, "disabled");
  assert.equal(envelope.codingFlow.mode, "glm-5.2-ai-coding-os-flow");
  assert.equal(envelope.codingFlow.taskCapsule.ready, true);
  assert.equal(envelope.codingFlow.repoPack.strategy, "targeted-repo-pack");
  assert.equal(envelope.codingFlow.contextPlanner.fullRepoLoadAllowed, false);
  assert.equal(envelope.codingFlow.budget.approved, false);
  assert.equal(envelope.codingFlow.rollback.prepared, true);
  assert.equal(envelope.codingFlow.verification.commands.includes("build"), true);
  assert.equal(envelope.codingFlow.verification.commands.includes("typecheck"), true);
  assert.equal(envelope.codingFlow.verification.commands.includes("tests"), true);
  assert.equal(envelope.codingFlow.memory.learnDirectlyFromModelOutput, false);
  assert.equal(envelope.codingFlow.worker.inferenceStarted, false);
  assert.equal(envelope.codingFlow.worker.autoStartAllowed, false);
  assert.equal(envelope.autonomousLoop.mode, "autonomous-browser-fix-loop-v1");
  assert.equal(envelope.autonomousLoop.maxSelfFixAttempts, 3);
  assert.equal(envelope.autonomousLoop.gates.patchFinalWithoutTests, false);
  assert.equal(envelope.autonomousLoop.gates.memoryLearnsFromFailedRun, false);
  assert.equal(envelope.freeCodingPlan.mode, "free-ai-coding-plan");
  assert.equal(envelope.freeCodingPlan.model.primary, "glm-5-2");
  assert.equal(envelope.freeCodingPlan.repoPack.blindFullRepoLoadAllowed, false);
  assert.equal(envelope.freeCodingPlan.patchPlan.selfFixMaxAttempts, 3);
  assert.equal(envelope.freeCodingPlan.workerHandoff.inferenceStarted, false);
  assert.equal(envelope.taskCapsuleWritePlan.provider, "idrive-e2");
  assert.equal(envelope.queueWritePlan.mode, "manifest-queue-idrive-only");
  assert.equal(envelope.queueWritePlan.currentEntryKey, "jobs/open/job_api_001.json");
  assert.equal(envelope.queueWritePlan.entry.taskCapsuleRoot, envelope.job.taskCapsule.rootPrefix);
  assert.ok(envelope.taskCapsuleWritePlan.objects.some((object) => object.key.endsWith("input.json")));
  assert.equal(envelope.preflight.decision, "reject");
  assert.ok(envelope.preflight.reasons.includes("idrive_model_objects_missing"));
});

test("job API builds a targeted free repo-pack plan from referenced files", () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-25T12:00:00Z",
    body: {
      jobId: "job_api_004",
      projectId: "project_smejj",
      task: "Fix UI route and add tests",
      files: ["src/server.js", "public/app.js", "node_modules/hidden.js", "../secret"]
    },
    env: {}
  });

  const paths = envelope.freeCodingPlan.repoPack.selectedFiles.map((file) => file.path);
  assert.ok(paths.includes("src/server.js"));
  assert.ok(paths.includes("public/app.js"));
  assert.ok(paths.includes("package.json"));
  assert.equal(paths.includes("node_modules/hidden.js"), false);
  assert.equal(paths.includes("../secret"), false);
  assert.equal(envelope.freeCodingPlan.patchPlan.finalPatchRequires.includes("browser-screenshot-passed"), true);
  assert.equal(envelope.autonomousLoop.browser.required, true);
  assert.equal(envelope.autonomousLoop.browser.screenshotEvidenceRequired, true);
  const repoPackObject = envelope.taskCapsuleWritePlan.objects.find((object) => object.key.endsWith("repo-pack-manifest.json"));
  const selectedContextObject = envelope.taskCapsuleWritePlan.objects.find((object) => object.key.endsWith("selected-context.json"));
  const rollbackObject = envelope.taskCapsuleWritePlan.objects.find((object) => object.key.endsWith("rollback-manifest.json"));
  assert.match(repoPackObject.body, /"path": "src\/server\.js"/);
  assert.match(selectedContextObject.body, /"path": "public\/app\.js"/);
  assert.match(rollbackObject.body, /"affectedFiles"/);
  assert.ok(envelope.taskCapsuleWritePlan.objects.some((object) => object.key.endsWith("errors.json")));
  assert.ok(envelope.taskCapsuleWritePlan.objects.some((object) => object.key.endsWith("self-fix-attempts.json")));
  assert.ok(envelope.taskCapsuleWritePlan.objects.some((object) => object.key.endsWith("benchmark-results.json")));
});

test("job API envelope uses Salad preflight facts when IDrive env is configured", () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-25T12:00:00Z",
    body: {
      jobId: "job_api_002",
      projectId: "project_smejj",
      task: "Plan architecture",
      workerMode: "planner-vault"
    },
    env: {
      IDRIVE_E2_ENDPOINT: "https://example.idrivee2.test",
      IDRIVE_E2_ACCESS_KEY: "access",
      IDRIVE_E2_SECRET_KEY: "secret",
      IDRIVE_E2_BUCKET: "bucket",
      SALAD_WORKER_LOCAL_CACHE_GB: "300"
    }
  });

  assert.equal(envelope.idriveConfigured, true);
  assert.equal(envelope.preflight.modelId, "glm-5-2-fp8");
  assert.equal(envelope.preflight.provider, "salad");
  assert.equal(envelope.preflight.decision, "accept");
  assert.equal(envelope.preflight.nextAction, "claim_task_capsule");
  assert.equal(envelope.codingFlow.budget.approved, true);
  assert.equal(envelope.codingFlow.worker.startAllowed, false);
  assert.ok(envelope.codingFlow.worker.reasons.includes("gpu_not_requested"));
  assert.ok(envelope.preflight.warnings.includes("glm_5_2_is_flagship_vault_until_larger_compute_is_approved"));
});

test("job API keeps Salad and GLM-5.2 on-demand behind budget and explicit worker start", () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-25T12:00:00Z",
    body: {
      jobId: "job_api_003",
      projectId: "project_smejj",
      task: "Run heavy coding job",
      workerMode: "gpu-coding",
      budgetApproved: true,
      maxUsd: 5
    },
    env: {
      IDRIVE_E2_ENDPOINT: "https://example.idrivee2.test",
      IDRIVE_E2_ACCESS_KEY: "access",
      IDRIVE_E2_SECRET_KEY: "secret",
      IDRIVE_E2_BUCKET: "bucket",
      SALAD_WORKER_LOCAL_CACHE_GB: "704"
    }
  });

  assert.equal(envelope.codingFlow.budget.approved, true);
  assert.equal(envelope.codingFlow.worker.gpuRequested, true);
  assert.equal(envelope.codingFlow.worker.inferenceStarted, false);
  assert.equal(envelope.codingFlow.worker.startAllowed, false);
  assert.ok(envelope.codingFlow.worker.reasons.includes("explicit_worker_start_required"));
});

test("free app executor generates a tested mini app without GPU or paid services", () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-25T12:00:00Z",
    body: {
      jobId: "job_api_005",
      projectId: "project_smejj",
      task: "Create a Todo statistics mini app"
    },
    env: {}
  });
  const result = runFreeAppExecutor({
    task: "Create a Todo statistics mini app",
    jobEnvelope: envelope,
    now: "2026-06-25T12:01:00Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "free-local-executor");
  assert.equal(result.project.slug, "todo-stats-mini");
  assert.equal(result.files.length, 5);
  assert.equal(result.objects.length, 9);
  assert.ok(result.files.some((file) => file.path === "src/todoStats.js"));
  assert.ok(result.files.some((file) => file.path === "todoStats.test.mjs"));
  assert.ok(result.objects.some((object) => object.path === "test-results.json"));
  assert.ok(result.objects.some((object) => object.path === "browser-results.json"));
  assert.ok(result.objects.some((object) => object.path === "final-report.md"));
  assert.equal(result.verification.status, "passed");
  assert.equal(result.verification.testResults.every((item) => item.passed), true);
  assert.equal(result.verification.browser, "static_html_smoke_passed");
  assert.equal(result.verification.browserSmoke.checks.every((item) => item.passed), true);
  assert.equal(result.rollback.prepared, true);
  assert.equal(result.memory.learn, true);
  assert.ok(result.memory.sourceEvidence.includes(`${result.taskCapsule.artifactPrefix}test-results.json`));
  assert.equal(result.worker.gpuStarted, false);
  assert.equal(result.worker.saladStarted, false);
  assert.equal(result.worker.paidServicesStarted, false);
});

test("job API rejects unsafe ids", () => {
  assert.throws(
    () => createStorageFirstJobEnvelope({ body: { jobId: "../bad", projectId: "project_smejj", task: "x" } }),
    /relative safe id/
  );
});
