const MODELS = Object.freeze({
  smejj: "smejj-1-0",
  glm: "glm-5-2",
  kimi: "kimi-k2-7"
});

const CRITICAL = /\b(production|live[- ]?deploy|security|auth|passkey|secret|token|payment|billing|database migration|datenbankmigration|delete data|daten loeschen|policy|berechtigung|permission)\b/i;
const COMPLEX = /\b(architecture|architektur|multi[- ]?file|migration|distributed|skalier|cross[- ]?platform|ios|android|pwa|refactor|agentenarchitektur)\b/i;
const SIMPLE = /\b(typo|tippfehler|documentation|dokumentation|comment|kommentar|format|rename local|kleine sichere|test erklaeren)\b/i;

/**
 * Deterministic routing contract. It does not call a model or execute a tool.
 * Local smejj 1.0 takeover is possible only after a signed benchmark promotion.
 */
export function buildTaskRoutingDecision({
  task = "",
  affectedFiles = 0,
  runtime = {},
  benchmark = null,
  uncertainty = "low"
} = {}) {
  const tier = classifyTaskTier({ task, affectedFiles, uncertainty });
  const localApproved = localPromotionApproved(benchmark, runtime);
  let primaryModelId = MODELS.glm;
  let fallbackModelId = null;
  if (tier === "simple" && localApproved) {
    primaryModelId = MODELS.smejj;
    fallbackModelId = MODELS.glm;
  } else if ((tier === "complex" || tier === "critical") && runtime.kimiReady === true) {
    primaryModelId = MODELS.kimi;
    fallbackModelId = MODELS.glm;
  }

  const critical = tier === "critical";
  const reviewerModelId = critical ? independentReviewer(primaryModelId, runtime) : null;
  const blockedReasons = [];
  if (uncertainty === "high") blockedReasons.push("high_uncertainty");
  if (critical && !reviewerModelId) blockedReasons.push("independent_second_model_unavailable");
  if (primaryModelId === MODELS.smejj && !localApproved) blockedReasons.push("local_model_not_promoted");

  return {
    policyVersion: 1,
    tier,
    primaryModelId,
    fallbackModelId,
    reviewerModelId,
    requiresSecondModelReview: critical,
    humanApprovalRequired: critical || uncertainty === "high",
    automaticExecutionAllowed: blockedReasons.length === 0 && !critical && uncertainty !== "high",
    blockedReasons,
    trainingUse: primaryModelId === MODELS.smejj
      ? "subject-to-training-data-policy"
      : "provider-output-denied-for-smejj-training",
    localPromotion: {
      approved: localApproved,
      version: localApproved ? benchmark.version : null,
      scope: localApproved ? benchmark.scope : []
    }
  };
}

export function classifyTaskTier({ task = "", affectedFiles = 0, uncertainty = "low" } = {}) {
  const text = String(task || "");
  if (uncertainty === "high" || CRITICAL.test(text)) return "critical";
  if (COMPLEX.test(text) || Number(affectedFiles) > 4 || text.length > 1_200) return "complex";
  if (SIMPLE.test(text) && Number(affectedFiles) <= 1 && text.length <= 320) return "simple";
  return "normal";
}

export function localPromotionApproved(benchmark, runtime = {}) {
  if (runtime.smejjReady !== true ||
      runtime.exactArtifactIdentityVerified !== true ||
      runtime.licenseArchiveVerified !== true ||
      !benchmark ||
      benchmark.status !== "approved") return false;
  if (!/^smejj-1\.0-[a-z0-9._-]+$/.test(String(benchmark.version || ""))) return false;
  if (!Array.isArray(benchmark.scope) || !benchmark.scope.includes("simple")) return false;
  if (!/^[a-f0-9]{64}$/.test(String(benchmark.artifactDigestSha256 || ""))) return false;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{5,240}$/.test(String(benchmark.approvalEvidenceId || ""))) return false;
  if (benchmark.approvalSignatureVerified !== true) return false;
  if (benchmark.safetyAtLeastIncumbent !== true) return false;
  if (benchmark.successRateAtLeastIncumbent !== true) return false;
  if (Number(benchmark.nonRegressionFailures) !== 0) return false;
  if (Number(benchmark.securityFailures) !== 0) return false;
  if (Number(benchmark.datasetLeakageFailures) !== 0) return false;
  return true;
}

function independentReviewer(primaryModelId, runtime) {
  if (primaryModelId !== MODELS.glm && runtime.glmReady === true) return MODELS.glm;
  if (primaryModelId !== MODELS.kimi && runtime.kimiReady === true) return MODELS.kimi;
  return null;
}
