import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  evidenceClaims,
  issueTrainingVerificationEvidence,
  trainingEvidenceConfig,
  trainingEvidenceVerifierConfig,
  trainingVerificationEvidenceObject,
  verifyTrainingVerificationEvidence
} from "../src/training/evidence.js";
import {
  createConditionalIdriveWriter,
  createTrainingEvidenceAttestorWriter,
  readTrainingEvidenceAttestorIdriveConfig
} from "../src/training/idrive-conditional-writer.js";
import { issueTrainingVerificationEvidenceFromIdrive } from "../src/training/training-writer.js";
import { readJson, validateSchema } from "../scripts/validation-utils.mjs";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const ENV = {
  SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: "training-evidence-v1",
  SMEJJ_TRAINING_EVIDENCE_PRIVATE_KEY_B64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "training-encryption-v1",
  SMEJJ_TRAINING_ENCRYPTION_KEY_B64: Buffer.alloc(32, 52).toString("base64"),
  SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "training-fingerprint-v1",
  SMEJJ_TRAINING_FINGERPRINT_KEY_B64: Buffer.alloc(32, 53).toString("base64"),
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "training-consent-sign-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: Buffer.alloc(32, 54).toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "training-consent-bind-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: Buffer.alloc(32, 55).toString("base64"),
  SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID: "training-record-proof-v1"
};
const CONFIG = trainingEvidenceConfig(ENV);

test("training verification evidence requires a dedicated separated key", () => {
  assert.equal(CONFIG.ready, true);
  assert.equal(CONFIG.algorithm, "Ed25519");
  assert.equal(Object.hasOwn(CONFIG, "privateKey"), false);
  assert.equal(trainingEvidenceVerifierConfig({
    SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: ENV.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID,
    SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64: ENV.SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64
  }).ready, false);
  assert.equal(trainingEvidenceVerifierConfig(ENV).ready, true);
  assert.equal(trainingEvidenceConfig({ ...ENV, SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64: "invalid" }).ready, false);
  assert.equal(trainingEvidenceConfig({
    ...ENV,
    SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: ENV.SMEJJ_TRAINING_FINGERPRINT_KEY_ID
  }).ready, false);
});

test("job readback uses a separate attestor principal and never the training-data principal", () => {
  const storage = attestorStorageConfig();
  assert.throws(
    () => createConditionalIdriveWriter({ ...storage, allowedPrefixes: ["jobs/"] }),
    /training_idrive_prefix_invalid/
  );
  assert.throws(() => readTrainingEvidenceAttestorIdriveConfig({
    IDRIVE_E2_TRAINING_ENDPOINT: storage.endpoint,
    IDRIVE_E2_TRAINING_REGION: storage.region,
    IDRIVE_E2_TRAINING_ACCESS_KEY: storage.accessKey,
    IDRIVE_E2_TRAINING_SECRET_KEY: storage.secretKey,
    IDRIVE_E2_TRAINING_BUCKET: storage.bucket
  }), /IDRIVE_E2_TRAINING_ATTESTOR_ENDPOINT/);
  assert.throws(() => readTrainingEvidenceAttestorIdriveConfig({
    IDRIVE_E2_TRAINING_ACCESS_KEY: storage.accessKey,
    IDRIVE_E2_TRAINING_ATTESTOR_ENDPOINT: storage.endpoint,
    IDRIVE_E2_TRAINING_ATTESTOR_REGION: storage.region,
    IDRIVE_E2_TRAINING_ATTESTOR_ACCESS_KEY: storage.accessKey,
    IDRIVE_E2_TRAINING_ATTESTOR_SECRET_KEY: storage.secretKey,
    IDRIVE_E2_TRAINING_ATTESTOR_BUCKET: storage.bucket
  }), /training_attestor_principal_not_separate/);
  const config = readTrainingEvidenceAttestorIdriveConfig({
    IDRIVE_E2_TRAINING_ATTESTOR_ENDPOINT: storage.endpoint,
    IDRIVE_E2_TRAINING_ATTESTOR_REGION: storage.region,
    IDRIVE_E2_TRAINING_ATTESTOR_ACCESS_KEY: storage.accessKey,
    IDRIVE_E2_TRAINING_ATTESTOR_SECRET_KEY: storage.secretKey,
    IDRIVE_E2_TRAINING_ATTESTOR_BUCKET: storage.bucket
  });
  assert.deepEqual(config.allowedPrefixes, ["jobs/"]);
});

test("issuer derives signed evidence only from immutable Task Capsule and final-status bytes", async () => {
  const fixture = attestedObjects();
  const evidence = await issueTrainingVerificationEvidenceFromIdrive(fixture.descriptors, {
    signingConfig: CONFIG,
    writer: fixture.writer,
    now: "2026-07-10T17:45:00.000Z",
    randomUUID: () => "11111111-1111-4111-8111-111111111111"
  });
  assert.equal(verifyTrainingVerificationEvidence(evidence, CONFIG), true);
  assert.equal(evidence.payloadSha256, validClaims().payloadSha256);
  assert.equal(evidence.sourceProof.taskCapsuleSha256, fixture.descriptors.taskCapsule.sha256);
  assert.equal(evidence.sourceProof.finalStatusSha256, fixture.descriptors.finalStatus.sha256);
  assert.equal(fixture.calls.reads, 6);
  assert.equal(fixture.calls.proofs, 2);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.quality), true);
  assert.deepEqual(validateSchema(
    evidence,
    readJson("schemas/training-verification-evidence.schema.json"),
    "training verification evidence"
  ), []);
  const claims = evidenceClaims(evidence, CONFIG);
  assert.equal(claims.verified, true);
  assert.equal(claims.quality.security, "passed");
  assert.equal(claims.repositoryRights.trainingUseAllowed, true);
  const object = trainingVerificationEvidenceObject(evidence, trainingEvidenceVerifierConfig(ENV));
  assert.match(object.key, /^training\/evidence\/v1\/sub_[a-f0-9]{64}\/repo_[a-f0-9]{64}\/[a-f0-9]{64}\.json$/);
  assert.equal(object.ifNoneMatch, "*");
  assert.equal(object.conditionRequired, true);
});

test("production module exposes no signer for raw booleans or caller supplied hashes", async () => {
  const module = await import("../src/training/evidence.js");
  assert.equal(Object.hasOwn(module, "createTrainingVerificationEvidence"), false);
  await assert.rejects(
    () => issueTrainingVerificationEvidence(validClaims(), {
      config: CONFIG,
      writer: { getObject: async () => ({}), putObject: async () => ({}) }
    }),
    /training_evidence_attestor_writer_required/
  );
});

test("tampering and incomplete immutable-storage proof fail closed", async () => {
  const fixture = attestedObjects();
  const evidence = await issueTrainingVerificationEvidence(fixture.descriptors, { config: CONFIG, writer: fixture.writer });
  const tampered = structuredClone(evidence);
  tampered.quality.security = "skipped";
  assert.equal(verifyTrainingVerificationEvidence(tampered, CONFIG), false);
  assert.equal(evidenceClaims(tampered, CONFIG).verified, false);

  const forgedProof = attestedObjects({ conditionIgnored: true });
  await assert.rejects(
    () => issueTrainingVerificationEvidence(forgedProof.descriptors, { config: CONFIG, writer: forgedProof.writer }),
    /training_evidence_condition_proof_failed/
  );

  const changedStatus = attestedObjects({ statusMutation: (status) => {
    status.trainingVerification.payloadSha256 = "e".repeat(64);
  } });
  await assert.rejects(
    () => issueTrainingVerificationEvidence(changedStatus.descriptors, { config: CONFIG, writer: changedStatus.writer }),
    /training_evidence_status_candidate_mismatch/
  );

  const unverifiedQuality = attestedObjects({ statusMutation: (status) => {
    status.trainingVerification.quality.unitTests = "claimed";
  } });
  await assert.rejects(
    () => issueTrainingVerificationEvidence(unverifiedQuality.descriptors, { config: CONFIG, writer: unverifiedQuality.writer }),
    /training_evidence_quality_unitTests_not_passed/
  );
});

function attestedObjects({ statusMutation, conditionIgnored = false } = {}) {
  const claims = validClaims();
  const jobId = "task-demo-0001";
  const root = `jobs/2026/07/${jobId}/`;
  const capsule = {
    schemaVersion: 1,
    jobId,
    trainingCandidate: {
      schemaVersion: 1,
      subjectRef: claims.subjectRef,
      repositoryRef: claims.repositoryRef,
      payloadSha256: claims.payloadSha256,
      diffSha256: claims.diffSha256,
      provenance: claims.provenance,
      repositoryRights: claims.repositoryRights
    }
  };
  const taskCapsule = descriptor(`${root}task-capsule.json`, capsule);
  const status = {
    schemaVersion: 1,
    jobId,
    status: "passed",
    phase: "verified",
    trainingEligible: true,
    trainingVerification: {
      schemaVersion: 1,
      taskCapsuleSha256: taskCapsule.sha256,
      subjectRef: claims.subjectRef,
      repositoryRef: claims.repositoryRef,
      payloadSha256: claims.payloadSha256,
      diffSha256: claims.diffSha256,
      repositoryRightsEvidenceId: claims.repositoryRights.evidenceId,
      quality: structuredClone(claims.quality)
    }
  };
  if (statusMutation) statusMutation(status);
  const finalStatus = descriptor(`${root}status.json`, status);
  const objects = new Map([
    [taskCapsule.key, taskCapsule],
    [finalStatus.key, finalStatus]
  ]);
  const calls = { reads: 0, proofs: 0 };
  const writer = createTrainingEvidenceAttestorWriter({
    ...attestorStorageConfig(),
    maxObjectBytes: 1_048_576,
    timeoutMs: 1_000,
    recoveryAttempts: 1,
    retryDelayMs: 0
  }, {
    clock: () => new Date("2026-07-10T17:45:00.000Z"),
    sleep: async () => {},
    fetchImpl: async (url, options = {}) => {
      const key = decodeObjectKey(url);
      const object = objects.get(key);
      if (!object) return new Response("", { status: 404 });
      if (options.method === "GET") {
        calls.reads += 1;
        return new Response(object.body, { status: 200 });
      }
      calls.proofs += 1;
      assert.equal(options.headers["If-None-Match"], "*");
      return new Response("", { status: conditionIgnored ? 201 : 412 });
    }
  });
  return {
    descriptors: {
      taskCapsule: publicDescriptor(taskCapsule),
      finalStatus: publicDescriptor(finalStatus)
    },
    calls,
    writer
  };
}

function attestorStorageConfig() {
  return {
    endpoint: "https://s3.us-west-2.idrivee2.com",
    region: "us-west-2",
    accessKey: "training-attestor-access",
    secretKey: "training-attestor-secret-value",
    bucket: "training-attestor-bucket"
  };
}

function decodeObjectKey(url) {
  return new URL(url).pathname.split("/").slice(2).map(decodeURIComponent).join("/");
}

function descriptor(key, value) {
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  return {
    key,
    body,
    sizeBytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex")
  };
}

function publicDescriptor(value) {
  return { key: value.key, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}

function validClaims() {
  return {
    subjectRef: `sub_${"9".repeat(64)}`,
    repositoryRef: `repo_${"a".repeat(64)}`,
    payloadSha256: "6".repeat(64),
    diffSha256: "b".repeat(64),
    provenance: {
      sources: [{ kind: "human-first-party" }],
      repositoryFingerprint: "repository-fingerprint-v1",
      baseCommit: "1".repeat(40),
      affectedPaths: ["src/example.js"]
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
      uiAffected: false,
      browser: "not-required",
      diffStatus: "non-empty",
      acceptance: { status: "accepted", source: "deterministic-tests" }
    },
    repositoryRights: {
      status: "confirmed",
      trainingUseAllowed: true,
      evidenceId: "repository-rights:first-party-v1"
    }
  };
}
