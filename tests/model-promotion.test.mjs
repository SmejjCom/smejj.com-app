import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessModelPromotion,
  computeBenchmarkSuiteSha256,
  PROMOTION_STATUS,
  validateBenchmarkSuite
} from "../src/evaluation/modelPromotion.js";
import {
  buildSafeEnvironment,
  loadProtectedAssetDigests,
  runFoundationBenchmark,
  verifyPinnedPackageScripts,
  verifyPinnedProtectedAssets
} from "../scripts/evaluation/run_foundation_benchmark.mjs";
import { validateSchema } from "../scripts/validation-utils.mjs";

const SUITE = JSON.parse(await readFile(
  new URL("../idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json", import.meta.url),
  "utf8"
));
const SUITE_SCHEMA = JSON.parse(await readFile(
  new URL("../schemas/benchmark-suite.schema.json", import.meta.url),
  "utf8"
));
const PACKAGE_JSON = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const PROTECTED_ASSET_DIGESTS = await loadProtectedAssetDigests();

test("the Phase 1 suite is schema-valid, content-addressed, immutable and training-excluded", () => {
  assert.deepEqual(validateSchema(SUITE, SUITE_SCHEMA, "benchmark suite"), []);
  assert.equal(computeBenchmarkSuiteSha256(SUITE), SUITE.integrity.contentSha256);
  assert.deepEqual(validateBenchmarkSuite(SUITE), {
    ok: true,
    reasons: [],
    computedContentSha256: SUITE.integrity.contentSha256
  });
  assert.equal(SUITE.immutable, true);
  assert.equal(SUITE.eligibleForTraining, false);
  assert.equal(SUITE.protection.overwriteAllowed, false);
  assert.equal(SUITE.promotion.automaticDeploymentAllowed, false);
});

test("a genuinely better and equally safe model is only eligible for written human approval", () => {
  const fixture = promotionFixture();
  const result = assessModelPromotion(fixture);
  assert.equal(result.status, PROMOTION_STATUS.ELIGIBLE_FOR_HUMAN_APPROVAL);
  assert.equal(result.eligibleForHumanApproval, true);
  assert.equal(result.automaticDeploymentAllowed, false);
  assert.equal(result.writtenHumanApprovalRequired, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.improvements.some((entry) => entry.metricId === "codingTaskSuccessRate"));
});

test("suite tampering or a different suite digest blocks promotion before comparison", () => {
  const tampered = promotionFixture();
  tampered.suite.description = `${tampered.suite.description} changed`;
  let result = assessModelPromotion(tampered);
  assert.equal(result.status, PROMOTION_STATUS.BLOCKED);
  assert.ok(result.blockers.some((entry) => entry.code === "benchmark_suite_integrity_mismatch"));
  assert.equal(result.automaticDeploymentAllowed, false);

  const mismatch = promotionFixture();
  mismatch.candidate.benchmarkSuite.contentSha256 = "f".repeat(64);
  result = assessModelPromotion(mismatch);
  assert.ok(result.blockers.some((entry) => entry.code === "candidate_benchmark_suite_mismatch"));
});

test("training and evaluation task-family overlap blocks promotion", () => {
  const fixture = promotionFixture();
  fixture.datasetAudit.evaluationFamilyFingerprints = [
    fixture.datasetAudit.trainingFamilyFingerprints[0]
  ];
  const result = assessModelPromotion(fixture);
  assert.equal(result.eligibleForHumanApproval, false);
  assert.ok(result.blockers.some((entry) => entry.code === "training_evaluation_family_leakage_detected"));
});

test("security failures, damaged functions and any protected metric regression block promotion", () => {
  const fixture = promotionFixture();
  fixture.candidate.metrics.securityFailures = 1;
  fixture.candidate.metrics.safetyPassRate = fixture.incumbent.metrics.safetyPassRate - 0.01;
  fixture.candidate.metrics.damagedExistingFunctions = 1;
  const result = assessModelPromotion(fixture);
  assert.equal(result.status, PROMOTION_STATUS.BLOCKED);
  assert.ok(result.blockers.some((entry) =>
    entry.code === "zero_failure_metric_not_zero" && entry.metricId === "securityFailures"
  ));
  assert.ok(result.blockers.some((entry) =>
    entry.code === "zero_failure_metric_not_zero" && entry.metricId === "damagedExistingFunctions"
  ));
  assert.ok(result.blockers.some((entry) =>
    entry.code === "metric_regressed" && entry.metricId === "safetyPassRate"
  ));
});

test("a merely equal model is blocked because at least one measurable improvement is required", () => {
  const fixture = promotionFixture();
  fixture.candidate.metrics = structuredClone(fixture.incumbent.metrics);
  const result = assessModelPromotion(fixture);
  assert.equal(result.status, PROMOTION_STATUS.BLOCKED);
  assert.ok(result.blockers.some((entry) => entry.code === "no_measurable_improvement"));
});

test("invalid metric ranges cannot be presented as an improvement", () => {
  const fixture = promotionFixture();
  fixture.candidate.metrics.codingTaskSuccessRate = 1.5;
  const result = assessModelPromotion(fixture);
  assert.equal(result.status, PROMOTION_STATUS.BLOCKED);
  assert.ok(result.blockers.some((entry) =>
    entry.code === "required_metric_missing_or_invalid" && entry.metricId === "codingTaskSuccessRate"
  ));
});

test("the candidate must pass both declared and computed cost limits", () => {
  const fixture = promotionFixture();
  fixture.candidate.cost.limitPassed = false;
  fixture.candidate.cost.actualEvaluationRunUsd = SUITE.costGate.maxEvaluationRunUsd + 0.01;
  fixture.candidate.cost.costPerSuccessfulTaskUsd = SUITE.costGate.maxCostPerSuccessfulTaskUsd + 0.01;
  fixture.candidate.cost.measuredTaskCount = SUITE.costGate.minimumMeasuredTasks - 1;
  const result = assessModelPromotion(fixture);
  assert.equal(result.status, PROMOTION_STATUS.BLOCKED);
  for (const code of [
    "candidate_cost_gate_not_passed",
    "candidate_evaluation_run_cost_limit_exceeded",
    "candidate_task_cost_limit_exceeded",
    "candidate_cost_sample_too_small"
  ]) assert.ok(result.blockers.some((entry) => entry.code === code));
});

test("the runner executes only pinned checks in manifest order and discards log bodies", () => {
  const calls = [];
  const summary = runFoundationBenchmark({
    suite: SUITE,
    packageScripts: PACKAGE_JSON.scripts,
    protectedAssetDigests: PROTECTED_ASSET_DIGESTS,
    executeCheck: (checkId) => {
      calls.push(checkId);
      return { ok: true, exitCode: 0, stdout: "must-not-be-persisted", stderr: "secret" };
    }
  });
  assert.equal(summary.ok, true);
  assert.deepEqual(calls, SUITE.execution.checks.map((check) => check.id));
  assert.doesNotMatch(JSON.stringify(summary), /must-not-be-persisted|secret/);
  assert.equal(summary.eligibleForTraining, false);
  assert.equal(summary.automaticDeploymentAllowed, false);
  assert.equal(summary.runner.shell, false);
  assert.equal(summary.runner.logBodiesCaptured, false);
});

test("a changed package script fails closed without executing any check", () => {
  const packageScripts = { ...PACKAGE_JSON.scripts, "check:cost": "node changed-script.mjs" };
  const validation = verifyPinnedPackageScripts(SUITE, packageScripts);
  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((entry) =>
    entry.code === "package_script_digest_mismatch" && entry.checkId === "check:cost"
  ));

  let executions = 0;
  const summary = runFoundationBenchmark({
    suite: SUITE,
    packageScripts,
    protectedAssetDigests: PROTECTED_ASSET_DIGESTS,
    executeCheck: () => {
      executions += 1;
      return { ok: true, exitCode: 0 };
    }
  });
  assert.equal(summary.ok, false);
  assert.equal(executions, 0);
});

test("a modified protected benchmark asset fails closed before any check runs", () => {
  const changed = {
    ...PROTECTED_ASSET_DIGESTS,
    "tests/security-abuse.test.mjs": "0".repeat(64)
  };
  const validation = verifyPinnedProtectedAssets(SUITE, changed);
  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((entry) =>
    entry.code === "protected_asset_digest_mismatch" &&
      entry.assetPath === "tests/security-abuse.test.mjs"
  ));

  let executions = 0;
  const summary = runFoundationBenchmark({
    suite: SUITE,
    packageScripts: PACKAGE_JSON.scripts,
    protectedAssetDigests: changed,
    executeCheck: () => {
      executions += 1;
      return { ok: true, exitCode: 0 };
    }
  });
  assert.equal(summary.ok, false);
  assert.equal(executions, 0);
});

test("the runner environment drops secrets and rejects non-allowlisted keys", () => {
  const env = buildSafeEnvironment({
    PATH: "/safe/bin",
    HOME: "/safe/home",
    API_KEY: "must-not-pass",
    SMEJJ_TRAINING_ENCRYPTION_KEY_B64: "must-not-pass"
  }, ["PATH", "HOME"]);
  assert.deepEqual(env, { PATH: "/safe/bin", HOME: "/safe/home", CI: "1" });
  assert.equal("API_KEY" in env, false);
  assert.throws(() => buildSafeEnvironment({ PATH: "/safe/bin", API_KEY: "x" }, ["PATH", "API_KEY"]), {
    message: "unsafe_environment_key_requested"
  });
});

function promotionFixture() {
  const benchmarkSuite = {
    suiteId: SUITE.suiteId,
    version: SUITE.version,
    contentSha256: SUITE.integrity.contentSha256
  };
  const incumbentMetrics = {
    securityFailures: 0,
    safetyPassRate: 0.99,
    damagedExistingFunctions: 0,
    relevantTestsPassRate: 0.98,
    rollbackRate: 0.02,
    codingTaskSuccessRate: 0.8,
    autonomousCompletionRate: 0.7,
    userCorrectionRate: 0.1,
    medianTaskLatencyMs: 1000,
    medianTokensPerSuccessfulTask: 2000,
    medianCostPerSuccessfulTaskUsd: 0.12
  };
  const evaluationDatasetSha256 = "e".repeat(64);
  const incumbent = {
    modelVersion: "smejj-1-0-alpha-0001",
    testedArtifactSha256: "1".repeat(64),
    benchmarkSuite: { ...benchmarkSuite },
    evaluationDatasetSha256,
    runStatus: "passed",
    allRequiredChecksPassed: true,
    metrics: incumbentMetrics,
    cost: passingCost()
  };
  const candidate = structuredClone(incumbent);
  candidate.modelVersion = "smejj-1-0-alpha-0002";
  candidate.testedArtifactSha256 = "2".repeat(64);
  candidate.metrics.codingTaskSuccessRate = 0.82;

  return {
    suite: structuredClone(SUITE),
    incumbent,
    candidate,
    datasetAudit: {
      leakageScanPassed: true,
      familyFingerprintAlgorithm: "hmac-sha256-v1",
      trainingDatasetSha256: "d".repeat(64),
      evaluationDatasetSha256,
      trainingFamilyFingerprints: ["a".repeat(64)],
      evaluationFamilyFingerprints: ["b".repeat(64)],
      evaluationEligibleForTraining: false,
      evaluationDatasetImmutable: true,
      conditionalWriteProven: true
    }
  };
}

function passingCost() {
  return {
    limitPassed: true,
    budgetGatePassed: true,
    actualEvaluationRunUsd: 2,
    costPerSuccessfulTaskUsd: 0.1,
    measuredTaskCount: 20,
    trialUsed: false,
    autoBillingFallbackUsed: false
  };
}
