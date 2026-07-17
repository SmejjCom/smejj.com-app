import crypto from "node:crypto";
import {
  SMEJJ_TARGET_MODEL_ID,
  TRAINING_SCHEMA_VERSION,
  TRAINING_STATES,
  isCaptureEnabled
} from "./constants.js";
import {
  encryptTrainingRecord,
  trainingEncryptionConfig,
  trainingFingerprintConfig
} from "./encryption.js";
import {
  consentDecisionMatchesReference,
  consentDecisionReference,
  isFreshResolvedConsentDecision,
  isResolvedConsentDecision
} from "./consent.js";
import { capturePersistenceAllowed, evaluateTrainingEligibility } from "./policy.js";
import {
  evidenceClaims,
  trainingEvidenceVerifierConfig,
  trainingVerificationEvidenceMatchesReference,
  trainingVerificationEvidenceObjectKey,
  trainingVerificationEvidenceReference,
  verifyTrainingVerificationEvidence
} from "./evidence.js";
import {
  isVerifiedTrainingPersistenceReceipt,
  trainingPersistenceReceiptReference,
  trainingRecordProofVerifierConfig
} from "./persistence.js";
import { canonicalJson, keyedTrainingFingerprint, sanitizeTrainingValue } from "./sanitize.js";
import {
  assertNoDatasetLeakage,
  assignDatasetSplit,
  normalizeDomain,
  trainingFamilyFingerprint
} from "./split.js";

/**
 * Builds an in-memory, sanitized candidate. Nothing is persisted here. Capture
 * defaults to disabled and the final training decision defaults to denied.
 */
export function prepareTrainingCandidate(raw, {
  rightsLedger,
  env = process.env,
  now = new Date().toISOString(),
  candidateId = crypto.randomUUID(),
  consentDecision,
  verificationEvidence
} = {}) {
  const evidenceConfig = trainingEvidenceVerifierConfig(env);
  const evidenceReference = trainingVerificationEvidenceReference(verificationEvidence, evidenceConfig);
  const rawDiffSha256 = sha256Text(String(raw?.payload?.diff || ""));
  const sanitizedPayloadSha256 = sha256Text(canonicalJson(
    sanitizeTrainingValue(raw?.payload || {}).value
  ));
  const evidenceScopeVerified = evidenceReference?.subjectRef === consentDecision?.subjectRef &&
    evidenceReference?.repositoryRef === consentDecision?.repositoryRef &&
    sameSha256(evidenceReference?.payloadSha256, sanitizedPayloadSha256) &&
    sameSha256(evidenceReference?.diffSha256, rawDiffSha256);
  const verifiedClaims = evidenceScopeVerified
    ? evidenceClaims(evidenceReference, evidenceConfig)
    : { verified: false, provenance: {}, quality: {}, repositoryRights: {} };
  const sanitized = sanitizeTrainingValue({
    payload: raw?.payload || {},
    provenance: verifiedClaims.provenance,
    repositoryRights: verifiedClaims.repositoryRights,
    quality: verifiedClaims.quality,
    labels: raw?.labels || { sources: [] }
  });
  const { value: sanitizedFields, ...sanitization } = sanitized;
  const encryption = trainingEncryptionConfig(env);
  const fingerprinting = trainingFingerprintConfig(env);
  const keySeparationVerified = encryption.ready &&
    fingerprinting.ready &&
    encryption.keyId !== fingerprinting.keyId &&
    !crypto.timingSafeEqual(encryption.key, fingerprinting.key);
  const domain = normalizeDomain(raw?.domain);
  const candidate = {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    recordId: normalizeCandidateId(candidateId, fingerprinting.key),
    targetModelId: SMEJJ_TARGET_MODEL_ID,
    createdAt: now,
    captureEnabled: isCaptureEnabled(env),
    domain,
    payload: sanitizedFields.payload,
    payloadFingerprint: fingerprinting.ready
      ? keyedTrainingFingerprint(sanitizedFields.payload, fingerprinting.key)
      : "",
    consentDecision: consentDecisionReference(consentDecision),
    verificationEvidence: evidenceReference,
    provenance: sanitizedFields.provenance,
    repositoryRights: sanitizedFields.repositoryRights,
    quality: sanitizedFields.quality,
    labels: sanitizedFields.labels,
    sanitization,
    encryption: {
      required: true,
      ready: encryption.ready,
      keyId: encryption.keyId,
      algorithm: encryption.algorithm,
      keySeparationVerified
    },
    fingerprinting: {
      ready: fingerprinting.ready,
      keyId: fingerprinting.keyId,
      algorithm: fingerprinting.algorithm
    },
    split: null,
    familyFingerprint: "",
    training: {
      eligible: false,
      state: TRAINING_STATES.DENIED,
      reasons: ["not_evaluated"]
    }
  };
  candidate.familyFingerprint = fingerprinting.ready
    ? trainingFamilyFingerprint(candidate, fingerprinting.key)
    : "";
  candidate.training = isCaptureEnabled(env)
    ? evaluateTrainingEligibility(candidate, rightsLedger, {
      now,
      consentDecision,
      verificationEvidenceVerified: verifiedClaims.verified === true && evidenceScopeVerified
    })
    : { eligible: false, state: TRAINING_STATES.DENIED, reasons: ["training_capture_disabled"], evaluatedAt: now };
  if (candidate.training.eligible) candidate.split = assignDatasetSplit(candidate.familyFingerprint);
  return deepFreeze(candidate);
}

/**
 * Produces immutable encrypted IDrive e2 objects. Without explicit capture
 * consent, positive encryption config and a sanitized candidate, it produces
 * no objects at all.
 */
export function buildTrainingCandidateWritePlan(candidate, {
  env = process.env,
  now = new Date().toISOString(),
  randomBytes,
  consentDecision
} = {}) {
  if (!candidate?.recordId || candidate?.sanitization?.passed !== true ||
      candidate.sanitization.rawPersisted !== false ||
      candidate.sanitization.sanitizerVersion !== "smejj-training-sanitizer-v1") {
    return blockedPlan(candidate, "candidate_not_sanitized");
  }
  if (!isDeepFrozen(candidate)) return blockedPlan(candidate, "candidate_not_immutable");
  const sanitizationCheck = revalidateCandidateSanitization(candidate);
  if (!sanitizationCheck.ok) return blockedPlan(candidate, sanitizationCheck.reason);
  if (!consentDecisionMatchesReference(consentDecision, candidate.consentDecision)) {
    return blockedPlan(candidate, "consent_decision_not_current");
  }
  const evidenceConfig = trainingEvidenceVerifierConfig(env);
  if (!verifyTrainingVerificationEvidence(candidate.verificationEvidence, evidenceConfig) ||
      candidate.verificationEvidence.subjectRef !== candidate.consentDecision?.subjectRef ||
      candidate.verificationEvidence.repositoryRef !== candidate.consentDecision?.repositoryRef ||
      !sameSha256(candidate.verificationEvidence.payloadSha256, sha256Text(canonicalJson(candidate.payload))) ||
      !sameSha256(candidate.verificationEvidence.diffSha256, sha256Text(String(candidate.payload?.diff || "")))) {
    return blockedPlan(candidate, "task_evidence_not_current");
  }
  const claims = evidenceClaims(candidate.verificationEvidence, evidenceConfig);
  if (claims.verified !== true || canonicalJson(claims.provenance) !== canonicalJson(candidate.provenance) ||
      canonicalJson(claims.quality) !== canonicalJson(candidate.quality) ||
      canonicalJson(claims.repositoryRights) !== canonicalJson(candidate.repositoryRights)) {
    return blockedPlan(candidate, "task_evidence_claims_mismatch");
  }
  if (!candidate.captureEnabled || !capturePersistenceAllowed(candidate, consentDecision, { now })) {
    return blockedPlan(candidate, "capture_persistence_not_authorized");
  }
  if (candidate.training?.state === TRAINING_STATES.DENIED ||
      candidate.training?.state === TRAINING_STATES.REVOKED) {
    return blockedPlan(candidate, "permanent_training_denial");
  }
  const fingerprinting = trainingFingerprintConfig(env);
  if (candidate.fingerprinting?.ready !== true || fingerprinting.ready !== true ||
      candidate.fingerprinting.keyId !== fingerprinting.keyId ||
      candidate.fingerprinting.algorithm !== fingerprinting.algorithm ||
      !candidate.payloadFingerprint || !candidate.familyFingerprint) {
    return blockedPlan(candidate, "training_fingerprint_not_ready");
  }
  const expectedPayloadFingerprint = keyedTrainingFingerprint(candidate.payload, fingerprinting.key);
  if (!sameSha256(candidate.payloadFingerprint, expectedPayloadFingerprint)) {
    return blockedPlan(candidate, "candidate_payload_fingerprint_mismatch");
  }
  const expectedFamilyFingerprint = trainingFamilyFingerprint(candidate, fingerprinting.key);
  if (!sameSha256(candidate.familyFingerprint, expectedFamilyFingerprint)) {
    return blockedPlan(candidate, "candidate_family_fingerprint_mismatch");
  }
  const expectedSplit = candidate.training?.eligible === true
    ? assignDatasetSplit(expectedFamilyFingerprint)
    : null;
  if (candidate.split !== expectedSplit) return blockedPlan(candidate, "candidate_split_mismatch");
  if (candidate.encryption?.keySeparationVerified !== true) {
    return blockedPlan(candidate, "training_key_separation_not_proven");
  }
  const encryption = trainingEncryptionConfig(env);
  if (!encryption.ready) return blockedPlan(candidate, "training_encryption_not_ready");
  if (candidate.encryption.keyId !== encryption.keyId ||
      encryption.keyId === fingerprinting.keyId ||
      crypto.timingSafeEqual(encryption.key, fingerprinting.key)) {
    return blockedPlan(candidate, "training_key_separation_not_proven");
  }
  const envelope = encryptTrainingRecord(candidate, { ...encryption, randomBytes });
  const date = validDate(now);
  const statePrefix = candidate.training.eligible ? "sanitized/candidates" : "quarantine";
  const shard = candidate.recordId.replace(/-/g, "").slice(0, 2).toLowerCase();
  const root = `training/${statePrefix}/${date.year}/${date.month}/${shard}/${candidate.recordId}`;
  const recordKey = `${root}/record.json.enc`;
  const statusKey = `${root}/status.json`;
  const verificationEvidenceSha256 = crypto.createHash("sha256")
    .update(canonicalJson(candidate.verificationEvidence))
    .digest("hex");
  const metadata = {
    schemaVersion: 1,
    recordId: candidate.recordId,
    targetModelId: candidate.targetModelId,
    state: candidate.training.state,
    eligible: candidate.training.eligible,
    reasons: candidate.training.reasons,
    split: candidate.split,
    domain: candidate.domain,
    familyFingerprint: candidate.familyFingerprint,
    encryptedRecordKey: recordKey,
    encryption: { algorithm: envelope.algorithm, keyId: envelope.keyId },
    payloadFingerprint: candidate.payloadFingerprint,
    consentEvidenceId: candidate.consentDecision?.evidenceId || null,
    consentLedgerDigest: candidate.consentDecision?.ledgerDigest || null,
    verificationEvidenceId: candidate.verificationEvidence.evidenceId,
    verificationEvidenceKey: trainingVerificationEvidenceObjectKey(candidate.verificationEvidence),
    verificationEvidenceSha256,
    taskCapsuleKey: candidate.verificationEvidence.sourceProof.taskCapsuleKey,
    taskCapsuleSha256: candidate.verificationEvidence.sourceProof.taskCapsuleSha256,
    createdAt: candidate.createdAt,
    persistedAt: now,
    writePolicy: "append-only-if-none-match-status-last"
  };
  return {
    ok: true,
    provider: "idrive-e2",
    immutable: true,
    root,
    statusKey,
    consentReference: copyConsentReference(candidate.consentDecision),
    verificationEvidenceReference: candidate.verificationEvidence,
    objects: [
      jsonObject(recordKey, envelope, false),
      jsonObject(statusKey, metadata, true)
    ]
  };
}

export async function writeTrainingCandidateToIdrive(plan, {
  putObject,
  resolveConsentDecision,
  resolveVerificationEvidence,
  evidenceConfig,
  now = () => new Date().toISOString()
} = {}) {
  assertImmutableWritePlan(plan, evidenceConfig);
  if (typeof putObject !== "function") throw new Error("training_idrive_writer_required");
  if (typeof resolveConsentDecision !== "function") throw new Error("training_consent_resolver_required");
  if (typeof resolveVerificationEvidence !== "function") throw new Error("training_evidence_resolver_required");
  const consentReference = copyConsentReference(plan.consentReference);
  const verificationReference = plan.verificationEvidenceReference;
  const written = [];
  const evidence = [];
  for (const object of plan.objects) {
    await requireFreshConsentDecision(consentReference, resolveConsentDecision, now, object.statusLast ? "status" : "record");
    await requireCurrentVerificationEvidence(
      verificationReference,
      resolveVerificationEvidence,
      evidenceConfig,
      object.statusLast ? "status" : "record"
    );
    const result = await putObject(object);
    if (result?.conditionEnforced !== true || result?.contentVerified !== true ||
        result?.created !== true || Number(result?.proofStatus) !== 412) {
      throw new Error(`training_immutable_write_not_proven:${object.key}`);
    }
    written.push(object.key);
    evidence.push({
      key: object.key,
      statusLast: object.statusLast,
      createdNow: result.createdNow === true,
      idempotent: result.idempotent === true,
      recoveredAfterAmbiguous: result.recoveredAfterAmbiguous === true,
      conditionEnforced: true,
      contentVerified: true,
      sizeBytes: object.sizeBytes,
      sha256: object.sha256,
      putStatus: Number(result.putStatus || 0),
      proofStatus: Number(result.proofStatus || 0)
    });
  }
  await requireFreshConsentDecision(consentReference, resolveConsentDecision, now, "post-status");
  await requireCurrentVerificationEvidence(
    verificationReference,
    resolveVerificationEvidence,
    evidenceConfig,
    "post-status"
  );
  const result = { ok: true, immutable: true, written, evidence, statusKey: plan.statusKey };
  return {
    ...result,
    persistenceDescriptor: Object.freeze({
      recordKey: plan.objects[0].key,
      recordSizeBytes: plan.objects[0].sizeBytes,
      recordSha256: plan.objects[0].sha256,
      statusKey: plan.objects[1].key,
      statusSizeBytes: plan.objects[1].sizeBytes,
      statusSha256: plan.objects[1].sha256
    })
  };
}

function assertImmutableWritePlan(plan, evidenceConfig) {
  if (!plan?.ok || !Array.isArray(plan.objects) || plan.objects.length !== 2) {
    throw new Error("training_write_plan_required");
  }
  const [record, status] = plan.objects;
  if (!validConsentReference(plan.consentReference)) throw new Error("training_consent_reference_invalid");
  if (!verifyTrainingVerificationEvidence(plan.verificationEvidenceReference, evidenceConfig) ||
      plan.verificationEvidenceReference.subjectRef !== plan.consentReference.subjectRef ||
      plan.verificationEvidenceReference.repositoryRef !== plan.consentReference.repositoryRef) {
    throw new Error("training_evidence_reference_invalid");
  }
  if (record.statusLast !== false || status.statusLast !== true || status.key !== plan.statusKey) {
    throw new Error("training_status_must_be_written_last");
  }
  const keys = new Set(plan.objects.map((object) => object.key));
  if (keys.size !== 2 || !plan.objects.every((object) => (
    /^training\/(?:sanitized\/candidates|quarantine)\/\d{4}\/\d{2}\/[a-z0-9]{2}\/[a-z0-9][a-z0-9._-]{7,120}\/(?:record\.json\.enc|status\.json)$/.test(object.key) &&
    object.ifNoneMatch === "*" &&
    object.conditionRequired === true &&
    typeof object.body === "string" &&
    Number.isSafeInteger(object.sizeBytes) &&
    object.sizeBytes === Buffer.byteLength(String(object.body || ""), "utf8") &&
    /^[a-f0-9]{64}$/.test(String(object.sha256 || "")) &&
    object.sha256 === crypto.createHash("sha256").update(String(object.body || ""), "utf8").digest("hex")
  ))) {
    throw new Error("training_immutable_write_contract_invalid");
  }
}

export async function buildDatasetVersionManifest(records, {
  versionId,
  createdAt = new Date().toISOString(),
  resolveConsentDecision,
  resolveVerificationEvidence,
  resolvePersistenceReceipt,
  env = process.env
} = {}) {
  const safeVersion = String(versionId || "").trim();
  if (!/^v\d{4}\.\d{2}\.\d{2}(?:-[a-z0-9.-]+)?$/.test(safeVersion)) throw new Error("dataset_version_id_invalid");
  if (!Array.isArray(records) || records.length === 0) throw new Error("dataset_records_required");
  if (typeof resolveConsentDecision !== "function" || typeof resolveVerificationEvidence !== "function" ||
      typeof resolvePersistenceReceipt !== "function") throw new Error("dataset_authority_resolvers_required");
  const evidenceConfig = trainingEvidenceVerifierConfig(env);
  const proofVerifier = trainingRecordProofVerifierConfig(env);
  const receipts = new Map();
  for (const record of records) {
    const decision = await resolveDatasetAuthority(resolveConsentDecision, record, "consent");
    if (!isResolvedConsentDecision(decision) || !isFreshResolvedConsentDecision(decision, { now: createdAt }) ||
        decision.status !== "granted" ||
        decision.verified !== true || !consentDecisionMatchesReference(decision, record?.consentDecision)) {
      throw new Error(`dataset_consent_decision_required:${record?.recordId || "unknown"}`);
    }
    if (record?.training?.eligible !== true || record?.training?.state !== TRAINING_STATES.CANDIDATE) {
      throw new Error(`dataset_record_not_eligible:${record?.recordId || "unknown"}`);
    }
    const evidence = await resolveDatasetAuthority(resolveVerificationEvidence, record, "evidence");
    if (!trainingVerificationEvidenceMatchesReference(evidence, record?.verificationEvidence, evidenceConfig) ||
        evidence.subjectRef !== decision.subjectRef || evidence.repositoryRef !== decision.repositoryRef) {
      throw new Error(`dataset_task_evidence_required:${record?.recordId || "unknown"}`);
    }
    const receipt = await resolveDatasetAuthority(resolvePersistenceReceipt, record, "persistence");
    if (!isVerifiedTrainingPersistenceReceipt(receipt, record, proofVerifier)) {
      throw new Error(`dataset_persistence_receipt_required:${record?.recordId || "unknown"}`);
    }
    receipts.set(record.recordId, receipt);
  }
  assertNoDatasetLeakage(records);
  const entries = records.map((record) => trainingPersistenceReceiptReference(
    receipts.get(record.recordId),
    record,
    proofVerifier
  )).sort((a, b) => a.recordId.localeCompare(b.recordId));
  const contentSha256 = crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  for (const record of records) {
    const decision = await resolveDatasetAuthority(resolveConsentDecision, record, "post-build-consent");
    if (!isResolvedConsentDecision(decision) || !isFreshResolvedConsentDecision(decision, { now: createdAt }) ||
        decision.status !== "granted" || !consentDecisionMatchesReference(decision, record.consentDecision)) {
      throw new Error(`dataset_consent_recheck_failed:${record.recordId}`);
    }
    const evidence = await resolveDatasetAuthority(resolveVerificationEvidence, record, "post-build-evidence");
    if (!trainingVerificationEvidenceMatchesReference(evidence, record.verificationEvidence, evidenceConfig)) {
      throw new Error(`dataset_task_evidence_recheck_failed:${record.recordId}`);
    }
  }
  return {
    schemaVersion: 1,
    datasetId: SMEJJ_TARGET_MODEL_ID,
    versionId: safeVersion,
    createdAt,
    immutable: true,
    trainingDataEncrypted: true,
    sourceRecords: entries,
    counts: countBySplitAndDomain(entries),
    contentSha256,
    leakageCheck: "passed-family-grouped",
    promotionStatus: "not-approved"
  };
}

async function resolveDatasetAuthority(resolver, record, stage) {
  try {
    return await resolver(record);
  } catch {
    throw new Error(`dataset_authority_resolution_failed:${stage}:${record?.recordId || "unknown"}`);
  }
}

async function requireFreshConsentDecision(reference, resolver, now, stage) {
  let decision;
  let resolvedAt;
  try {
    decision = await resolver(reference);
    resolvedAt = typeof now === "function" ? now() : now;
  } catch {
    throw new Error(`training_consent_recheck_failed:${stage}`);
  }
  if (!isFreshResolvedConsentDecision(decision, { now: resolvedAt }) ||
      decision.verified !== true || decision.status !== "granted" ||
      decision.captureAllowed !== true || decision.trainingAllowed !== true ||
      decision.rightsConfirmed !== true ||
      !consentDecisionMatchesReference(decision, reference)) {
    throw new Error(`training_consent_recheck_failed:${stage}`);
  }
}

async function requireCurrentVerificationEvidence(reference, resolver, config, stage) {
  let evidence;
  try {
    evidence = await resolver(reference);
  } catch {
    throw new Error(`training_evidence_recheck_failed:${stage}`);
  }
  if (!trainingVerificationEvidenceMatchesReference(evidence, reference, config)) {
    throw new Error(`training_evidence_recheck_failed:${stage}`);
  }
}

function copyConsentReference(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...(Array.isArray(value.reasons) ? value.reasons : [])])
  });
}

function validConsentReference(value) {
  return value?.verified === true && value?.status === "granted" &&
    value?.captureAllowed === true && value?.trainingAllowed === true && value?.rightsConfirmed === true &&
    /^sub_[a-f0-9]{64}$/.test(String(value?.subjectRef || "")) &&
    /^repo_[a-f0-9]{64}$/.test(String(value?.repositoryRef || "")) &&
    /^[a-f0-9]{64}$/.test(String(value?.privacyNoticeSha256 || "")) &&
    /^[a-f0-9]{64}$/.test(String(value?.ledgerDigest || "")) &&
    Number.isFinite(Date.parse(String(value?.resolvedAt || ""))) &&
    Array.isArray(value?.reasons);
}

function revalidateCandidateSanitization(candidate) {
  if (!Array.isArray(candidate.sanitization?.residualFindings) ||
      candidate.sanitization.residualFindings.length !== 0) {
    return { ok: false, reason: "candidate_sanitization_revalidation_failed" };
  }
  const fields = {
    payload: candidate.payload,
    provenance: candidate.provenance,
    repositoryRights: candidate.repositoryRights,
    quality: candidate.quality,
    labels: candidate.labels
  };
  try {
    const rechecked = sanitizeTrainingValue(fields);
    if (rechecked.passed !== true || rechecked.rawPersisted !== false ||
        rechecked.residualFindings.length !== 0 ||
        canonicalJson(rechecked.value) !== canonicalJson(fields)) {
      return { ok: false, reason: "candidate_sanitization_revalidation_failed" };
    }
  } catch {
    return { ok: false, reason: "candidate_sanitization_revalidation_failed" };
  }
  return { ok: true };
}

function sameSha256(left, right) {
  if (!/^[a-f0-9]{64}$/.test(String(left || "")) || !/^[a-f0-9]{64}$/.test(String(right || ""))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (typeof value === "function") return false;
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => isDeepFrozen(child, seen));
}

function blockedPlan(candidate, reason) {
  return { ok: false, provider: "idrive-e2", immutable: true, recordId: candidate?.recordId || null, reason, objects: [] };
}

function jsonObject(key, value, statusLast) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return {
    key,
    contentType: "application/json; charset=utf-8",
    body,
    ifNoneMatch: "*",
    conditionRequired: true,
    statusLast,
    sizeBytes: Buffer.byteLength(body, "utf8"),
    sha256: crypto.createHash("sha256").update(body, "utf8").digest("hex")
  };
}

function normalizeCandidateId(value, fingerprintKey) {
  const id = String(value || "").trim().toLowerCase();
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) return id;
  if (!id || id.length > 512 || /[\u0000-\u001f\u007f]/.test(id)) throw new Error("training_candidate_id_invalid");
  if (!Buffer.isBuffer(fingerprintKey) || fingerprintKey.length !== 32) return crypto.randomUUID();
  const digest = crypto.createHmac("sha256", fingerprintKey).update(id).digest("hex");
  return `candidate-${digest.slice(0, 48)}`;
}

function validDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("training_timestamp_invalid");
  return {
    year: String(date.getUTCFullYear()).padStart(4, "0"),
    month: String(date.getUTCMonth() + 1).padStart(2, "0")
  };
}

function countBySplitAndDomain(entries) {
  const splits = { train: 0, validation: 0, test: 0 };
  const domains = {};
  for (const entry of entries) {
    splits[entry.split] += 1;
    domains[entry.domain] = Number(domains[entry.domain] || 0) + 1;
  }
  return { total: entries.length, splits, domains };
}
