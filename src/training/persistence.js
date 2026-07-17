import crypto from "node:crypto";
import { canonicalJson } from "./sanitize.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const KEY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const KEY_PATTERN = /^training\/(?:sanitized\/candidates|quarantine)\/\d{4}\/\d{2}\/[a-z0-9]{2}\/[a-z0-9][a-z0-9._-]{7,120}\/(?:record\.json\.enc|status\.json)$/;

export function trainingRecordProofConfig(env = process.env) {
  const keyId = safeKeyId(env.SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID);
  const privateKey = decodePrivateKey(env.SMEJJ_TRAINING_RECORD_PROOF_PRIVATE_KEY_B64);
  const publicKey = decodePublicKey(env.SMEJJ_TRAINING_RECORD_PROOF_PUBLIC_KEY_B64);
  const otherKeyIds = [
    env.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID,
    env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID
  ].map(safeKeyId).filter(Boolean);
  const ready = Boolean(privateKey && publicKey && keyId && otherKeyIds.length === 5 &&
    new Set([keyId, ...otherKeyIds]).size === 6 && keyPairMatches(privateKey, publicKey));
  const publicBytes = ready ? publicKey.export({ format: "der", type: "spki" }) : null;
  return Object.freeze({
    ready,
    keyId: ready ? keyId : "",
    privateKey: ready ? privateKey : null,
    publicKey: ready ? publicKey : null,
    publicKeySha256: publicBytes ? sha256(publicBytes) : "",
    algorithm: "Ed25519"
  });
}

export function trainingRecordProofVerifierConfig(env = process.env) {
  const keyId = safeKeyId(env.SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID);
  const publicKey = decodePublicKey(env.SMEJJ_TRAINING_RECORD_PROOF_PUBLIC_KEY_B64);
  const peerIds = [
    env.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID,
    env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID,
    env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID
  ].map(safeKeyId).filter(Boolean);
  const ready = Boolean(keyId && publicKey && peerIds.length === 5 && new Set([keyId, ...peerIds]).size === 6);
  const publicBytes = ready ? publicKey.export({ format: "der", type: "spki" }) : null;
  return Object.freeze({
    ready,
    keyId: ready ? keyId : "",
    publicKey: ready ? publicKey : null,
    publicKeySha256: publicBytes ? sha256(publicBytes) : "",
    algorithm: "Ed25519"
  });
}

/** Reconstructs authority after a process restart only through bounded byte readback. */
export async function verifyTrainingPersistenceReadback(descriptor, { getObject, proveObject, signingConfig } = {}) {
  if (typeof getObject !== "function") throw new Error("training_persistence_reader_required");
  if (typeof proveObject !== "function") throw new Error("training_persistence_condition_prover_required");
  const expected = normalizeDescriptor(descriptor);
  const recordResult = await safeRead(getObject, {
    key: expected.recordKey,
    sizeBytes: expected.recordSizeBytes,
    sha256: expected.recordSha256
  });
  const statusResult = await safeRead(getObject, {
    key: expected.statusKey,
    sizeBytes: expected.statusSizeBytes,
    sha256: expected.statusSha256
  });
  const record = objectFromRead(expected.recordKey, expected.recordSha256, expected.recordSizeBytes, recordResult, false);
  const status = objectFromRead(expected.statusKey, expected.statusSha256, expected.statusSizeBytes, statusResult, true);
  await proveExistingObject(proveObject, record);
  await proveExistingObject(proveObject, status);
  return signedReceipt(validatePlanPair({ ok: true, statusKey: status.key, objects: [record, status] }), signingConfig);
}

export function isVerifiedTrainingPersistenceReceipt(receipt, record, verifierConfig) {
  if (!verifyReceiptSignature(receipt, verifierConfig)) return false;
  const evidenceIdDigest = sha256(String(record?.verificationEvidence?.evidenceId || ""));
  const expectedEvidenceKey = `training/evidence/v1/${record?.verificationEvidence?.subjectRef}/${record?.verificationEvidence?.repositoryRef}/${evidenceIdDigest}.json`;
  return Boolean(
    receipt.recordId === record?.recordId &&
    receipt.targetModelId === record?.targetModelId &&
    receipt.trainingState === record?.training?.state &&
    receipt.trainingEligible === record?.training?.eligible &&
    receipt.payloadFingerprint === record?.payloadFingerprint &&
    receipt.familyFingerprint === record?.familyFingerprint &&
    receipt.split === record?.split &&
    receipt.domain === record?.domain &&
    String(receipt.encryptionAlgorithm).toLowerCase() === String(record?.encryption?.algorithm).toLowerCase() &&
    receipt.encryptionKeyId === record?.encryption?.keyId &&
    receipt.consentLedgerDigest === record?.consentDecision?.ledgerDigest &&
    receipt.verificationEvidenceId === record?.verificationEvidence?.evidenceId &&
    receipt.verificationEvidenceKey === expectedEvidenceKey &&
    receipt.verificationEvidenceSha256 === sha256(canonicalJson(record?.verificationEvidence)) &&
    receipt.taskCapsuleKey === record?.verificationEvidence?.sourceProof?.taskCapsuleKey &&
    receipt.taskCapsuleSha256 === record?.verificationEvidence?.sourceProof?.taskCapsuleSha256
  );
}

export function trainingPersistenceReceiptReference(receipt, record, verifierConfig) {
  if (!isVerifiedTrainingPersistenceReceipt(receipt, record, verifierConfig)) return null;
  return deepFreeze(structuredClone(receipt));
}

function validatePlanPair(plan) {
  if (!plan?.ok || !Array.isArray(plan.objects) || plan.objects.length !== 2) {
    throw new Error("training_persistence_plan_invalid");
  }
  const [record, status] = plan.objects;
  if (!validObject(record, false) || !validObject(status, true) || plan.statusKey !== status.key) {
    throw new Error("training_persistence_object_contract_invalid");
  }
  const root = record.key.slice(0, -"record.json.enc".length);
  if (status.key !== `${root}status.json`) throw new Error("training_persistence_object_scope_mismatch");
  let metadata;
  try {
    metadata = JSON.parse(status.body);
  } catch {
    throw new Error("training_persistence_status_invalid");
  }
  if (metadata.encryptedRecordKey !== record.key || !safeRecordMetadata(metadata)) {
    throw new Error("training_persistence_status_binding_invalid");
  }
  return { record, status, metadata };
}

function signedReceipt({ record, status, metadata }, config) {
  assertSigningConfig(config);
  const base = {
    schemaVersion: 1,
    recordId: metadata.recordId,
    targetModelId: metadata.targetModelId,
    trainingState: metadata.state,
    trainingEligible: metadata.eligible,
    recordKey: record.key,
    recordSizeBytes: record.sizeBytes,
    recordSha256: record.sha256,
    statusKey: status.key,
    statusSizeBytes: status.sizeBytes,
    statusSha256: status.sha256,
    payloadFingerprint: metadata.payloadFingerprint,
    familyFingerprint: metadata.familyFingerprint,
    split: metadata.split,
    domain: metadata.domain,
    encryptionAlgorithm: metadata.encryption.algorithm,
    encryptionKeyId: metadata.encryption.keyId,
    consentLedgerDigest: metadata.consentLedgerDigest,
    verificationEvidenceId: metadata.verificationEvidenceId,
    verificationEvidenceKey: metadata.verificationEvidenceKey,
    verificationEvidenceSha256: metadata.verificationEvidenceSha256,
    taskCapsuleKey: metadata.taskCapsuleKey,
    taskCapsuleSha256: metadata.taskCapsuleSha256,
    immutableReadbackVerified: true,
    proofSigningKeyId: config.keyId,
    proofPublicKeySha256: config.publicKeySha256
  };
  const signed = { ...base, proofSha256: sha256(canonicalJson(base)) };
  const proofSignature = crypto.sign(
    null,
    Buffer.from(canonicalJson(signed), "utf8"),
    config.privateKey
  ).toString("base64url");
  return deepFreeze({ ...signed, proofSignature });
}

function verifyReceiptSignature(receipt, config) {
  if (!config?.ready || config.algorithm !== "Ed25519" || !config.publicKey ||
      receipt?.proofSigningKeyId !== config.keyId || receipt?.proofPublicKeySha256 !== config.publicKeySha256 ||
      !HASH_PATTERN.test(String(receipt?.proofSha256 || "")) ||
      !SIGNATURE_PATTERN.test(String(receipt?.proofSignature || ""))) return false;
  const signed = { ...receipt };
  delete signed.proofSignature;
  const base = { ...signed };
  delete base.proofSha256;
  if (sha256(canonicalJson(base)) !== receipt.proofSha256) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalJson(signed), "utf8"),
      config.publicKey,
      Buffer.from(receipt.proofSignature, "base64url")
    );
  } catch {
    return false;
  }
}

function validObject(object, statusLast) {
  return Boolean(
    object && KEY_PATTERN.test(String(object.key || "")) &&
    object.statusLast === statusLast && object.ifNoneMatch === "*" && object.conditionRequired === true &&
    typeof object.body === "string" && Number.isSafeInteger(object.sizeBytes) && object.sizeBytes > 0 &&
    object.sizeBytes === Buffer.byteLength(object.body, "utf8") && HASH_PATTERN.test(String(object.sha256 || "")) &&
    object.sha256 === sha256(object.body)
  );
}

function safeRecordMetadata(value) {
  return Boolean(
    /^[a-z0-9][a-z0-9._-]{7,120}$/.test(String(value.recordId || "")) &&
    value.targetModelId === "smejj-1-0" &&
    ["denied", "quarantined", "candidate", "promoted", "revoked"].includes(value.state) &&
    typeof value.eligible === "boolean" &&
    HASH_PATTERN.test(String(value.payloadFingerprint || "")) && HASH_PATTERN.test(String(value.familyFingerprint || "")) &&
    ["train", "validation", "test"].includes(value.split) && typeof value.domain === "string" && value.domain.length > 0 &&
    value.encryption?.algorithm === "AES-256-GCM" && KEY_ID_PATTERN.test(String(value.encryption?.keyId || "")) &&
    HASH_PATTERN.test(String(value.consentLedgerDigest || "")) &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{5,240}$/.test(String(value.verificationEvidenceId || "")) &&
    /^training\/evidence\/v1\/sub_[a-f0-9]{64}\/repo_[a-f0-9]{64}\/[a-f0-9]{64}\.json$/.test(String(value.verificationEvidenceKey || "")) &&
    HASH_PATTERN.test(String(value.verificationEvidenceSha256 || "")) &&
    /^jobs\/[a-zA-Z0-9][a-zA-Z0-9._-]{7,120}\/task-capsule\.json$/.test(String(value.taskCapsuleKey || "")) &&
    HASH_PATTERN.test(String(value.taskCapsuleSha256 || ""))
  );
}

function normalizeDescriptor(value = {}) {
  const descriptor = {
    recordKey: String(value.recordKey || ""),
    recordSizeBytes: Number(value.recordSizeBytes),
    recordSha256: String(value.recordSha256 || ""),
    statusKey: String(value.statusKey || ""),
    statusSizeBytes: Number(value.statusSizeBytes),
    statusSha256: String(value.statusSha256 || "")
  };
  if (!KEY_PATTERN.test(descriptor.recordKey) || !descriptor.recordKey.endsWith("/record.json.enc") ||
      !KEY_PATTERN.test(descriptor.statusKey) || !descriptor.statusKey.endsWith("/status.json") ||
      descriptor.statusKey !== `${descriptor.recordKey.slice(0, -"record.json.enc".length)}status.json` ||
      !HASH_PATTERN.test(descriptor.recordSha256) || !HASH_PATTERN.test(descriptor.statusSha256) ||
      !Number.isSafeInteger(descriptor.recordSizeBytes) || descriptor.recordSizeBytes < 1 ||
      !Number.isSafeInteger(descriptor.statusSizeBytes) || descriptor.statusSizeBytes < 1) {
    throw new Error("training_persistence_descriptor_invalid");
  }
  return descriptor;
}

async function safeRead(getObject, descriptor) {
  let result;
  try {
    result = await getObject(descriptor);
  } catch {
    throw new Error("training_persistence_readback_failed");
  }
  if (result?.status !== 200 || result?.contentVerified !== true || result.body === undefined) {
    throw new Error("training_persistence_readback_not_verified");
  }
  return result;
}

function objectFromRead(key, expectedSha, expectedSize, result, statusLast) {
  const bytes = Buffer.isBuffer(result.body) ? result.body : Buffer.from(String(result.body), "utf8");
  if (bytes.length !== expectedSize || sha256(bytes) !== expectedSha) {
    throw new Error("training_persistence_readback_digest_mismatch");
  }
  return {
    key,
    body: bytes.toString("utf8"),
    sizeBytes: bytes.length,
    sha256: expectedSha,
    statusLast,
    contentType: "application/json; charset=utf-8",
    ifNoneMatch: "*",
    conditionRequired: true
  };
}

async function proveExistingObject(proveObject, object) {
  let proof;
  try {
    proof = await proveObject(object);
  } catch {
    throw new Error("training_persistence_condition_proof_failed");
  }
  if (proof?.created !== true || proof?.createdNow !== false || proof?.idempotent !== true ||
      proof?.conditionEnforced !== true || proof?.contentVerified !== true || proof?.putStatus !== 412 ||
      proof?.sizeBytes !== object.sizeBytes || proof?.sha256 !== object.sha256) {
    throw new Error("training_persistence_condition_proof_invalid");
  }
}

function assertSigningConfig(config) {
  if (!config?.ready || config.algorithm !== "Ed25519" || !config.privateKey || !config.publicKey ||
      !KEY_ID_PATTERN.test(String(config.keyId || "")) || !HASH_PATTERN.test(String(config.publicKeySha256 || ""))) {
    throw new Error("training_record_proof_signing_config_invalid");
  }
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
    const challenge = Buffer.from("smejj.com-training-record-proof-key-check-v1", "utf8");
    return crypto.verify(null, challenge, publicKey, crypto.sign(null, challenge, privateKey));
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
