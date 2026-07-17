import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  buildDatasetVersionManifest,
  buildTrainingCandidateWritePlan,
  prepareTrainingCandidate,
  writeTrainingCandidateToIdrive
} from "../src/training/pipeline.js";
import { decryptTrainingRecord } from "../src/training/encryption.js";
import {
  trainingEvidenceConfig,
  trainingEvidenceVerifierConfig
} from "../src/training/evidence.js";
import {
  trainingRecordProofConfig,
  verifyTrainingPersistenceReadback
} from "../src/training/persistence.js";
import {
  bindConsentScope,
  consentDecision,
  createConsentGrant,
  createConsentRevocation,
  trainingConsentConfig
} from "../src/training/consent.js";
import { canonicalJson, sanitizeTrainingValue } from "../src/training/sanitize.js";
import { assertNoDatasetLeakage } from "../src/training/split.js";
import { readJson, validateSchema } from "../scripts/validation-utils.mjs";
import { signTestTrainingEvidence } from "./helpers/training-evidence-fixture.mjs";

const ENCRYPTION_KEY = Buffer.alloc(32, 7);
const FINGERPRINT_KEY = Buffer.alloc(32, 9);
const CONSENT_SIGNING_KEY = Buffer.alloc(32, 17);
const CONSENT_BINDING_KEY = Buffer.alloc(32, 29);
const EVIDENCE_KEYS = crypto.generateKeyPairSync("ed25519");
const RECORD_PROOF_KEYS = crypto.generateKeyPairSync("ed25519");
const CONSENT_NOTICE_HASH = "a".repeat(64);
const CONSENT_SUBJECT = "user:training-pipeline-test";
const CONSENT_REPOSITORY = "smejjcom/training-pipeline-test";
const CONSENT_NOW = "2026-07-10T12:00:00.000Z";
const CONSENT_CONFIG = trainingConsentConfig({
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: CONSENT_NOTICE_HASH,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: CONSENT_SIGNING_KEY.toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: CONSENT_BINDING_KEY.toString("base64")
});
const SECURE_ENV = {
  SMEJJ_TRAINING_CAPTURE_ENABLED: "YES",
  SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "training-key-v1",
  SMEJJ_TRAINING_ENCRYPTION_KEY_B64: ENCRYPTION_KEY.toString("base64"),
  SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "fingerprint-key-v1",
  SMEJJ_TRAINING_FINGERPRINT_KEY_B64: FINGERPRINT_KEY.toString("base64"),
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: "training-evidence-v1",
  SMEJJ_TRAINING_EVIDENCE_PRIVATE_KEY_B64: EVIDENCE_KEYS.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64: EVIDENCE_KEYS.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID: "training-record-proof-v1",
  SMEJJ_TRAINING_RECORD_PROOF_PRIVATE_KEY_B64: RECORD_PROOF_KEYS.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_RECORD_PROOF_PUBLIC_KEY_B64: RECORD_PROOF_KEYS.publicKey.export({ format: "der", type: "spki" }).toString("base64")
};
const EVIDENCE_CONFIG = trainingEvidenceConfig(SECURE_ENV);
const EVIDENCE_VERIFIER = trainingEvidenceVerifierConfig(SECURE_ENV);
const RECORD_PROOF_SIGNER = trainingRecordProofConfig(SECURE_ENV);

const RIGHTS_LEDGER = JSON.parse(await readFile(
  new URL("../idrive-layout/manifests/training/provider-rights.json", import.meta.url),
  "utf8"
));

test("sanitizer removes secrets, direct identifiers, private paths and browser captures before persistence", () => {
  const rawSecret = "ghp_exampletokenvalue1234567890";
  const secretObjectKey = "ghp_objectkeyvalue1234567890123456";
  const result = sanitizeTrainingValue({
    task: `Contact coder@example.com with ${rawSecret}`,
    apiKey: "top-secret-value",
    clientSecret: "lowercaseonlysecretvalue",
    serviceAccessToken: "anotherlowercasecredential",
    firstName: "Private Person",
    [secretObjectKey]: "object-key-secret",
    file: "/Users/private/person/project/index.js",
    Screenshots: ["data:image/png;base64,private"],
    packageToken: "npm_abcdefghijklmnopqrstuvwxyz123456",
    remote: "https://operator:super-secret-password@example.invalid/repo.git",
    nested: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" },
    opaqueCredential: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
  });
  const serialized = JSON.stringify(result.value);
  assert.equal(result.passed, true);
  assert.doesNotMatch(serialized, /coder@example\.com/);
  assert.doesNotMatch(serialized, /ghp_exampletoken/);
  assert.doesNotMatch(serialized, /\/Users\/private/);
  assert.doesNotMatch(serialized, /data:image/);
  assert.doesNotMatch(serialized, /npm_abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(serialized, /super-secret-password/);
  assert.doesNotMatch(serialized, /AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/);
  assert.doesNotMatch(serialized, /lowercaseonlysecretvalue|anotherlowercasecredential|Private Person/);
  assert.equal(Object.hasOwn(result.value, "clientSecret"), false);
  assert.equal(Object.hasOwn(result.value, "serviceAccessToken"), false);
  assert.equal(Object.hasOwn(result.value, "firstName"), false);
  assert.ok(Object.values(result.value).filter((value) => value === "[REDACTED_SECRET_FIELD]").length >= 3);
  assert.ok(Object.values(result.value).includes("[REDACTED_PERSONAL_FIELD]"));
  assert.equal(Object.hasOwn(result.value, secretObjectKey), false);
  assert.ok(Object.keys(result.value).some((key) => key.startsWith("_redacted_key_")));
  assert.match(serialized, /REDACTED/);
  assert.ok(result.findings.some((finding) => finding.type === "excluded_artifact"));
  assert.ok(result.findings.every((finding) => !Object.hasOwn(finding, "value")));
  assert.doesNotMatch(JSON.stringify(result.findings), new RegExp(secretObjectKey));
});

test("capture defaults off and produces no durable training objects", () => {
  const decision = grantedConsentDecision();
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: {},
    candidateId: "candidate-off-0001",
    consentDecision: decision
  });
  assert.equal(candidate.training.eligible, false);
  assert.deepEqual(candidate.training.reasons, ["training_capture_disabled"]);
  const plan = buildTrainingCandidateWritePlan(candidate, { env: {}, consentDecision: decision });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.objects, []);
});

test("prepared candidates are deeply immutable before the write-plan boundary", () => {
  const decision = grantedConsentDecision(CONSENT_NOW);
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    now: CONSENT_NOW,
    candidateId: "candidate-immutable-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.payload), true);
  assert.equal(Object.isFrozen(candidate.provenance.sources), true);
  assert.equal(Object.isFrozen(candidate.sanitization.findings), true);
  assert.throws(() => { candidate.payload.task = "mutated after verification"; }, TypeError);
  assert.equal(candidate.payload.task, "Fix the first-party bug safely");
});

test("write planning rejects mutable, unsanitized and fingerprint-mutated candidate copies", () => {
  const decision = grantedConsentDecision(CONSENT_NOW);
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    now: CONSENT_NOW,
    candidateId: "candidate-revalidation-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });

  const mutable = structuredClone(candidate);
  assert.equal(buildTrainingCandidateWritePlan(mutable, {
    env: SECURE_ENV,
    now: CONSENT_NOW,
    consentDecision: decision
  }).reason, "candidate_not_immutable");

  const secretMutation = structuredClone(candidate);
  secretMutation.payload.clientSecret = "lowercaseonlysecretvalue";
  deepFreezeFixture(secretMutation);
  assert.equal(buildTrainingCandidateWritePlan(secretMutation, {
    env: SECURE_ENV,
    now: CONSENT_NOW,
    consentDecision: decision
  }).reason, "candidate_sanitization_revalidation_failed");

  const payloadMutation = structuredClone(candidate);
  payloadMutation.payload.task = "A different but syntactically safe task";
  deepFreezeFixture(payloadMutation);
  assert.equal(buildTrainingCandidateWritePlan(payloadMutation, {
    env: SECURE_ENV,
    now: CONSENT_NOW,
    consentDecision: decision
  }).reason, "task_evidence_not_current");

  const familyMutation = structuredClone(candidate);
  familyMutation.provenance.baseCommit = "different-base-commit";
  deepFreezeFixture(familyMutation);
  assert.equal(buildTrainingCandidateWritePlan(familyMutation, {
    env: SECURE_ENV,
    now: CONSENT_NOW,
    consentDecision: decision
  }).reason, "task_evidence_claims_mismatch");
});

test("capture cannot persist with encryption alone when keyed fingerprints are unavailable", () => {
  const env = {
    ...SECURE_ENV,
    SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "training-key-v1",
    SMEJJ_TRAINING_ENCRYPTION_KEY_B64: ENCRYPTION_KEY.toString("base64"),
    SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "fingerprint-key-v1",
    SMEJJ_TRAINING_FINGERPRINT_KEY_B64: ""
  };
  const decision = grantedConsentDecision();
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env,
    candidateId: "candidate-no-fingerprint-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  const plan = buildTrainingCandidateWritePlan(candidate, { env, consentDecision: decision });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "training_fingerprint_not_ready");
  assert.deepEqual(plan.objects, []);
});

test("Z.ai and Kimi API derivatives are transitively denied even after technical success", () => {
  for (const rightsId of ["zai-api-glm-5-2-2026-04-14", "moonshot-api-kimi-k2-7-2026-05-27"]) {
    const decision = grantedConsentDecision();
    const fixture = eligibleFixture();
    fixture.provenance.sources = [{ kind: "api-model-output", rightsId, artifactRevision: "served-model-2026-07-10" }];
    fixture.labels.sources = ["human", "deterministic-tests"];
    const candidate = prepareTrainingCandidate(fixture, {
      rightsLedger: RIGHTS_LEDGER,
      env: SECURE_ENV,
      candidateId: `candidate-denied-${rightsId.startsWith("zai") ? "zai" : "kimi"}`,
      consentDecision: decision,
      verificationEvidence: trainingEvidenceFor(decision, fixture)
    });
    assert.equal(candidate.training.eligible, false);
    assert.equal(candidate.training.state, "denied");
    assert.ok(candidate.training.reasons.includes("provider_training_use_denied"));
    assert.ok(candidate.training.reasons.includes("provider_derivatives_denied"));
    assert.equal(candidate.split, null);
    const plan = buildTrainingCandidateWritePlan(candidate, { env: SECURE_ENV, consentDecision: decision });
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "permanent_training_denial");
    assert.deepEqual(plan.objects, []);
  }
});

test("a test-only provider permission applies only to its exact reviewed artifact revision", () => {
  const decision = grantedConsentDecision();
  const ledger = structuredClone(RIGHTS_LEDGER);
  ledger.entries.push({
    id: "test-only-provider-permission",
    sourceType: "open-weights",
    provider: "test-fixture",
    trainingUse: "allowed",
    derivativeTrainingUse: "allowed",
    permissionStatus: "verified",
    permissionId: "permission:test-only-v1",
    artifactRevision: "revision-reviewed-001",
    expiresAt: "2099-01-01T00:00:00Z"
  });
  const fixture = eligibleFixture();
  fixture.provenance.sources = [{
    kind: "open-weights-derived",
    rightsId: "test-only-provider-permission",
    artifactRevision: "revision-other-002"
  }];
  const candidate = prepareTrainingCandidate(fixture, {
    rightsLedger: ledger,
    env: SECURE_ENV,
    candidateId: "candidate-revision-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision, fixture)
  });
  assert.equal(candidate.training.eligible, false);
  assert.ok(candidate.training.reasons.includes("source_revision_not_authorized"));
});

test("raw first-party quality claims cannot replace signed immutable evidence", () => {
  const decision = grantedConsentDecision();
  const incomplete = eligibleFixture();
  incomplete.quality.lint = "skipped";
  const candidate = prepareTrainingCandidate(incomplete, {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-quality-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision, incomplete)
  });
  assert.equal(candidate.training.eligible, false);
  assert.ok(candidate.training.reasons.includes("task_evidence_not_verified"));
  assert.equal(candidate.quality.lint, undefined);
  assert.equal(candidate.training.state, "denied");
});

test("withdrawn consent produces a revoked record and no persistence plan", () => {
  const fixture = eligibleFixture();
  const decision = revokedConsentDecision();
  const candidate = prepareTrainingCandidate(fixture, {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-revoked-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision, fixture)
  });
  assert.equal(candidate.training.eligible, false);
  assert.equal(candidate.training.state, "revoked");
  assert.ok(candidate.training.reasons.includes("consent_revoked"));
  const plan = buildTrainingCandidateWritePlan(candidate, { env: SECURE_ENV, consentDecision: decision });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.objects, []);
});

test("eligible candidates are family-split, encrypted and written append-only with status last", async () => {
  const candidateNow = "2026-07-10T13:00:00.000Z";
  const decision = grantedConsentDecision(candidateNow);
  const fixture = eligibleFixture();
  fixture.provenance.auditNote = "Bearer abcdefghijklmnopqrstuvwxyz987654";
  fixture.consent.contactNote = "private.person@example.com";
  const candidate = prepareTrainingCandidate(fixture, {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    now: candidateNow,
    candidateId: "candidate-safe-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision, fixture)
  });
  assert.equal(candidate.training.eligible, true);
  assert.equal(Object.hasOwn(candidate, "consent"), false);
  assert.equal(candidate.consentDecision.status, "granted");
  assert.match(candidate.recordId, /^candidate-[a-f0-9]{48}$/);
  assert.match(candidate.familyFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(["train", "validation", "test"].includes(candidate.split));
  const plan = buildTrainingCandidateWritePlan(candidate, {
    env: SECURE_ENV,
    now: "2026-07-10T13:01:00Z",
    randomBytes: () => Buffer.alloc(12, 3),
    consentDecision: decision
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.objects.length, 2);
  assert.equal(plan.objects[0].statusLast, false);
  assert.equal(plan.objects[1].statusLast, true);
  assert.ok(plan.objects.every((object) => object.ifNoneMatch === "*" && object.conditionRequired));
  assert.doesNotMatch(JSON.stringify(plan), /Fix the first-party bug safely/);
  const envelope = JSON.parse(plan.objects[0].body);
  const decrypted = decryptTrainingRecord(envelope, ENCRYPTION_KEY);
  assert.equal(decrypted.recordId, candidate.recordId);
  assert.equal(decrypted.payload.task, "Fix the first-party bug safely");
  assert.doesNotMatch(JSON.stringify(decrypted), /abcdefghijklmnopqrstuvwxyz987654/);
  assert.doesNotMatch(JSON.stringify(decrypted), /private\.person@example\.com/);

  await assert.rejects(() => writeTrainingCandidateToIdrive(plan, {
    putObject: async () => ({ created: true, conditionEnforced: false, proofStatus: 412 }),
    resolveConsentDecision: async () => grantedConsentDecision("2026-07-10T13:01:00.000Z", candidateNow),
    resolveVerificationEvidence: async () => candidate.verificationEvidence,
    evidenceConfig: EVIDENCE_VERIFIER,
    recordProofSigningConfig: RECORD_PROOF_SIGNER,
    now: "2026-07-10T13:01:00.000Z"
  }), /training_immutable_write_not_proven/);

  await assert.rejects(() => writeTrainingCandidateToIdrive({
    ...plan,
    objects: [...plan.objects].reverse()
  }, {
    putObject: async () => ({ created: true, conditionEnforced: true, contentVerified: true, proofStatus: 412 }),
    resolveConsentDecision: async () => decision,
    resolveVerificationEvidence: async () => candidate.verificationEvidence,
    evidenceConfig: EVIDENCE_VERIFIER,
    now: candidateNow
  }), /training_status_must_be_written_last/);

  const seen = [];
  const result = await writeTrainingCandidateToIdrive(plan, {
    putObject: async (object) => {
      seen.push(object.key);
      return { created: true, conditionEnforced: true, contentVerified: true, proofStatus: 412 };
    },
    resolveConsentDecision: async () => grantedConsentDecision("2026-07-10T13:01:00.000Z", candidateNow),
    resolveVerificationEvidence: async () => candidate.verificationEvidence,
    evidenceConfig: EVIDENCE_VERIFIER,
    recordProofSigningConfig: RECORD_PROOF_SIGNER,
    now: "2026-07-10T13:01:00.000Z"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, plan.objects.map((object) => object.key));
  assert.equal(seen.at(-1), plan.statusKey);
});

test("AES-GCM envelope rejects tampering", () => {
  const decision = grantedConsentDecision();
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-tamper-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  const plan = buildTrainingCandidateWritePlan(candidate, {
    env: SECURE_ENV,
    randomBytes: () => Buffer.alloc(12, 4),
    consentDecision: decision
  });
  const envelope = JSON.parse(plan.objects[0].body);
  const bytes = Buffer.from(envelope.ciphertext, "base64");
  bytes[0] ^= 1;
  envelope.ciphertext = bytes.toString("base64");
  assert.throws(() => decryptTrainingRecord(envelope, ENCRYPTION_KEY));
});

test("encryption and fingerprint keys must be distinct and strictly encoded", () => {
  const decision = grantedConsentDecision();
  const sharedKeyEnv = {
    ...SECURE_ENV,
    SMEJJ_TRAINING_FINGERPRINT_KEY_B64: SECURE_ENV.SMEJJ_TRAINING_ENCRYPTION_KEY_B64
  };
  const sharedKeyCandidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: sharedKeyEnv,
    candidateId: "candidate-shared-key-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  assert.equal(sharedKeyCandidate.training.eligible, false);
  assert.ok(sharedKeyCandidate.training.reasons.includes("training_key_separation_not_proven"));

  const malformedKeyCandidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: { ...SECURE_ENV, SMEJJ_TRAINING_ENCRYPTION_KEY_B64: `${SECURE_ENV.SMEJJ_TRAINING_ENCRYPTION_KEY_B64}!` },
    candidateId: "candidate-bad-key-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  assert.equal(malformedKeyCandidate.encryption.ready, false);
  assert.ok(malformedKeyCandidate.training.reasons.includes("training_encryption_not_ready"));
});

test("dataset manifests reject duplicate records and cross-split task-family leakage", async () => {
  const decision = grantedConsentDecision();
  const first = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-dataset-0001",
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  const duplicate = { ...first };
  const receipt = await persistenceReceiptFor(first, decision);
  await assert.rejects(() => buildDatasetVersionManifest([first, duplicate], {
    versionId: "v2026.07.10-alpha1",
    ...datasetAuthorityResolvers({
      decisions: { [first.recordId]: decision },
      evidences: { [first.recordId]: first.verificationEvidence },
      receipts: { [first.recordId]: receipt }
    }),
    env: SECURE_ENV
  }), /duplicate_training_record/);

  const leaked = { ...first, recordId: "candidate-dataset-0002", split: first.split === "train" ? "test" : "train" };
  assert.throws(() => assertNoDatasetLeakage([first, leaked]), /dataset_family_leakage/);
});

test("dataset version contains only eligible records and starts unapproved", async () => {
  const datasetNow = "2026-07-10T13:10:00.000Z";
  const decision = grantedConsentDecision(datasetNow);
  const first = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-version-0001",
    now: datasetNow,
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  const secondFixture = eligibleFixture();
  secondFixture.payload.task = "Fix a different authorized bug";
  const second = prepareTrainingCandidate(secondFixture, {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-version-0002",
    now: datasetNow,
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision, secondFixture)
  });
  const persistenceReceipts = {
    [first.recordId]: await persistenceReceiptFor(first, decision, datasetNow),
    [second.recordId]: await persistenceReceiptFor(second, decision, datasetNow)
  };
  await assert.rejects(() => buildDatasetVersionManifest([first, second], {
    versionId: "v2026.07.10-no-proof",
    createdAt: datasetNow,
    ...datasetAuthorityResolvers({
      decisions: { [first.recordId]: decision, [second.recordId]: decision },
      evidences: {
        [first.recordId]: first.verificationEvidence,
        [second.recordId]: second.verificationEvidence
      }
    }),
    env: SECURE_ENV
  }), /dataset_persistence_receipt_required/);
  const manifest = await buildDatasetVersionManifest([first, second], {
    versionId: "v2026.07.10-alpha1",
    createdAt: datasetNow,
    ...datasetAuthorityResolvers({
      decisions: { [first.recordId]: decision, [second.recordId]: decision },
      evidences: {
        [first.recordId]: first.verificationEvidence,
        [second.recordId]: second.verificationEvidence
      },
      receipts: persistenceReceipts
    }),
    env: SECURE_ENV
  });
  assert.equal(manifest.immutable, true);
  assert.equal(manifest.trainingDataEncrypted, true);
  assert.equal(manifest.promotionStatus, "not-approved");
  assert.equal(manifest.counts.total, 2);
  assert.equal(manifest.sourceRecords.some((record) => "payload" in record), false);
});

test("training candidates and dataset versions conform to their checked-in contracts", async () => {
  const candidateNow = "2026-07-10T13:20:00.000Z";
  const decision = grantedConsentDecision(candidateNow);
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-schema-0001",
    now: candidateNow,
    consentDecision: decision,
    verificationEvidence: trainingEvidenceFor(decision)
  });
  const receipt = await persistenceReceiptFor(candidate, decision, candidateNow);
  const manifest = await buildDatasetVersionManifest([candidate], {
    versionId: "v2026.07.10-schema",
    createdAt: "2026-07-10T13:21:00Z",
    ...datasetAuthorityResolvers({
      decisions: { [candidate.recordId]: decision },
      evidences: { [candidate.recordId]: candidate.verificationEvidence },
      receipts: { [candidate.recordId]: receipt }
    }),
    env: SECURE_ENV
  });
  assert.deepEqual(validateSchema(
    candidate,
    readJson("schemas/training-candidate.schema.json"),
    "training candidate"
  ), []);
  assert.deepEqual(validateSchema(
    manifest,
    readJson("schemas/dataset-version.schema.json"),
    "dataset version"
  ), []);
});

test("dataset build fails when consent is revoked during its final authority barrier", async () => {
  const now = "2026-07-10T13:30:00.000Z";
  const granted = grantedConsentDecision(now);
  const revoked = revokedConsentDecision(now);
  const candidate = prepareTrainingCandidate(eligibleFixture(), {
    rightsLedger: RIGHTS_LEDGER,
    env: SECURE_ENV,
    candidateId: "candidate-dataset-revoke-0001",
    now,
    consentDecision: granted,
    verificationEvidence: trainingEvidenceFor(granted)
  });
  const receipt = await persistenceReceiptFor(candidate, granted, now);
  let consentReads = 0;
  await assert.rejects(() => buildDatasetVersionManifest([candidate], {
    versionId: "v2026.07.10-revoked",
    createdAt: now,
    resolveConsentDecision: async () => (++consentReads === 1 ? granted : revoked),
    resolveVerificationEvidence: async () => candidate.verificationEvidence,
    resolvePersistenceReceipt: async () => receipt,
    env: SECURE_ENV
  }), /dataset_consent_recheck_failed/);
  assert.equal(consentReads, 2);
});

function grantedConsentDecision(resolvedAt = new Date().toISOString(), grantAt = resolvedAt) {
  const grant = consentGrant(grantAt);
  return consentDecision({ entries: [grant], scope: consentScope() }, { config: CONSENT_CONFIG, now: resolvedAt });
}

function revokedConsentDecision(resolvedAt = new Date().toISOString()) {
  const resolvedMs = Date.parse(resolvedAt);
  const grantAt = new Date(resolvedMs - 2_000).toISOString();
  const revokeAt = new Date(resolvedMs - 1_000).toISOString();
  const grant = consentGrant(grantAt);
  const revoked = createConsentRevocation({
    grant,
    subjectId: CONSENT_SUBJECT,
    repository: CONSENT_REPOSITORY
  }, {
    config: CONSENT_CONFIG,
    now: revokeAt,
    randomUUID: uuidSequence(20)
  });
  return consentDecision({ entries: [grant, revoked.sentinel], scope: consentScope() }, {
    config: CONSENT_CONFIG,
    now: resolvedAt
  });
}

function consentGrant(occurredAt = CONSENT_NOW) {
  return createConsentGrant({
    subjectId: CONSENT_SUBJECT,
    repository: CONSENT_REPOSITORY,
    privacyNoticeSha256: CONSENT_NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true
  }, { config: CONSENT_CONFIG, now: occurredAt, randomUUID: uuidSequence(1) });
}

function consentScope() {
  return bindConsentScope({
    subjectId: CONSENT_SUBJECT,
    repository: CONSENT_REPOSITORY,
    privacyNoticeSha256: CONSENT_NOTICE_HASH
  }, CONSENT_CONFIG);
}

function uuidSequence(start) {
  let value = start;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function deepFreezeFixture(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeFixture(child, seen);
  return Object.freeze(value);
}

function trainingEvidenceFor(decision, fixture = eligibleFixture()) {
  return signTestTrainingEvidence({
    subjectRef: decision.subjectRef,
    repositoryRef: decision.repositoryRef,
    payloadSha256: crypto.createHash("sha256")
      .update(canonicalJson(sanitizeTrainingValue(fixture.payload || {}).value))
      .digest("hex"),
    diffSha256: crypto.createHash("sha256").update(String(fixture.payload?.diff || "verified-diff")).digest("hex"),
    sourceProof: {
      taskCapsuleKey: "jobs/task-demo-0001/task-capsule.json",
      taskCapsuleSha256: "7".repeat(64),
      finalStatusKey: "jobs/task-demo-0001/status.json",
      finalStatusSha256: "8".repeat(64),
      conditionEnforced: true,
      contentVerified: true,
      proofStatus: 412
    },
    provenance: fixture.provenance,
    quality: fixture.quality,
    repositoryRights: fixture.repositoryRights
  }, {
    config: EVIDENCE_CONFIG,
    privateKey: EVIDENCE_KEYS.privateKey,
    now: decision.resolvedAt,
    uuid: "22222222-2222-4222-8222-222222222222"
  });
}

async function persistenceReceiptFor(candidate, decision, now = decision.resolvedAt) {
  const plan = buildTrainingCandidateWritePlan(candidate, {
    env: SECURE_ENV,
    now,
    randomBytes: () => Buffer.alloc(12, 6),
    consentDecision: decision
  });
  assert.equal(plan.ok, true);
  const bodies = new Map(plan.objects.map((object) => [object.key, object.body]));
  return verifyTrainingPersistenceReadback({
    recordKey: plan.objects[0].key,
    recordSizeBytes: plan.objects[0].sizeBytes,
    recordSha256: plan.objects[0].sha256,
    statusKey: plan.objects[1].key,
    statusSizeBytes: plan.objects[1].sizeBytes,
    statusSha256: plan.objects[1].sha256
  }, {
    getObject: async ({ key }) => ({ status: 200, contentVerified: true, body: bodies.get(key) }),
    proveObject: async (object) => ({
      created: true,
      createdNow: false,
      idempotent: true,
      conditionEnforced: true,
      contentVerified: true,
      putStatus: 412,
      sizeBytes: object.sizeBytes,
      sha256: object.sha256
    }),
    signingConfig: RECORD_PROOF_SIGNER
  });
}

function datasetAuthorityResolvers({ decisions, evidences, receipts = {} }) {
  return {
    resolveConsentDecision: async (record) => decisions[record.recordId],
    resolveVerificationEvidence: async (record) => evidences[record.recordId],
    resolvePersistenceReceipt: async (record) => receipts[record.recordId]
  };
}

function eligibleFixture() {
  return {
    domain: "coding",
    payload: {
      task: "Fix the first-party bug safely",
      relevantCode: "export const add = (a, b) => a + b;",
      diff: "+export const add = (a, b) => a + b;",
      terminalCommands: ["npm test"],
      testSummary: "All deterministic tests passed"
    },
    consent: {
      captureStatus: "granted",
      trainingStatus: "granted",
      recordedBy: "human",
      rightsConfirmed: true,
      evidenceId: "consent:first-party-demo-v1",
      withdrawalId: "revocation:first-party-demo-v1"
    },
    provenance: {
      sources: [{ kind: "human-first-party" }],
      repositoryFingerprint: "repo-hmac-demo",
      baseCommit: "a".repeat(40),
      affectedPaths: ["src/add.js"]
    },
    repositoryRights: {
      status: "confirmed",
      trainingUseAllowed: true,
      evidenceId: "rights:first-party-demo-v1"
    },
    quality: {
      build: "passed",
      typecheck: "passed",
      lint: "passed",
      unitTests: "passed",
      integrationTests: "passed",
      privacyReview: "passed",
      security: "passed",
      nonRegression: "passed",
      rollback: "passed",
      stagingOrLive: "passed",
      browser: "not-applicable",
      uiAffected: false,
      diffStatus: "non-empty",
      acceptance: { status: "accepted", source: "deterministic-tests" }
    },
    labels: { sources: ["deterministic-tests", "static-analysis"] }
  };
}
