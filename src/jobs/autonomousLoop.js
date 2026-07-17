const DEFAULT_MAX_SELF_FIX_ATTEMPTS = 3;

export function buildAutonomousCodingLoop({
  job,
  uiChange = false,
  now = new Date().toISOString(),
  maxSelfFixAttempts = DEFAULT_MAX_SELF_FIX_ATTEMPTS
} = {}) {
  if (!job?.taskCapsule?.rootPrefix) throw new Error("Task capsule is required");
  const capsule = job.taskCapsule;

  return {
    ok: true,
    mode: "autonomous-browser-fix-loop-v1",
    createdAt: now,
    maxSelfFixAttempts,
    loop: [
      "claim-task-capsule",
      "prepare-rollback",
      "apply-patch-in-isolated-workspace",
      "run-build",
      "run-typecheck",
      "run-tests",
      ...(uiChange ? ["run-browser-checks-with-screenshots"] : []),
      "record-errors-and-self-fix-attempts",
      "write-verifier-report",
      "write-memory-proposal-only-after-success"
    ],
    gates: {
      patchFinalWithoutRollback: false,
      patchFinalWithoutBuild: false,
      patchFinalWithoutTypecheck: false,
      patchFinalWithoutTests: false,
      patchFinalWithoutBrowserWhenUiChanged: false,
      memoryLearnsFromFailedRun: false
    },
    artifacts: {
      rollbackManifest: capsule.rollbackManifest,
      patch: capsule.patch,
      testResults: capsule.testResults,
      browserResults: capsule.browserResults,
      browserScreenshots: capsule.browserScreenshots,
      errors: capsule.errors,
      selfFixAttempts: capsule.selfFixAttempts,
      verifierReport: capsule.verifierReport,
      benchmarkResults: capsule.benchmarkResults,
      memoryUpdate: capsule.memoryUpdate,
      finalReport: capsule.finalReport
    },
    browser: {
      required: uiChange,
      runner: "worker-playwright",
      screenshotEvidenceRequired: uiChange,
      resultsKey: capsule.browserResults,
      screenshotsPrefix: capsule.browserScreenshots
    },
    worker: {
      provider: "salad",
      role: "compute-only",
      serverRole: "control-router-only",
      objectBrain: "idrive-e2",
      heavyFilesThroughControlRouterAllowed: false
    }
  };
}

export function evaluateAutonomousLoopResult({
  checks = [],
  uiChange = false,
  browser = {},
  selfFixAttempts = []
} = {}) {
  const requiredChecks = ["rollback", "build", "typecheck", "tests"];
  const checkMap = new Map(checks.map((check) => [check.name, check.ok === true]));
  const missing = requiredChecks.filter((name) => checkMap.get(name) !== true);
  if (uiChange && browser.ok !== true) missing.push("browser");
  if (selfFixAttempts.length > DEFAULT_MAX_SELF_FIX_ATTEMPTS) missing.push("self-fix-cap");

  return {
    ok: missing.length === 0,
    missing,
    memoryMayLearn: missing.length === 0,
    trainingEligible: false,
    trainingEligibilityReason: "separate-training-pipeline-required",
    finalPatchAllowed: missing.length === 0
  };
}
