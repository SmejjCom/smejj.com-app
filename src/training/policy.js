import {
  MODEL_LABEL_SOURCES,
  REQUIRED_QUALITY_GATES,
  TRAINING_STATES
} from "./constants.js";
import {
  isFreshResolvedConsentDecision,
  isResolvedConsentDecision
} from "./consent.js";

// Rechte-Register fuer ANTWORTEN FREMDER MODELLE (Betreiber-Auftrag 23.09.2026:
// "Anbieterrechte klaeren, bevor trainiert wird"). Ein Lernpaar ist Frage +
// Antwort; die Antwort stammt fast immer von einem fremden Modell, und dessen
// Nutzungsbedingungen entscheiden, ob sie ein eigenes Modell trainieren darf.
// Gelesen am 2026-09-23, Belege in docs/compliance/anbieterrechte-training-2026-09-23.md.
//
// FAIL-CLOSED: Nur ein ausdruecklich als "allowed" gefuehrtes Modell darf in
// den Datensatz. Unbekannt, ungeprueft oder "Auflage nicht erfuellt" = raus.
// Reihenfolge zaehlt: der erste passende Eintrag gewinnt.
export const ANTWORT_RECHTE_STAND = "2026-09-23";
export const ANTWORT_RECHTE = Object.freeze([
  Object.freeze({
    id: "smejj-eigen", muster: /^smejj[-_ ]?1\b/i, anbieter: "smejj (Hausmodell)",
    trainingUse: "allowed", derivativeTrainingUse: "allowed",
    grund: "eigenes Modell; Basis Qwen3-4B-Instruct-2507 unter Apache-2.0 (keine Auflage fuer Ausgaben)",
    quelle: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507"
  }),
  Object.freeze({
    id: "zai-glm-api", muster: /^(glm|zai|zhipu|bigmodel)/i, anbieter: "Z.ai / Zhipu (API)",
    trainingUse: "denied", derivativeTrainingUse: "denied",
    grund: "Z.ai-Nutzungsbedingungen III.4.f und API-Zusatz 1.f.xii verbieten, mit Ausgaben konkurrierende Modelle zu trainieren; BigModel verbietet Training/Feintuning mit Ausgaben generell",
    quelle: "https://docs.z.ai/legal-agreement/terms-of-use"
  }),
  Object.freeze({
    id: "groq-gpt-oss", muster: /^(groq:)?(openai\/)?gpt-oss-(20b|120b)$/i, anbieter: "Groq (gpt-oss)",
    trainingUse: "allowed", derivativeTrainingUse: "allowed",
    grund: "Groq: Rechte an Ausgaben beim Kunden, Wettbewerbsverbot nur fuer Hosting-Dienste; gpt-oss unter Apache-2.0",
    quelle: "https://console.groq.com/docs/legal/services-agreement"
  }),
  Object.freeze({
    id: "llama-namenspflicht", muster: /llama/i, anbieter: "Meta Llama (ueber Groq)",
    trainingUse: "denied", derivativeTrainingUse: "denied",
    grund: "Llama-Lizenz 1.b.i erlaubt Training nur, wenn der Modellname mit \"Llama\" beginnt und \"Built with Llama\" angezeigt wird — smejj 1 heisst anders, Auflage nicht erfuellt",
    quelle: "https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_3/LICENSE"
  })
]);

/**
 * Darf die Antwort dieses Modells in einen Trainingsdatensatz? Rein, ohne Netz.
 * @param {{modell?: string}|string|null} quelle  Modellkennung der Antwort (x-smejj-model-id)
 * @returns {{zulaessig: boolean, grund: string, rechtId: string|null}}
 */
export function antwortQuelleZulaessig(quelle) {
  const modell = String((typeof quelle === "string" ? quelle : quelle?.modell) || "").trim();
  if (!modell) return { zulaessig: false, grund: "herkunft_unbekannt", rechtId: null };
  const recht = ANTWORT_RECHTE.find((eintrag) => eintrag.muster.test(modell));
  if (!recht) return { zulaessig: false, grund: "anbieterrecht_ungeprueft", rechtId: null };
  if (recht.trainingUse !== "allowed" || recht.derivativeTrainingUse !== "allowed") {
    return { zulaessig: false, grund: "anbieter_verbietet_training", rechtId: recht.id };
  }
  return { zulaessig: true, grund: "erlaubt", rechtId: recht.id };
}

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
  // Antwort eines Modells: zuerst das feste Rechte-Register oben. Verbietet
  // der Anbieter das Training, hilft auch keine Eintragung im Ledger.
  if (source?.kind === "model-output") {
    const urteil = antwortQuelleZulaessig(source);
    if (urteil.grund === "anbieter_verbietet_training") reasons.push("provider_training_use_denied");
    else if (!urteil.zulaessig) reasons.push("provider_rights_missing");
    return;
  }
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
