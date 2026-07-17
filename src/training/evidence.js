import crypto from "node:crypto";
import { REQUIRED_QUALITY_GATES } from "./constants.js";
import { canonicalJson } from "./sanitize.js";
import {
  createImmutableTrainingObject,
  isTrainingEvidenceAttestorWriter
} from "./idrive-conditional-writer.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{5,240}$/;
const KEY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/;
const REPOSITORY_REF_PATTERN = /^repo_[a-f0-9]{64}$/;
const SUBJECT_REF_PATTERN = /^sub_[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const CAPSULE_KEY_PATTERN = /^jobs\/(?:[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/){1,8}task-capsule\.json$/;
const STATUS_KEY_PATTERN = /^jobs\/(?:[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/){1,8}status\.json$/;
const MAX_ATTESTATION_OBJECT_BYTES = 1_048_576;
const signingKeys = new WeakMap();

/** Dedicated Ed25519 configuration for trusted, post-verification training evidence. */
export function trainingEvidenceConfig(env = process.env) {
  const keyId = safeKeyId(env.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID);
  const privateKey = decodePrivateKey(env.SMEJJ_TRAINING_EVIDENCE_PRIVATE_KEY_B64);
  const publicKey = decodePublicKey(env.SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64);
  const otherKeyIds = [
    env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID,
    env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID,
    env.SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID
  ].map(safeKeyId).filter(Boolean);
  const separated = Boolean(
    privateKey && publicKey && keyId && otherKeyIds.length === 5 &&
    new Set([keyId, ...otherKeyIds]).size === 6 && keyPairMatches(privateKey, publicKey)
  );
  const publicKeyBytes = separated ? publicKey.export({ format: "der", type: "spki" }) : null;
  const result = Object.freeze({
    ready: separated,
    keyId: separated ? keyId : "",
    publicKey: separated ? publicKey : null,
    publicKeySha256: publicKeyBytes ? crypto.createHash("sha256").update(publicKeyBytes).digest("hex") : "",
    algorithm: "Ed25519",
    keySeparationVerified: separated
  });
  if (separated) signingKeys.set(result, privateKey);
  return result;
}

/** Public-only verifier configuration for stateless dataset and training workers. */
export function trainingEvidenceVerifierConfig(env = process.env) {
  const keyId = safeKeyId(env.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID);
  const publicKey = decodePublicKey(env.SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64);
  const peerIds = [
    env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID,
    env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID,
    env.SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID
  ].map(safeKeyId).filter(Boolean);
  const ready = Boolean(keyId && publicKey && peerIds.length === 5 && new Set([keyId, ...peerIds]).size === 6);
  const bytes = ready ? publicKey.export({ format: "der", type: "spki" }) : null;
  return Object.freeze({
    ready,
    keyId: ready ? keyId : "",
    publicKey: ready ? publicKey : null,
    publicKeySha256: bytes ? crypto.createHash("sha256").update(bytes).digest("hex") : "",
    algorithm: "Ed25519"
  });
}

/**
 * Issues evidence only from two immutable IDrive e2 objects whose exact bytes
 * were read, digest-checked, condition-proven and read again. No raw claim API
 * is exported, so booleans supplied by a caller can never become authority.
 */
export async function issueTrainingVerificationEvidence(input, {
  config,
  writer,
  now = new Date().toISOString(),
  randomUUID = crypto.randomUUID
} = {}) {
  assertReady(config);
  if (!isTrainingEvidenceAttestorWriter(writer)) throw new Error("training_evidence_attestor_writer_required");
  const descriptors = normalizeAttestationDescriptors(input);
  const taskCapsule = await readProveRead(descriptors.taskCapsule, writer);
  const finalStatus = await readProveRead(descriptors.finalStatus, writer);
  const claims = claimsFromImmutableObjects(taskCapsule, finalStatus);
  const unsigned = normalizeEvidence({
    schemaVersion: 1,
    evidenceId: `training-evidence:${randomUUID()}`,
    occurredAt: validTimestamp(now),
    signingKeyId: config.keyId,
    publicKeySha256: config.publicKeySha256,
    ...claims
  });
  return deepFreeze({ ...unsigned, signature: sign(unsigned, signingKeys.get(config)) });
}

export function verifyTrainingVerificationEvidence(value, config) {
  if (!config?.ready || !validEvidenceShape(value, config)) return false;
  const unsigned = { ...value };
  delete unsigned.signature;
  return crypto.verify(
    null,
    Buffer.from(canonicalJson(unsigned), "utf8"),
    config.publicKey,
    Buffer.from(value.signature, "base64url")
  );
}

export function trainingVerificationEvidenceReference(value, config) {
  if (!verifyTrainingVerificationEvidence(value, config)) return null;
  return deepFreeze(structuredClone(value));
}

export function trainingVerificationEvidenceMatchesReference(value, reference, config) {
  if (!verifyTrainingVerificationEvidence(value, config) || !reference) return false;
  return canonicalJson(value) === canonicalJson(reference);
}

export function trainingVerificationEvidenceObject(value, config) {
  if (!verifyTrainingVerificationEvidence(value, config)) throw new Error("training_evidence_signature_invalid");
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return createImmutableTrainingObject({
    key: trainingVerificationEvidenceObjectKey(value),
    body
  });
}

export function trainingVerificationEvidenceObjectKey(value) {
  if (!SUBJECT_REF_PATTERN.test(String(value?.subjectRef || "")) ||
      !REPOSITORY_REF_PATTERN.test(String(value?.repositoryRef || "")) ||
      !ID_PATTERN.test(String(value?.evidenceId || ""))) {
    throw new Error("training_evidence_storage_scope_invalid");
  }
  const evidenceDigest = crypto.createHash("sha256").update(String(value.evidenceId)).digest("hex");
  return `training/evidence/v1/${value.subjectRef}/${value.repositoryRef}/${evidenceDigest}.json`;
}

export function evidenceClaims(value, config) {
  if (!verifyTrainingVerificationEvidence(value, config)) {
    return Object.freeze({ verified: false, quality: {}, repositoryRights: {} });
  }
  return Object.freeze({
    verified: true,
    provenance: deepFreeze(structuredClone(value.provenance)),
    quality: deepFreeze(structuredClone(value.quality)),
    repositoryRights: deepFreeze(structuredClone(value.repositoryRights))
  });
}

function normalizeEvidence(value) {
  const normalized = {
    schemaVersion: 1,
    evidenceId: String(value.evidenceId || ""),
    occurredAt: validTimestamp(value.occurredAt),
    signingKeyId: String(value.signingKeyId || ""),
    publicKeySha256: normalizeHash(value.publicKeySha256),
    subjectRef: String(value.subjectRef || ""),
    repositoryRef: String(value.repositoryRef || ""),
    payloadSha256: normalizeHash(value.payloadSha256),
    diffSha256: normalizeHash(value.diffSha256),
    sourceProof: normalizeSourceProof(value.sourceProof),
    provenance: normalizeProvenance(value.provenance),
    quality: normalizeQuality(value.quality),
    repositoryRights: normalizeRepositoryRights(value.repositoryRights)
  };
  if (!ID_PATTERN.test(normalized.evidenceId)) throw new Error("training_evidence_id_invalid");
  if (!KEY_ID_PATTERN.test(normalized.signingKeyId)) throw new Error("training_evidence_key_id_invalid");
  if (!SUBJECT_REF_PATTERN.test(normalized.subjectRef)) throw new Error("training_evidence_subject_ref_invalid");
  if (!REPOSITORY_REF_PATTERN.test(normalized.repositoryRef)) throw new Error("training_evidence_repository_ref_invalid");
  return normalized;
}

function normalizeSourceProof(value = {}) {
  const result = {
    taskCapsuleKey: String(value.taskCapsuleKey || ""),
    taskCapsuleSha256: normalizeHash(value.taskCapsuleSha256),
    finalStatusKey: String(value.finalStatusKey || ""),
    finalStatusSha256: normalizeHash(value.finalStatusSha256),
    conditionEnforced: value.conditionEnforced === true,
    contentVerified: value.contentVerified === true,
    proofStatus: Number(value.proofStatus)
  };
  if (!CAPSULE_KEY_PATTERN.test(result.taskCapsuleKey) || !STATUS_KEY_PATTERN.test(result.finalStatusKey)) {
    throw new Error("training_evidence_capsule_key_invalid");
  }
  const capsuleRoot = result.taskCapsuleKey.slice(0, -"task-capsule.json".length);
  if (result.finalStatusKey !== `${capsuleRoot}status.json`) throw new Error("training_evidence_capsule_scope_mismatch");
  if (!result.conditionEnforced || !result.contentVerified || result.proofStatus !== 412) {
    throw new Error("training_evidence_immutable_readback_required");
  }
  return result;
}

function normalizeQuality(value = {}) {
  const result = {};
  for (const gate of REQUIRED_QUALITY_GATES) {
    if (value[gate] !== "passed") throw new Error(`training_evidence_quality_${gate}_not_passed`);
    result[gate] = "passed";
  }
  result.uiAffected = value.uiAffected === true;
  result.browser = result.uiAffected ? String(value.browser || "") : "not-required";
  if (result.uiAffected && result.browser !== "passed") throw new Error("training_evidence_quality_browser_not_passed");
  result.diffStatus = String(value.diffStatus || "");
  if (result.diffStatus !== "non-empty") throw new Error("training_evidence_diff_not_verified");
  result.acceptance = {
    status: String(value.acceptance?.status || ""),
    source: String(value.acceptance?.source || "")
  };
  if (result.acceptance.status !== "accepted" || !["human", "deterministic-tests"].includes(result.acceptance.source)) {
    throw new Error("training_evidence_acceptance_not_proven");
  }
  return result;
}

function normalizeProvenance(value = {}) {
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 20) {
    throw new Error("training_evidence_provenance_sources_invalid");
  }
  const sources = value.sources.map((source) => {
    const kind = String(source?.kind || "");
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(kind)) throw new Error("training_evidence_provenance_kind_invalid");
    const result = { kind };
    if (source?.rightsId !== undefined) {
      result.rightsId = String(source.rightsId || "");
      if (!ID_PATTERN.test(result.rightsId)) throw new Error("training_evidence_provenance_rights_invalid");
    }
    if (source?.artifactRevision !== undefined) {
      result.artifactRevision = String(source.artifactRevision || "");
      if (!ID_PATTERN.test(result.artifactRevision)) throw new Error("training_evidence_provenance_revision_invalid");
    }
    return result;
  });
  const repositoryFingerprint = String(value.repositoryFingerprint || "");
  const baseCommit = String(value.baseCommit || "");
  const affectedPaths = [...new Set(Array.isArray(value.affectedPaths) ? value.affectedPaths.map(String) : [])].sort();
  if (!ID_PATTERN.test(repositoryFingerprint) || !/^[a-f0-9]{40,64}$/.test(baseCommit) ||
      affectedPaths.length < 1 || affectedPaths.length > 200 ||
      affectedPaths.some((item) => !/^[a-zA-Z0-9][a-zA-Z0-9._/@+-]{0,239}$/.test(item) || item.includes(".."))) {
    throw new Error("training_evidence_provenance_repository_invalid");
  }
  return { sources, repositoryFingerprint, baseCommit, affectedPaths };
}

function normalizeRepositoryRights(value = {}) {
  const result = {
    status: String(value.status || ""),
    trainingUseAllowed: value.trainingUseAllowed === true,
    evidenceId: String(value.evidenceId || "")
  };
  if (result.status !== "confirmed" || !result.trainingUseAllowed || !ID_PATTERN.test(result.evidenceId)) {
    throw new Error("training_evidence_repository_rights_not_proven");
  }
  return result;
}

function validEvidenceShape(value, config) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 14) return false;
  if (value.schemaVersion !== 1 || value.signingKeyId !== config.keyId || value.publicKeySha256 !== config.publicKeySha256) return false;
  if (!SIGNATURE_PATTERN.test(String(value.signature || ""))) return false;
  try {
    const normalized = normalizeEvidence(value);
    return canonicalJson(normalized) === canonicalJson((() => {
      const copy = { ...value };
      delete copy.signature;
      return copy;
    })());
  } catch {
    return false;
  }
}

function normalizeAttestationDescriptors(value = {}) {
  const taskCapsule = normalizeReadDescriptor(value.taskCapsule, CAPSULE_KEY_PATTERN);
  const finalStatus = normalizeReadDescriptor(value.finalStatus, STATUS_KEY_PATTERN);
  const root = taskCapsule.key.slice(0, -"task-capsule.json".length);
  if (finalStatus.key !== `${root}status.json`) throw new Error("training_evidence_capsule_scope_mismatch");
  return { taskCapsule, finalStatus };
}

function normalizeReadDescriptor(value = {}, keyPattern) {
  const key = String(value.key || "");
  const sizeBytes = Number(value.sizeBytes);
  const sha256 = normalizeHash(value.sha256);
  if (key.length > 1_024 || !keyPattern.test(key) || key.includes("..") || key.includes("\\")) {
    throw new Error("training_evidence_capsule_key_invalid");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 2 || sizeBytes > MAX_ATTESTATION_OBJECT_BYTES) {
    throw new Error("training_evidence_read_descriptor_invalid");
  }
  return { key, sizeBytes, sha256 };
}

async function readProveRead(descriptor, runtime) {
  const first = await readExactObject(descriptor, runtime.getObject);
  const proofObject = createImmutableTrainingObject({ key: descriptor.key, body: first });
  let proof;
  try {
    proof = await runtime.putObject(proofObject);
  } catch {
    throw new Error("training_evidence_condition_proof_failed");
  }
  if (proof?.created !== true || proof.createdNow !== false || proof.idempotent !== true ||
      proof.conditionEnforced !== true || proof.contentVerified !== true ||
      Number(proof.putStatus) !== 412 || Number(proof.proofStatus) !== 412 ||
      proof.sizeBytes !== descriptor.sizeBytes || proof.sha256 !== descriptor.sha256) {
    throw new Error("training_evidence_immutable_readback_required");
  }
  const second = await readExactObject(descriptor, runtime.getObject);
  if (!crypto.timingSafeEqual(first, second)) throw new Error("training_evidence_readback_changed");
  return { ...descriptor, body: second };
}

async function readExactObject(descriptor, getObject) {
  let result;
  try {
    result = await getObject(descriptor);
  } catch {
    throw new Error("training_evidence_readback_failed");
  }
  let body;
  try {
    body = Buffer.isBuffer(result?.body) ? Buffer.from(result.body) : Buffer.from(result?.body || "", "utf8");
  } catch {
    throw new Error("training_evidence_readback_invalid");
  }
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  if (result?.ok !== true || Number(result?.status) !== 200 || result?.contentVerified !== true ||
      result?.key !== descriptor.key || result?.sizeBytes !== descriptor.sizeBytes ||
      result?.sha256 !== descriptor.sha256 || body.length !== descriptor.sizeBytes || digest !== descriptor.sha256) {
    throw new Error("training_evidence_readback_digest_mismatch");
  }
  return body;
}

function claimsFromImmutableObjects(taskCapsuleObject, finalStatusObject) {
  const capsule = parseJsonObject(taskCapsuleObject.body, "task_capsule");
  const status = parseJsonObject(finalStatusObject.body, "final_status");
  const candidate = plainObject(capsule.trainingCandidate, "training_evidence_capsule_candidate_invalid");
  const verification = plainObject(status.trainingVerification, "training_evidence_status_verification_invalid");
  const expectedJobId = taskCapsuleObject.key.split("/").at(-2);
  if (capsule.schemaVersion !== 1 || status.schemaVersion !== 1 ||
      String(capsule.jobId || "") !== expectedJobId || status.jobId !== capsule.jobId ||
      status.status !== "passed" || status.phase !== "verified" || status.trainingEligible !== true ||
      verification.schemaVersion !== 1 || verification.taskCapsuleSha256 !== taskCapsuleObject.sha256) {
    throw new Error("training_evidence_final_status_not_authoritative");
  }
  const subjectRef = String(candidate.subjectRef || "");
  const repositoryRef = String(candidate.repositoryRef || "");
  const payloadSha256 = normalizeHash(candidate.payloadSha256);
  const diffSha256 = normalizeHash(candidate.diffSha256);
  if (verification.subjectRef !== subjectRef || verification.repositoryRef !== repositoryRef ||
      verification.payloadSha256 !== payloadSha256 || verification.diffSha256 !== diffSha256) {
    throw new Error("training_evidence_status_candidate_mismatch");
  }
  const repositoryRights = normalizeRepositoryRights(candidate.repositoryRights);
  if (verification.repositoryRightsEvidenceId !== repositoryRights.evidenceId) {
    throw new Error("training_evidence_status_rights_mismatch");
  }
  return {
    subjectRef,
    repositoryRef,
    payloadSha256,
    diffSha256,
    sourceProof: {
      taskCapsuleKey: taskCapsuleObject.key,
      taskCapsuleSha256: taskCapsuleObject.sha256,
      finalStatusKey: finalStatusObject.key,
      finalStatusSha256: finalStatusObject.sha256,
      conditionEnforced: true,
      contentVerified: true,
      proofStatus: 412
    },
    provenance: normalizeProvenance(candidate.provenance),
    quality: normalizeQuality(verification.quality),
    repositoryRights
  };
}

function parseJsonObject(body, label) {
  let value;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error(`training_evidence_${label}_json_invalid`);
  }
  return plainObject(value, `training_evidence_${label}_invalid`);
}

function plainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(code);
  }
  return value;
}

function sign(value, privateKey) {
  return crypto.sign(null, Buffer.from(canonicalJson(value), "utf8"), privateKey).toString("base64url");
}

function normalizeHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(hash)) throw new Error("training_evidence_hash_invalid");
  return hash;
}

function validTimestamp(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) throw new Error("training_evidence_timestamp_invalid");
  return date.toISOString();
}

function safeKeyId(value) {
  const keyId = String(value || "").trim();
  return KEY_ID_PATTERN.test(keyId) ? keyId : "";
}

function decodePrivateKey(value) {
  const encoded = String(value || "").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length < 40 || bytes.toString("base64") !== encoded) return null;
    const key = crypto.createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}

function decodePublicKey(value) {
  const encoded = String(value || "").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length < 40 || bytes.toString("base64") !== encoded) return null;
    const key = crypto.createPublicKey({ key: bytes, format: "der", type: "spki" });
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}

function keyPairMatches(privateKey, publicKey) {
  try {
    const challenge = Buffer.from("smejj.com-training-evidence-key-check-v1", "utf8");
    return crypto.verify(null, challenge, publicKey, crypto.sign(null, challenge, privateKey));
  } catch {
    return false;
  }
}

function assertReady(config) {
  if (!config?.ready || !signingKeys.has(config) || !config.publicKey || config.algorithm !== "Ed25519") {
    throw new Error("training_evidence_config_invalid");
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
