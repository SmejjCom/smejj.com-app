import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  isVerifiedTrainingPersistenceReceipt,
  trainingPersistenceReceiptReference,
  trainingRecordProofConfig,
  trainingRecordProofVerifierConfig,
  verifyTrainingPersistenceReadback
} from "../src/training/persistence.js";
import { canonicalJson } from "../src/training/sanitize.js";

const RECORD_PROOF_KEYS = crypto.generateKeyPairSync("ed25519");
const RECORD_PROOF_ENV = Object.freeze({
  SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID: "test-record-proof-v1",
  SMEJJ_TRAINING_RECORD_PROOF_PRIVATE_KEY_B64: RECORD_PROOF_KEYS.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_RECORD_PROOF_PUBLIC_KEY_B64: RECORD_PROOF_KEYS.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: "test-evidence-v1",
  SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "test-encryption-v1",
  SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "test-fingerprint-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "test-consent-sign-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "test-consent-bind-v1"
});
const RECORD_PROOF_SIGNER = trainingRecordProofConfig(RECORD_PROOF_ENV);
const RECORD_PROOF_VERIFIER = trainingRecordProofVerifierConfig(RECORD_PROOF_ENV);

test("a dataset authority receipt requires two read-back verified immutable writes", async () => {
  const plan = examplePlan();
  const descriptor = descriptorFor(plan);
  const bodies = new Map(plan.objects.map((object) => [object.key, object.body]));
  const getObject = async ({ key }) => ({ status: 200, contentVerified: true, body: bodies.get(key) });
  await assert.rejects(
    () => verifyTrainingPersistenceReadback(descriptor, { getObject, proveObject: immutableProof }),
    /training_record_proof_signing_config_invalid/
  );
  const receipt = await verifyTrainingPersistenceReadback(descriptor, {
    getObject,
    proveObject: immutableProof,
    signingConfig: RECORD_PROOF_SIGNER
  });
  assert.equal(isVerifiedTrainingPersistenceReceipt(receipt, exampleRecord(), RECORD_PROOF_VERIFIER), true);
  assert.match(receipt.proofSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(receipt), true);
  assert.match(
    trainingPersistenceReceiptReference(receipt, exampleRecord(), RECORD_PROOF_VERIFIER).proofSha256,
    /^[a-f0-9]{64}$/
  );

  await assert.rejects(() => verifyTrainingPersistenceReadback(descriptor, {
    getObject,
    proveObject: async (object) => ({ ...immutableProof(object), contentVerified: false }),
    signingConfig: RECORD_PROOF_SIGNER
  }), /training_persistence_condition_proof_invalid/);
});

test("restart reconstruction reads and verifies both exact object digests", async () => {
  const plan = examplePlan();
  const descriptor = descriptorFor(plan);
  const bodies = new Map(plan.objects.map((object) => [object.key, object.body]));
  await assert.rejects(() => verifyTrainingPersistenceReadback(descriptor, {
    getObject: async ({ key }) => ({ status: 200, contentVerified: true, body: bodies.get(key) })
  }), /training_persistence_condition_prover_required/);
  const receipt = await verifyTrainingPersistenceReadback(descriptor, {
    getObject: async ({ key }) => ({ status: 200, contentVerified: true, body: bodies.get(key) }),
    proveObject: immutableProof,
    signingConfig: RECORD_PROOF_SIGNER
  });
  assert.equal(isVerifiedTrainingPersistenceReceipt(receipt, exampleRecord(), RECORD_PROOF_VERIFIER), true);

  await assert.rejects(() => verifyTrainingPersistenceReadback(descriptor, {
    getObject: async ({ key }) => ({
      status: 200,
      contentVerified: true,
      body: key === descriptor.statusKey ? `${bodies.get(key)}corrupt` : bodies.get(key)
    }),
    proveObject: immutableProof
  }), /training_persistence_readback_digest_mismatch/);
});

test("unsigned receipts and cross-record substitution never authorize a dataset", async () => {
  const plan = examplePlan();
  const descriptor = descriptorFor(plan);
  const bodies = new Map(plan.objects.map((object) => [object.key, object.body]));
  const receipt = await verifyTrainingPersistenceReadback(descriptor, {
    getObject: async ({ key }) => ({ status: 200, contentVerified: true, body: bodies.get(key) }),
    proveObject: immutableProof,
    signingConfig: RECORD_PROOF_SIGNER
  });
  const serializedReceipt = JSON.parse(JSON.stringify(receipt));
  assert.equal(isVerifiedTrainingPersistenceReceipt(serializedReceipt, exampleRecord(), RECORD_PROOF_VERIFIER), true);
  delete serializedReceipt.proofSignature;
  assert.equal(isVerifiedTrainingPersistenceReceipt(serializedReceipt, exampleRecord(), RECORD_PROOF_VERIFIER), false);
  assert.equal(isVerifiedTrainingPersistenceReceipt(
    receipt,
    { ...exampleRecord(), payloadFingerprint: "0".repeat(64) },
    RECORD_PROOF_VERIFIER
  ), false);
});

function examplePlan() {
  const root = "training/sanitized/candidates/2026/07/ca/candidate-safe-0001/";
  const verificationEvidence = exampleEvidence();
  const record = object(`${root}record.json.enc`, JSON.stringify({ encrypted: true }), false);
  const status = object(`${root}status.json`, JSON.stringify({
    schemaVersion: 1,
    recordId: "candidate-safe-0001",
    targetModelId: "smejj-1-0",
    state: "candidate",
    eligible: true,
    encryptedRecordKey: record.key,
    payloadFingerprint: "a".repeat(64),
    familyFingerprint: "b".repeat(64),
    split: "train",
    domain: "coding",
    encryption: { algorithm: "AES-256-GCM", keyId: "test-encryption-v1" },
    consentLedgerDigest: "c".repeat(64),
    verificationEvidenceId: verificationEvidence.evidenceId,
    verificationEvidenceKey: `training/evidence/v1/${verificationEvidence.subjectRef}/${verificationEvidence.repositoryRef}/${crypto.createHash("sha256").update(verificationEvidence.evidenceId).digest("hex")}.json`,
    verificationEvidenceSha256: crypto.createHash("sha256").update(canonicalJson(verificationEvidence)).digest("hex"),
    taskCapsuleKey: verificationEvidence.sourceProof.taskCapsuleKey,
    taskCapsuleSha256: verificationEvidence.sourceProof.taskCapsuleSha256
  }), true);
  return { ok: true, immutable: true, statusKey: status.key, objects: [record, status] };
}

function immutableProof(object) {
  return {
    created: true,
    createdNow: false,
    idempotent: true,
    conditionEnforced: true,
    contentVerified: true,
    putStatus: 412,
    sizeBytes: object.sizeBytes,
    sha256: object.sha256
  };
}

function descriptorFor(plan) {
  return {
    recordKey: plan.objects[0].key,
    recordSizeBytes: plan.objects[0].sizeBytes,
    recordSha256: plan.objects[0].sha256,
    statusKey: plan.objects[1].key,
    statusSizeBytes: plan.objects[1].sizeBytes,
    statusSha256: plan.objects[1].sha256
  };
}

function exampleRecord() {
  return {
    recordId: "candidate-safe-0001",
    targetModelId: "smejj-1-0",
    payloadFingerprint: "a".repeat(64),
    familyFingerprint: "b".repeat(64),
    split: "train",
    domain: "coding",
    training: { state: "candidate", eligible: true },
    encryption: { algorithm: "AES-256-GCM", keyId: "test-encryption-v1" },
    consentDecision: { ledgerDigest: "c".repeat(64) },
    verificationEvidence: exampleEvidence()
  };
}

function exampleEvidence() {
  return {
    evidenceId: "training-evidence:demo-v1",
    subjectRef: `sub_${"9".repeat(64)}`,
    repositoryRef: `repo_${"8".repeat(64)}`,
    sourceProof: {
      taskCapsuleKey: "jobs/task-demo-0001/task-capsule.json",
      taskCapsuleSha256: "e".repeat(64)
    }
  };
}

function object(key, body, statusLast) {
  const normalized = `${body}\n`;
  return {
    key,
    body: normalized,
    statusLast,
    ifNoneMatch: "*",
    conditionRequired: true,
    sizeBytes: Buffer.byteLength(normalized, "utf8"),
    sha256: crypto.createHash("sha256").update(normalized).digest("hex")
  };
}
