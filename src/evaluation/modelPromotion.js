import crypto from "node:crypto";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_METRIC_CATEGORIES = new Set([
  "safety",
  "non-regression",
  "quality",
  "efficiency"
]);
const ALLOWED_DIRECTIONS = new Set(["maximize", "minimize"]);
const ALLOWED_ENVIRONMENT_KEYS = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "CI",
  "PNPM_HOME"
]);

export const FOUNDATION_CHECK_ALLOWLIST = Object.freeze([
  "check:json",
  "check:manifests",
  "check:cost",
  "check:paths",
  "check:security",
  "check:guidelines",
  "check:architecture",
  "check:abuse",
  "check:gatekeeper",
  "check:start-lock"
]);

export const FOUNDATION_PROTECTED_ASSET_ALLOWLIST = Object.freeze([
  "src/evaluation/modelPromotion.js",
  "scripts/evaluation/run_foundation_benchmark.mjs",
  "scripts/validate-json.mjs",
  "scripts/validate-manifests.mjs",
  "scripts/validation-utils.mjs",
  "scripts/check-cost-guardrails.mjs",
  "scripts/check-no-private-paths.mjs",
  "scripts/check-no-paid-services.mjs",
  "scripts/check-backup-archives.mjs",
  "scripts/check-guidelines.mjs",
  "scripts/check-start-lock.mjs",
  "tests/training-manifest-policy.test.mjs",
  "tests/free-only-master-policy.test.mjs",
  "tests/security-abuse.test.mjs",
  "tests/gatekeeper.policy.test.mjs",
  "tests/presign.failclosed.test.mjs",
  "tests/cost-guardrails.test.mjs",
  "tests/backup-archive-safety.test.mjs",
  "tests/model-promotion.test.mjs"
]);

export const PROMOTION_STATUS = Object.freeze({
  BLOCKED: "blocked",
  ELIGIBLE_FOR_HUMAN_APPROVAL: "eligible-for-human-approval"
});

export function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical_json_requires_finite_numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError("canonical_json_rejects_undefined");
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("canonical_json_requires_json_value");
}

export function computeBenchmarkSuiteSha256(suite) {
  const digestInput = structuredClone(suite);
  if (digestInput?.integrity && typeof digestInput.integrity === "object") {
    delete digestInput.integrity.contentSha256;
  }
  return crypto.createHash("sha256").update(canonicalJson(digestInput)).digest("hex");
}

export function validateBenchmarkSuite(suite) {
  const reasons = [];
  const reject = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!isObject(suite)) return invalidSuite("benchmark_suite_missing");
  if (suite.schemaVersion !== 1) reject("benchmark_suite_schema_unsupported");
  if (!nonEmptyString(suite.suiteId) || !nonEmptyString(suite.version)) {
    reject("benchmark_suite_identity_missing");
  }
  if (suite.immutable !== true) reject("benchmark_suite_not_immutable");
  if (suite.eligibleForTraining !== false) reject("benchmark_suite_training_exclusion_missing");

  if (suite.integrity?.algorithm !== "sha256" ||
      suite.integrity?.canonicalization !== "json-key-sort-v1" ||
      !SHA256_PATTERN.test(suite.integrity?.contentSha256 || "")) {
    reject("benchmark_suite_integrity_invalid");
  } else {
    try {
      if (!crypto.timingSafeEqual(
        Buffer.from(computeBenchmarkSuiteSha256(suite), "hex"),
        Buffer.from(suite.integrity.contentSha256, "hex")
      )) reject("benchmark_suite_integrity_mismatch");
    } catch {
      reject("benchmark_suite_integrity_invalid");
    }
  }

  const protection = suite.protection || {};
  if (!/^evaluations\/suites\/[a-z0-9-]+\/[A-Za-z0-9._-]+\/manifest\.json$/.test(
    protection.versionedObjectKey || ""
  )) reject("benchmark_suite_versioned_key_missing");
  if (protection.conditionalWrite !== "if-none-match-star" || protection.overwriteAllowed !== false) {
    reject("benchmark_suite_append_only_protection_missing");
  }
  if (protection.evaluationArtifactsEligibleForTraining !== false ||
      protection.familyLeakageCheckRequired !== true) {
    reject("benchmark_suite_data_protection_missing");
  }

  const execution = suite.execution || {};
  if (execution.packageManager !== "pnpm" || execution.shell !== false ||
      execution.captureLogBodies !== false || execution.checkOutputPersistence !== "none") {
    reject("benchmark_suite_execution_not_safe");
  }
  const environmentAllowlist = Array.isArray(execution.environmentAllowlist)
    ? execution.environmentAllowlist
    : [];
  if (!environmentAllowlist.includes("PATH") ||
      new Set(environmentAllowlist).size !== environmentAllowlist.length ||
      environmentAllowlist.some((key) => !ALLOWED_ENVIRONMENT_KEYS.has(key))) {
    reject("benchmark_suite_environment_allowlist_invalid");
  }
  const checks = Array.isArray(execution.checks) ? execution.checks : [];
  const checkIds = new Set();
  if (checks.length === 0) reject("benchmark_suite_checks_missing");
  for (const check of checks) {
    if (!FOUNDATION_CHECK_ALLOWLIST.includes(check?.id)) reject("benchmark_suite_check_not_allowlisted");
    if (checkIds.has(check?.id)) reject("benchmark_suite_check_duplicate");
    checkIds.add(check?.id);
    if (!SHA256_PATTERN.test(check?.scriptSha256 || "")) reject("benchmark_suite_script_digest_invalid");
  }
  const protectedAssets = Array.isArray(execution.protectedAssets) ? execution.protectedAssets : [];
  const protectedAssetPaths = new Set();
  if (protectedAssets.length !== FOUNDATION_PROTECTED_ASSET_ALLOWLIST.length) {
    reject("benchmark_suite_protected_assets_incomplete");
  }
  for (const asset of protectedAssets) {
    if (!FOUNDATION_PROTECTED_ASSET_ALLOWLIST.includes(asset?.path)) {
      reject("benchmark_suite_protected_asset_not_allowlisted");
    }
    if (protectedAssetPaths.has(asset?.path)) reject("benchmark_suite_protected_asset_duplicate");
    protectedAssetPaths.add(asset?.path);
    if (!SHA256_PATTERN.test(asset?.sha256 || "")) reject("benchmark_suite_protected_asset_digest_invalid");
  }

  const metrics = Array.isArray(suite.metrics) ? suite.metrics : [];
  const metricIds = new Set();
  if (metrics.length === 0) reject("benchmark_suite_metrics_missing");
  for (const metric of metrics) {
    if (!nonEmptyString(metric?.id) || metricIds.has(metric?.id)) reject("benchmark_suite_metric_identity_invalid");
    metricIds.add(metric?.id);
    if (!ALLOWED_METRIC_CATEGORIES.has(metric?.category)) reject("benchmark_suite_metric_category_invalid");
    if (!ALLOWED_DIRECTIONS.has(metric?.direction)) reject("benchmark_suite_metric_direction_invalid");
    if (!isFiniteNonNegative(metric?.minimumImprovement)) reject("benchmark_suite_metric_threshold_invalid");
    if (["safety", "non-regression"].includes(metric?.category) && metric.mustNotRegress !== true) {
      reject("benchmark_suite_safety_regression_gate_missing");
    }
  }

  const promotion = suite.promotion || {};
  if (promotion.automaticDeploymentAllowed !== false || promotion.writtenHumanApprovalRequired !== true) {
    reject("benchmark_suite_human_approval_gate_missing");
  }
  if (promotion.sameSuiteDigestRequired !== true || promotion.minimumImprovements !== 1) {
    reject("benchmark_suite_comparison_gate_invalid");
  }
  for (const metricId of [promotion.securityFailureMetricId, promotion.damagedFunctionMetricId]) {
    const metric = metrics.find((entry) => entry.id === metricId);
    if (!metric || metric.zeroRequired !== true || metric.direction !== "minimize") {
      reject("benchmark_suite_zero_failure_metric_invalid");
    }
  }

  const costGate = suite.costGate || {};
  if (costGate.budgetGatePassRequired !== true ||
      !isFinitePositive(costGate.maxEvaluationRunUsd) ||
      !isFinitePositive(costGate.maxCostPerSuccessfulTaskUsd) ||
      !Number.isInteger(costGate.minimumMeasuredTasks) || costGate.minimumMeasuredTasks < 1 ||
      costGate.trialServicesAllowed !== false || costGate.autoBillingFallbackAllowed !== false) {
    reject("benchmark_suite_cost_gate_invalid");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    computedContentSha256: safeComputeDigest(suite)
  };
}

export function assessModelPromotion({ suite, incumbent, candidate, datasetAudit } = {}) {
  const blockers = [];
  const improvements = [];
  const block = (code, details = {}) => {
    if (!blockers.some((entry) => entry.code === code && entry.metricId === details.metricId)) {
      blockers.push({ code, ...details });
    }
  };
  const suiteValidation = validateBenchmarkSuite(suite);
  for (const reason of suiteValidation.reasons) block(reason);

  const expectedSuite = suiteValidation.ok ? suiteIdentity(suite) : null;
  validateReport("incumbent", incumbent, expectedSuite, block);
  validateReport("candidate", candidate, expectedSuite, block);

  if (incumbent?.modelVersion === candidate?.modelVersion ||
      incumbent?.testedArtifactSha256 === candidate?.testedArtifactSha256) {
    block("candidate_is_not_a_new_artifact");
  }

  validateDatasetSeparation(datasetAudit, incumbent, candidate, block);

  if (suiteValidation.ok && isObject(incumbent?.metrics) && isObject(candidate?.metrics)) {
    for (const metric of suite.metrics) {
      const incumbentValue = incumbent.metrics[metric.id];
      const candidateValue = candidate.metrics[metric.id];
      if (!validMetricValue(metric, incumbentValue) || !validMetricValue(metric, candidateValue)) {
        block("required_metric_missing_or_invalid", { metricId: metric.id });
        continue;
      }
      if (metric.mustNotRegress === true && isRegression(metric, incumbentValue, candidateValue)) {
        block("metric_regressed", { metricId: metric.id });
      }
      if (metric.zeroRequired === true && candidateValue !== 0) {
        block("zero_failure_metric_not_zero", { metricId: metric.id });
      }
      const delta = improvementDelta(metric, incumbentValue, candidateValue);
      if (metric.improvementEligible === true && delta > 0 && delta >= metric.minimumImprovement) {
        improvements.push({ metricId: metric.id, delta });
      }
    }
  }

  if (improvements.length < (suite?.promotion?.minimumImprovements ?? 1)) {
    block("no_measurable_improvement");
  }
  validateCandidateCost(suite?.costGate, candidate?.cost, block);

  const eligible = blockers.length === 0;
  return {
    schemaVersion: 1,
    status: eligible
      ? PROMOTION_STATUS.ELIGIBLE_FOR_HUMAN_APPROVAL
      : PROMOTION_STATUS.BLOCKED,
    eligibleForHumanApproval: eligible,
    automaticDeploymentAllowed: false,
    writtenHumanApprovalRequired: true,
    benchmarkSuite: expectedSuite,
    improvements,
    blockers
  };
}

function validateReport(label, report, expectedSuite, block) {
  if (!isObject(report)) {
    block(`${label}_report_missing`);
    return;
  }
  if (!nonEmptyString(report.modelVersion) || !SHA256_PATTERN.test(report.testedArtifactSha256 || "")) {
    block(`${label}_artifact_identity_invalid`);
  }
  if (!expectedSuite || !sameSuiteIdentity(report.benchmarkSuite, expectedSuite)) {
    block(`${label}_benchmark_suite_mismatch`);
  }
  if (!SHA256_PATTERN.test(report.evaluationDatasetSha256 || "")) {
    block(`${label}_evaluation_dataset_identity_invalid`);
  }
  if (report.runStatus !== "passed" || report.allRequiredChecksPassed !== true) {
    block(`${label}_benchmark_run_not_passed`);
  }
  if (!isObject(report.metrics)) block(`${label}_metrics_missing`);
}

function validateDatasetSeparation(audit, incumbent, candidate, block) {
  if (!isObject(audit) || audit.leakageScanPassed !== true ||
      audit.familyFingerprintAlgorithm !== "hmac-sha256-v1") {
    block("dataset_leakage_audit_missing_or_failed");
    return;
  }
  if (audit.evaluationEligibleForTraining !== false || audit.evaluationDatasetImmutable !== true ||
      audit.conditionalWriteProven !== true) {
    block("evaluation_dataset_not_protected");
  }
  if (!SHA256_PATTERN.test(audit.trainingDatasetSha256 || "") ||
      !SHA256_PATTERN.test(audit.evaluationDatasetSha256 || "") ||
      audit.trainingDatasetSha256 === audit.evaluationDatasetSha256) {
    block("dataset_identity_invalid");
  }
  if (incumbent?.evaluationDatasetSha256 !== audit.evaluationDatasetSha256 ||
      candidate?.evaluationDatasetSha256 !== audit.evaluationDatasetSha256) {
    block("reports_used_different_evaluation_dataset");
  }

  const training = validateFingerprintList(audit.trainingFamilyFingerprints);
  const evaluation = validateFingerprintList(audit.evaluationFamilyFingerprints);
  if (!training.ok || !evaluation.ok) {
    block("dataset_family_fingerprints_invalid");
    return;
  }
  const trainingSet = new Set(training.values);
  if (evaluation.values.some((fingerprint) => trainingSet.has(fingerprint))) {
    block("training_evaluation_family_leakage_detected");
  }
}

function validateCandidateCost(costGate, cost, block) {
  if (!isObject(costGate) || !isObject(cost)) {
    block("candidate_cost_gate_missing");
    return;
  }
  if (cost.limitPassed !== true || cost.budgetGatePassed !== true ||
      cost.trialUsed !== false || cost.autoBillingFallbackUsed !== false) {
    block("candidate_cost_gate_not_passed");
  }
  if (!isFiniteNonNegative(cost.actualEvaluationRunUsd) ||
      cost.actualEvaluationRunUsd > costGate.maxEvaluationRunUsd) {
    block("candidate_evaluation_run_cost_limit_exceeded");
  }
  if (!isFiniteNonNegative(cost.costPerSuccessfulTaskUsd) ||
      cost.costPerSuccessfulTaskUsd > costGate.maxCostPerSuccessfulTaskUsd) {
    block("candidate_task_cost_limit_exceeded");
  }
  if (!Number.isInteger(cost.measuredTaskCount) || cost.measuredTaskCount < costGate.minimumMeasuredTasks) {
    block("candidate_cost_sample_too_small");
  }
}

function suiteIdentity(suite) {
  return {
    suiteId: suite.suiteId,
    version: suite.version,
    contentSha256: suite.integrity.contentSha256
  };
}

function sameSuiteIdentity(actual, expected) {
  return isObject(actual) && actual.suiteId === expected.suiteId &&
    actual.version === expected.version && actual.contentSha256 === expected.contentSha256;
}

function validateFingerprintList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !SHA256_PATTERN.test(item))) {
    return { ok: false, values: [] };
  }
  if (new Set(value).size !== value.length) return { ok: false, values: [] };
  return { ok: true, values: value };
}

function improvementDelta(metric, incumbent, candidate) {
  return metric.direction === "maximize" ? candidate - incumbent : incumbent - candidate;
}

function validMetricValue(metric, value) {
  if (!isFiniteNonNegative(value)) return false;
  if (metric.unit === "ratio") return value <= 1;
  if (metric.unit === "count") return Number.isInteger(value);
  return true;
}

function isRegression(metric, incumbent, candidate) {
  return metric.direction === "maximize" ? candidate < incumbent : candidate > incumbent;
}

function safeComputeDigest(suite) {
  try {
    return computeBenchmarkSuiteSha256(suite);
  } catch {
    return null;
  }
}

function invalidSuite(reason) {
  return { ok: false, reasons: [reason], computedContentSha256: null };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}
