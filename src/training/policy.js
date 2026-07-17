import {
  MODEL_LABEL_SOURCES,
  REQUIRED_QUALITY_GATES,
  TRAINING_STATES
} from "./constants.js";
import {
  isFreshResolvedConsentDecision,
  isResolvedConsentDecision
} from "./consent.js";

const PERMANENT_DENIALS = new Set([
  "provider_training_use_denied",
  "provider_derivatives_denied",
  "provider_rights_missing",
  "repository_training_rights_denied",
  "model_label_taint",
  "raw_data_persisted"
]);

/**
 * Training is denied unless every consent, provenance, privacy, quality,
 * rights and encryption condition is explicitly proven. Technical success
 * alone never grants training permission.
 */
export function evaluateTrainingEligibility(candidate, rightsLedger, {
  now = new Date().toISOString(),
  consentDecision,
  verificationEvidenceVerified = false
} = {}) {
  const reasons = [];
  const resolvedConsent = isResolvedConsentDecision(consentDecision);
  const freshConsent = isFreshResolvedConsentDecision(consentDecision, { now });
  const consent = freshConsent ? consentDecision : {};
  const quality = candidate?.quality || {};
  const privacy = candidate?.sanitization || {};
  const repositoryRights = candidate?.repositoryRights || {};
  const encryption = candidate?.encryption || {};
  const fingerprinting = candidate?.fingerprinting || {};
  const provenance = candidate?.provenance || {};

  if (consent.verified !== true) reasons.push("consent_decision_not_verified");
  if (resolvedConsent && !freshConsent) reasons.push("consent_decision_not_fresh");
  if (consent.captureAllowed !== true) reasons.push("capture_consent_missing");
  if (consent.trainingAllowed !== true) reasons.push("training_consent_missing");
  if (consent.recordedBy !== "authenticated-human") reasons.push("human_consent_evidence_missing");
  if (consent.rightsConfirmed !== true) reasons.push("source_rights_not_confirmed");
  if (!safeEvidenceId(consent.evidenceId)) reasons.push("consent_evidence_missing");
  if (!safeEvidenceId(consent.withdrawalId)) reasons.push("withdrawal_reference_missing");
  if (verificationEvidenceVerified !== true || !safeEvidenceId(candidate?.verificationEvidence?.evidenceId)) {
    reasons.push("task_evidence_not_verified");
  }

  if (privacy.passed !== true || Number(privacy.residualFindings?.length || 0) !== 0) {
    reasons.push("sanitization_not_proven");
  }
  if (privacy.rawPersisted !== false) reasons.push("raw_data_persisted");

  for (const gate of REQUIRED_QUALITY_GATES) {
    if (quality[gate] !== "passed") reasons.push(`quality_${gate}_not_passed`);
  }
  if (quality.uiAffected === true && quality.browser !== "passed") reasons.push("quality_browser_not_passed");
  if (quality.diffStatus !== "non-empty") reasons.push("quality_diff_not_verified_non_empty");
  if (!acceptedByHumanOrDeterministicProof(quality.acceptance)) reasons.push("quality_acceptance_not_proven");

  if (repositoryRights.status !== "confirmed") reasons.push("repository_training_rights_denied");
  if (repositoryRights.trainingUseAllowed !== true) reasons.push("repository_training_rights_denied");
  if (!safeEvidenceId(repositoryRights.evidenceId)) reasons.push("repository_rights_evidence_missing");

  if (encryption.required !== true || encryption.ready !== true || !safeEvidenceId(encryption.keyId)) {
    reasons.push("training_encryption_not_ready");
  }
  if (encryption.keySeparationVerified !== true || encryption.keyId === fingerprinting.keyId) {
    reasons.push("training_key_separation_not_proven");
  }
  if (fingerprinting.ready !== true || fingerprinting.algorithm !== "HMAC-SHA-256" || !safeEvidenceId(fingerprinting.keyId)) {
    reasons.push("training_fingerprint_not_ready");
  }

  const sources = Array.isArray(provenance.sources) ? provenance.sources : [];
  if (sources.length === 0) reasons.push("provider_rights_missing");
  for (const source of sources) evaluateSource(source, rightsLedger, reasons, now);

  const labelSources = Array.isArray(candidate?.labels?.sources) ? candidate.labels.sources : [];
  if (labelSources.length === 0) reasons.push("label_source_missing");
  if (labelSources.some((source) => MODEL_LABEL_SOURCES.has(String(source).toLowerCase()))) {
    reasons.push("model_label_taint");
  }
  if (!labelSources.every((source) => ["human", "deterministic-tests", "static-analysis"].includes(source))) {
    reasons.push("label_source_not_allowed");
  }

  const uniqueReasons = [...new Set(reasons)];
  const eligible = uniqueReasons.length === 0;
  const revoked = resolvedConsent && consentDecision.status === "revoked";
  if (revoked) uniqueReasons.push("consent_revoked");
  const state = revoked
    ? TRAINING_STATES.REVOKED
    : eligible
      ? TRAINING_STATES.CANDIDATE
      : uniqueReasons.some((reason) => PERMANENT_DENIALS.has(reason))
        ? TRAINING_STATES.DENIED
        : TRAINING_STATES.QUARANTINED;
  return { eligible: revoked ? false : eligible, state, reasons: [...new Set(uniqueReasons)], evaluatedAt: now };
}

export function capturePersistenceAllowed(_candidate, consentDecision, {
  now = new Date().toISOString()
} = {}) {
  const consent = isFreshResolvedConsentDecision(consentDecision, { now }) ? consentDecision : {};
  return consent.verified === true
    && consent.status === "granted"
    && consent.captureAllowed === true
    && consent.trainingAllowed === true
    && consent.recordedBy === "authenticated-human"
    && consent.rightsConfirmed === true
    && safeEvidenceId(consent.evidenceId);
}

function evaluateSource(source, rightsLedger, reasons, now) {
  if (source?.kind === "human-first-party") return;
  const right = rightsLedger?.entries?.find((entry) => entry.id === source?.rightsId);
  if (!right) return reasons.push("provider_rights_missing");
  if (right.trainingUse === "denied") reasons.push("provider_training_use_denied");
  if (right.derivativeTrainingUse === "denied") reasons.push("provider_derivatives_denied");
  if (right.trainingUse !== "allowed" || right.derivativeTrainingUse !== "allowed") {
    reasons.push("provider_training_permission_not_positive");
  }
  if (!safeEvidenceId(right.permissionId) || right.permissionStatus !== "verified") {
    reasons.push("provider_written_permission_missing");
  }
  if (!safeEvidenceId(source.artifactRevision)) reasons.push("source_revision_missing");
  if (!safeEvidenceId(right.artifactRevision) || source.artifactRevision !== right.artifactRevision) {
    reasons.push("source_revision_not_authorized");
  }
  if (right.expiresAt && Date.parse(right.expiresAt) <= Date.parse(now)) reasons.push("provider_permission_expired");
}

function acceptedByHumanOrDeterministicProof(acceptance) {
  if (!acceptance || acceptance.status !== "accepted") return false;
  return acceptance.source === "human" || acceptance.source === "deterministic-tests";
}

function safeEvidenceId(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{5,240}$/.test(String(value || ""));
}
