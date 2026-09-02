import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  createConditionalIdriveWriter,
  createImmutableTrainingObject,
  readTrainingIdriveConfig
} from "../src/training/idrive-conditional-writer.js";
import {
  createTrainingIdriveWriter,
  writeTrainingPlanToIdrive,
  writeTrainingVerificationEvidenceToIdrive
} from "../src/training/training-writer.js";
import { writeTrainingCandidateToIdrive } from "../src/training/pipeline.js";
import {
  trainingEvidenceConfig,
  trainingEvidenceVerifierConfig,
  trainingVerificationEvidenceObjectKey
} from "../src/training/evidence.js";
import { canonicalJson } from "../src/training/sanitize.js";
import {
  trainingRecordProofConfig,
  verifyTrainingPersistenceReadback
} from "../src/training/persistence.js";
import {
  bindConsentScope,
  consentDecision,
  consentDecisionReference,
  createConsentGrant,
  createConsentRevocation,
  trainingConsentConfig
} from "../src/training/consent.js";
import { signTestTrainingEvidence } from "./helpers/training-evidence-fixture.mjs";

const ENV = Object.freeze({
  IDRIVE_E2_TRAINING_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
  IDRIVE_E2_TRAINING_REGION: "us-west-2",
  IDRIVE_E2_TRAINING_ACCESS_KEY: "training-access-key",
  IDRIVE_E2_TRAINING_SECRET_KEY: "training-secret-key-value",
  IDRIVE_E2_TRAINING_BUCKET: "training-bucket",
  IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/sanitized/candidates/,training/quarantine/,training/evidence/,training/probes/",
  IDRIVE_E2_TRAINING_MAX_OBJECT_BYTES: "1048576",
  IDRIVE_E2_TRAINING_TIMEOUT_MS: "5000",
  IDRIVE_E2_TRAINING_RECOVERY_ATTEMPTS: "3",
  IDRIVE_E2_TRAINING_RETRY_DELAY_MS: "0"
});

const FIXED_CLOCK = () => new Date("2026-07-10T15:00:00.000Z");
const NO_SLEEP = async () => {};
const CONSENT_NOW = "2026-07-10T15:00:00.000Z";
const CONSENT_CONFIG = trainingConsentConfig({
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: "a".repeat(64),
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "writer-consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: Buffer.alloc(32, 41).toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "writer-consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: Buffer.alloc(32, 42).toString("base64")
});
const EVIDENCE_KEYS = crypto.generateKeyPairSync("ed25519");
const RECORD_PROOF_KEYS = crypto.generateKeyPairSync("ed25519");
const EVIDENCE_ENV = Object.freeze({
  SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID: "writer-evidence-v1",
  SMEJJ_TRAINING_EVIDENCE_PRIVATE_KEY_B64: EVIDENCE_KEYS.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_EVIDENCE_PUBLIC_KEY_B64: EVIDENCE_KEYS.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "writer-encryption-v1",
  SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "writer-fingerprint-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "writer-consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "writer-consent-binding-v1",
  SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID: "writer-record-proof-v1",
  SMEJJ_TRAINING_RECORD_PROOF_PRIVATE_KEY_B64: RECORD_PROOF_KEYS.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  SMEJJ_TRAINING_RECORD_PROOF_PUBLIC_KEY_B64: RECORD_PROOF_KEYS.publicKey.export({ format: "der", type: "spki" }).toString("base64")
});
const EVIDENCE_CONFIG = trainingEvidenceConfig(EVIDENCE_ENV);
const EVIDENCE_VERIFIER = trainingEvidenceVerifierConfig(EVIDENCE_ENV);
const RECORD_PROOF_SIGNER = trainingRecordProofConfig(EVIDENCE_ENV);

test("dedicated configuration never falls back to general IDrive credentials", () => {
  assert.throws(() => readTrainingIdriveConfig({
    IDRIVE_E2_ENDPOINT: ENV.IDRIVE_E2_TRAINING_ENDPOINT,
    IDRIVE_E2_REGION: ENV.IDRIVE_E2_TRAINING_REGION,
    IDRIVE_E2_ACCESS_KEY: "general-access",
    IDRIVE_E2_SECRET_KEY: "general-secret",
    IDRIVE_E2_BUCKET: "general-bucket"
  }), /training_idrive_config_missing:IDRIVE_E2_TRAINING_ENDPOINT/);

  assert.throws(() => readTrainingIdriveConfig({
    ...ENV,
    IDRIVE_E2_TRAINING_ENDPOINT: "http://s3.us-west-2.idrivee2.com"
  }), /training_idrive_endpoint_https_required/);
  assert.throws(() => readTrainingIdriveConfig({
    ...ENV,
    IDRIVE_E2_TRAINING_ENDPOINT: "https://storage.example.test"
  }), /training_idrive_endpoint_host_invalid/);
  assert.throws(() => readTrainingIdriveConfig({
    ...ENV,
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/../"
  }), /training_idrive_prefix_invalid/);
});

test("a 201 creation is accepted only after a signed second PUT proves 412", async () => {
  const harness = createS3Harness({ successfulPutStatus: 201 });
  const writer = trainingWriter(harness.fetch);
  const object = exampleObject();
  const result = await writer.putObject(object);

  assert.equal(result.createdNow, true);
  assert.equal(result.putStatus, 201);
  assert.equal(result.proofStatus, 412);
  assert.equal(result.conditionEnforced, true);
  assert.equal(result.contentVerified, true);
  assert.equal(result.sha256, object.sha256);
  const puts = harness.events.filter((event) => event.method === "PUT");
  assert.equal(puts.length, 2);
  assert.equal(puts[0].ifNoneMatch, "*");
  assert.match(puts[0].authorization, /SignedHeaders=content-type;host;if-none-match;x-amz-content-sha256;x-amz-date;x-amz-meta-smejj-sha256;x-amz-meta-smejj-size/);
  assert.equal(puts[0].payloadSha256, object.sha256);
  assert.equal(puts[1].status, 412);
  assert.doesNotMatch(JSON.stringify(writer.summary), /training-access-key|training-secret-key-value/);
});

test("a 200 creation also requires the second 412 proof", async () => {
  const harness = createS3Harness({ successfulPutStatus: 200 });
  const result = await trainingWriter(harness.fetch).putObject(exampleObject());
  assert.equal(result.putStatus, 200);
  assert.equal(result.proofStatus, 412);
  assert.equal(result.contentVerified, true);
});

test("an initial 412 is idempotent only when GET size and SHA-256 match", async () => {
  const object = exampleObject();
  const harness = createS3Harness({ initialObjects: [[object.key, object.body]] });
  const result = await trainingWriter(harness.fetch).putObject(object);

  assert.equal(result.created, true);
  assert.equal(result.createdNow, false);
  assert.equal(result.idempotent, true);
  assert.equal(result.putStatus, 412);
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "GET"]);
});

test("the dedicated reader returns bytes only after exact signed GET digest verification", async () => {
  const object = exampleObject();
  const harness = createS3Harness({ initialObjects: [[object.key, object.body]] });
  const result = await trainingWriter(harness.fetch).getObject({
    key: object.key,
    sizeBytes: object.sizeBytes,
    sha256: object.sha256
  });
  assert.equal(result.status, 200);
  assert.equal(result.contentVerified, true);
  assert.deepEqual(result.body, Buffer.from(object.body));
  assert.deepEqual(harness.events.map((event) => event.method), ["GET"]);

  await assert.rejects(() => trainingWriter(harness.fetch).getObject({
    key: object.key,
    sizeBytes: object.sizeBytes,
    sha256: "0".repeat(64)
  }), /training_idrive_read_digest_mismatch/);
});

test("an existing different object is a collision and is never overwritten", async () => {
  const object = exampleObject();
  const harness = createS3Harness({ initialObjects: [[object.key, "different-body"]] });
  await assert.rejects(() => trainingWriter(harness.fetch).putObject(object), /training_idrive_object_collision/);
  assert.equal(harness.store.get(object.key).toString("utf8"), "different-body");
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "GET"]);
});

test("a timeout after persistence recovers through GET digest and a 412 proof", async () => {
  const harness = createS3Harness({ timeoutAfterStore: 1 });
  const result = await trainingWriter(harness.fetch).putObject(exampleObject());

  assert.equal(result.recoveredAfterAmbiguous, true);
  assert.equal(result.proofStatus, 412);
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "GET", "PUT", "GET"]);
});

test("a timeout before persistence retries only after GET proves the key missing", async () => {
  const harness = createS3Harness({ timeoutBeforeStore: 1 });
  const result = await trainingWriter(harness.fetch).putObject(exampleObject());

  assert.equal(result.createdNow, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "GET", "PUT", "PUT", "GET"]);
});

test("corruption after a 201 and its 412 proof fails the mandatory GET readback", async () => {
  const harness = createS3Harness({ corruptAfterConditionProof: 1 });
  await assert.rejects(
    () => trainingWriter(harness.fetch).putObject(exampleObject()),
    /training_idrive_object_collision/
  );
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "PUT", "GET"]);
});

test("a transient GET timeout after the 412 proof is retried before success", async () => {
  const harness = createS3Harness({ timeoutGet: 1 });
  const result = await trainingWriter(harness.fetch).putObject(exampleObject());
  assert.equal(result.contentVerified, true);
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "PUT", "GET", "GET"]);
});

test("the request timeout remains active while a GET response body is read", async () => {
  const harness = createS3Harness({ stallGetBody: 1 });
  const writer = createConditionalIdriveWriter({
    ...readTrainingIdriveConfig(ENV),
    timeoutMs: 100
  }, {
    fetchImpl: harness.fetch,
    clock: FIXED_CLOCK,
    sleep: NO_SLEEP
  });
  const result = await writer.putObject(exampleObject());
  assert.equal(result.contentVerified, true);
  assert.deepEqual(harness.events.map((event) => event.method), ["PUT", "PUT", "GET", "GET"]);
});

test("a backend that ignores If-None-Match is rejected even for identical bytes", async () => {
  const harness = createS3Harness({ alwaysAcceptPut: true, successfulPutStatus: 200 });
  await assert.rejects(
    () => trainingWriter(harness.fetch).putObject(exampleObject()),
    /training_idrive_if_none_match_not_enforced/
  );
  assert.equal(harness.events.filter((event) => event.method === "PUT").length, 2);
});

test("prefix, maximum size and declared digest checks fail before network I/O", async () => {
  const harness = createS3Harness();
  const writer = trainingWriter(harness.fetch);
  const escaped = exampleObject("training/other/record.json");
  await assert.rejects(() => writer.putObject(escaped), /training_idrive_prefix_denied/);

  const wrongSize = { ...exampleObject(), sizeBytes: 1 };
  await assert.rejects(() => writer.putObject(wrongSize), /training_idrive_declared_size_mismatch/);

  const wrongSha = { ...exampleObject(), sha256: "0".repeat(64) };
  await assert.rejects(() => writer.putObject(wrongSha), /training_idrive_declared_sha256_mismatch/);

  const config = { ...readTrainingIdriveConfig(ENV), maxObjectBytes: 4 };
  const tinyWriter = createConditionalIdriveWriter(config, {
    fetchImpl: harness.fetch,
    clock: FIXED_CLOCK,
    sleep: NO_SLEEP
  });
  await assert.rejects(() => tinyWriter.putObject(exampleObject()), /training_idrive_object_size_invalid/);
  assert.equal(harness.events.length, 0);
});

test("the training plan writes the status object last and returns immutable evidence", async () => {
  const harness = createS3Harness();
  const writer = trainingWriter(harness.fetch);
  const plan = examplePlan();
  const decision = writerConsentDecision();
  const result = await writeTrainingPlanToIdrive(plan, {
    writer,
    resolveConsentDecision: async () => decision,
    resolveVerificationEvidence: async () => plan.verificationEvidenceReference,
    evidenceConfig: EVIDENCE_VERIFIER,
    recordProofSigningConfig: RECORD_PROOF_SIGNER,
    now: CONSENT_NOW
  });

  assert.deepEqual(result.written, plan.objects.map((object) => object.key));
  assert.equal(result.written.at(-1), plan.statusKey);
  assert.equal(result.evidence.at(-1).statusLast, true);
  assert.ok(result.evidence.every((entry) => entry.conditionEnforced && entry.contentVerified && entry.proofStatus === 412));
  assert.deepEqual(harness.createdKeys, [plan.objects[0].key, plan.statusKey]);
  const reconstructed = await verifyTrainingPersistenceReadback({
    recordKey: plan.objects[0].key,
    recordSizeBytes: plan.objects[0].sizeBytes,
    recordSha256: plan.objects[0].sha256,
    statusKey: plan.objects[1].key,
    statusSizeBytes: plan.objects[1].sizeBytes,
    statusSha256: plan.objects[1].sha256
  }, {
    getObject: writer.getObject,
    proveObject: writer.putObject,
    signingConfig: RECORD_PROOF_SIGNER
  });
  assert.equal(reconstructed.recordId, "candidate-writer-0001");
  assert.equal(reconstructed.immutableReadbackVerified, true);
});

test("signed task evidence is stored append-only with condition and readback proof", async () => {
  const harness = createS3Harness();
  const writer = trainingWriter(harness.fetch);
  const evidence = writerVerificationEvidence(writerConsentDecision());
  const first = await writeTrainingVerificationEvidenceToIdrive(evidence, {
    writer,
    evidenceConfig: EVIDENCE_VERIFIER
  });
  assert.equal(first.persisted, true);
  assert.equal(first.createdNow, true);
  assert.equal(first.proofStatus, 412);
  const replay = await writeTrainingVerificationEvidenceToIdrive(evidence, {
    writer,
    evidenceConfig: EVIDENCE_VERIFIER
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.createdNow, false);
  assert.match(first.key, /^training\/evidence\/v1\//);
});

test("a record collision prevents every status-object request", async () => {
  const plan = examplePlan();
  const harness = createS3Harness({ initialObjects: [[plan.objects[0].key, "collision"]] });
  const decision = writerConsentDecision();
  await assert.rejects(
    () => writeTrainingPlanToIdrive(plan, {
      writer: trainingWriter(harness.fetch),
      resolveConsentDecision: async () => decision,
      resolveVerificationEvidence: async () => plan.verificationEvidenceReference,
      evidenceConfig: EVIDENCE_VERIFIER,
      now: CONSENT_NOW
    }),
    /training_idrive_object_collision/
  );
  assert.equal(harness.events.some((event) => event.key === plan.statusKey), false);
});

test("the pipeline rejects condition-only results without verified GET content", async () => {
  let calls = 0;
  const decision = writerConsentDecision();
  await assert.rejects(() => writeTrainingCandidateToIdrive(examplePlan(), {
    putObject: async () => {
      calls += 1;
      return { created: true, conditionEnforced: true, contentVerified: false, proofStatus: 412 };
    },
    resolveConsentDecision: async () => decision,
    resolveVerificationEvidence: async () => examplePlan().verificationEvidenceReference,
    evidenceConfig: EVIDENCE_VERIFIER,
    now: CONSENT_NOW
  }), /training_immutable_write_not_proven/);
  assert.equal(calls, 1);
});

test("a revocation recheck prevents the final status object", async () => {
  const plan = examplePlan();
  const granted = writerConsentDecision();
  const revoked = writerConsentDecision({ revoked: true });
  let resolutions = 0;
  const written = [];
  await assert.rejects(() => writeTrainingCandidateToIdrive(plan, {
    putObject: async (object) => {
      written.push(object.key);
      return { created: true, conditionEnforced: true, contentVerified: true, proofStatus: 412 };
    },
    resolveConsentDecision: async () => (++resolutions === 1 ? granted : revoked),
    resolveVerificationEvidence: async () => plan.verificationEvidenceReference,
    evidenceConfig: EVIDENCE_VERIFIER,
    now: CONSENT_NOW
  }), /training_consent_recheck_failed:status/);
  assert.deepEqual(written, [plan.objects[0].key]);
});

test("task evidence is re-resolved before status and cannot be withdrawn mid-write", async () => {
  const plan = examplePlan();
  const decision = writerConsentDecision();
  let resolutions = 0;
  const written = [];
  await assert.rejects(() => writeTrainingCandidateToIdrive(plan, {
    putObject: async (object) => {
      written.push(object.key);
      return { created: true, conditionEnforced: true, contentVerified: true, proofStatus: 412 };
    },
    resolveConsentDecision: async () => decision,
    resolveVerificationEvidence: async () => (++resolutions === 1 ? plan.verificationEvidenceReference : null),
    evidenceConfig: EVIDENCE_VERIFIER,
    now: CONSENT_NOW
  }), /training_evidence_recheck_failed:status/);
  assert.deepEqual(written, [plan.objects[0].key]);
});

test("revocation during the final status PUT is detected by the post-status barrier", async () => {
  const plan = examplePlan();
  const granted = writerConsentDecision();
  const revoked = writerConsentDecision({ revoked: true });
  let current = granted;
  await assert.rejects(() => writeTrainingCandidateToIdrive(plan, {
    putObject: async (object) => {
      if (object.statusLast) current = revoked;
      return { created: true, conditionEnforced: true, contentVerified: true, proofStatus: 412 };
    },
    resolveConsentDecision: async () => current,
    resolveVerificationEvidence: async () => plan.verificationEvidenceReference,
    evidenceConfig: EVIDENCE_VERIFIER,
    recordProofSigningConfig: RECORD_PROOF_SIGNER,
    now: CONSENT_NOW
  }), /training_consent_recheck_failed:post-status/);
});

test("the real probe script is disabled by default before configuration or network access", () => {
  const result = spawnSync(process.execPath, ["scripts/training/probe-idrive-training-writer.mjs"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH || "" },
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /training_idrive_probe_disabled/);
  assert.doesNotMatch(result.stderr, /access|secret/i);
});

function trainingWriter(fetchImpl) {
  return createTrainingIdriveWriter({
    env: ENV,
    fetchImpl,
    clock: FIXED_CLOCK,
    sleep: NO_SLEEP
  });
}

function exampleObject(key = "training/sanitized/candidates/2026/07/ca/candidate-writer-0001/record.json.enc") {
  return createImmutableTrainingObject({
    key,
    body: "{\"encrypted\":true}\n"
  });
}

function examplePlan() {
  const root = "training/sanitized/candidates/2026/07/ca/candidate-writer-0001";
  const decision = writerConsentDecision();
  const verificationEvidence = writerVerificationEvidence(decision);
  const record = createImmutableTrainingObject({
    key: `${root}/record.json.enc`,
    body: "{\"encrypted\":true}\n",
    statusLast: false
  });
  const status = createImmutableTrainingObject({
    key: `${root}/status.json`,
    body: `${JSON.stringify({
      schemaVersion: 1,
      recordId: "candidate-writer-0001",
      targetModelId: "smejj-1-0",
      state: "candidate",
      eligible: true,
      encryptedRecordKey: record.key,
      payloadFingerprint: "b".repeat(64),
      familyFingerprint: "c".repeat(64),
      split: "train",
      domain: "coding",
      encryption: { algorithm: "AES-256-GCM", keyId: "writer-encryption-v1" },
      consentLedgerDigest: decision.ledgerDigest,
      verificationEvidenceId: verificationEvidence.evidenceId,
      verificationEvidenceKey: trainingVerificationEvidenceObjectKey(verificationEvidence),
      verificationEvidenceSha256: crypto.createHash("sha256").update(canonicalJson(verificationEvidence)).digest("hex"),
      taskCapsuleKey: verificationEvidence.sourceProof.taskCapsuleKey,
      taskCapsuleSha256: verificationEvidence.sourceProof.taskCapsuleSha256
    })}\n`,
    statusLast: true
  });
  return {
    ok: true,
    provider: "idrive-e2",
    immutable: true,
    root,
    statusKey: status.key,
    consentReference: consentDecisionReference(decision),
    verificationEvidenceReference: verificationEvidence,
    objects: [record, status]
  };
}

function writerVerificationEvidence(decision) {
  return signTestTrainingEvidence({
    subjectRef: decision.subjectRef,
    repositoryRef: decision.repositoryRef,
    payloadSha256: "0".repeat(64),
    diffSha256: "d".repeat(64),
    sourceProof: {
      taskCapsuleKey: "jobs/writer-task-0001/task-capsule.json",
      taskCapsuleSha256: "e".repeat(64),
      finalStatusKey: "jobs/writer-task-0001/status.json",
      finalStatusSha256: "f".repeat(64),
      conditionEnforced: true,
      contentVerified: true,
      proofStatus: 412
    },
    provenance: {
      sources: [{ kind: "human-first-party" }],
      repositoryFingerprint: "writer-repository-fingerprint-v1",
      baseCommit: "1".repeat(40),
      affectedPaths: ["src/writer.js"]
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
      diffStatus: "non-empty",
      acceptance: { status: "accepted", source: "deterministic-tests" }
    },
    repositoryRights: {
      status: "confirmed",
      trainingUseAllowed: true,
      evidenceId: "repository-rights:writer-v1"
    }
  }, {
    config: EVIDENCE_CONFIG,
    privateKey: EVIDENCE_KEYS.privateKey,
    now: CONSENT_NOW,
    uuid: "33333333-3333-4333-8333-333333333333"
  });
}

function writerConsentDecision({ revoked = false } = {}) {
  const subjectId = "writer-test-subject";
  const repository = "smejjcom/writer-test";
  const privacyNoticeSha256 = "a".repeat(64);
  const grant = createConsentGrant({
    subjectId,
    repository,
    privacyNoticeSha256,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true
  }, {
    config: CONSENT_CONFIG,
    now: CONSENT_NOW,
    randomUUID: fixedWriterUuid
  });
  const entries = [grant];
  if (revoked) {
    const revocation = createConsentRevocation({ grant, subjectId, repository }, {
      config: CONSENT_CONFIG,
      now: CONSENT_NOW,
      randomUUID: fixedWriterRevocationUuid
    });
    entries.push(revocation.event, revocation.sentinel);
  }
  const scope = bindConsentScope({ subjectId, repository, privacyNoticeSha256 }, CONSENT_CONFIG);
  return consentDecision({ entries, scope }, { config: CONSENT_CONFIG, now: CONSENT_NOW });
}

function fixedWriterUuid() {
  return "11111111-1111-4111-8111-111111111111";
}

let writerRevocationUuidCounter = 0;
function fixedWriterRevocationUuid() {
  writerRevocationUuidCounter += 1;
  return `22222222-2222-4222-8222-${String(writerRevocationUuidCounter).padStart(12, "0")}`;
}

function createS3Harness({
  successfulPutStatus = 201,
  initialObjects = [],
  timeoutAfterStore = 0,
  timeoutBeforeStore = 0,
  timeoutGet = 0,
  stallGetBody = 0,
  corruptAfterConditionProof = 0,
  alwaysAcceptPut = false
} = {}) {
  const store = new Map(initialObjects.map(([key, body]) => [key, Buffer.from(body)]));
  const events = [];
  const createdKeys = [];
  let beforeTimeouts = timeoutBeforeStore;
  let afterTimeouts = timeoutAfterStore;
  let getTimeouts = timeoutGet;
  let stalledBodies = stallGetBody;
  let corruptions = corruptAfterConditionProof;

  const fetch = async (url, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    assert.equal(segments.shift(), ENV.IDRIVE_E2_TRAINING_BUCKET);
    const key = segments.join("/");
    const headers = new Headers(options.headers || {});
    const event = {
      method,
      key,
      authorization: headers.get("authorization") || "",
      ifNoneMatch: headers.get("if-none-match") || "",
      payloadSha256: headers.get("x-amz-content-sha256") || "",
      status: 0
    };
    events.push(event);
    assertValidSigV4(parsed, method, headers);

    if (method === "GET") {
      if (getTimeouts > 0) {
        getTimeouts -= 1;
        event.status = 0;
        throw timeoutError();
      }
      if (!store.has(key)) {
        event.status = 404;
        return new Response(null, { status: 404 });
      }
      const body = store.get(key);
      event.status = 200;
      if (stalledBodies > 0) {
        stalledBodies -= 1;
        return stalledBodyResponse(body.length, options.signal);
      }
      return new Response(body, {
        status: 200,
        headers: { "Content-Length": String(body.length) }
      });
    }

    assert.equal(method, "PUT");
    assert.equal(event.ifNoneMatch, "*");
    const body = Buffer.from(options.body);
    assert.equal(event.payloadSha256, crypto.createHash("sha256").update(body).digest("hex"));
    if (beforeTimeouts > 0) {
      beforeTimeouts -= 1;
      event.status = 0;
      throw timeoutError();
    }
    if (!alwaysAcceptPut && store.has(key)) {
      event.status = 412;
      if (corruptions > 0) {
        corruptions -= 1;
        store.set(key, Buffer.from("corrupted-after-proof"));
      }
      return new Response(null, { status: 412 });
    }
    store.set(key, body);
    createdKeys.push(key);
    if (afterTimeouts > 0) {
      afterTimeouts -= 1;
      event.status = 0;
      throw timeoutError();
    }
    event.status = successfulPutStatus;
    return new Response(null, { status: successfulPutStatus });
  };

  return { fetch, store, events, createdKeys };
}

function timeoutError() {
  const error = new Error("simulated timeout");
  error.name = "AbortError";
  return error;
}

function stalledBodyResponse(contentLength, signal) {
  return {
    status: 200,
    headers: new Headers({ "Content-Length": String(contentLength) }),
    body: {
      getReader() {
        return {
          read: () => new Promise((resolve, reject) => {
            if (signal.aborted) {
              reject(timeoutError());
              return;
            }
            signal.addEventListener("abort", () => reject(timeoutError()), { once: true });
          }),
          cancel: async () => {}
        };
      }
    }
  };
}

function assertValidSigV4(url, method, headers) {
  const authorization = headers.get("authorization") || "";
  const match = authorization.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/);
  assert.ok(match, "SigV4 Authorization header must be complete");
  const [, accessKey, dateStamp, region, signedHeaderText, actualSignature] = match;
  assert.equal(accessKey, ENV.IDRIVE_E2_TRAINING_ACCESS_KEY);
  assert.equal(region, ENV.IDRIVE_E2_TRAINING_REGION);
  const signedNames = signedHeaderText.split(";");
  const canonicalHeaders = `${signedNames.map((name) => {
    const value = name === "host" ? url.host : headers.get(name);
    assert.notEqual(value, null, `missing signed header ${name}`);
    return `${name}:${String(value).trim().replace(/\s+/g, " ")}`;
  }).join("\n")}\n`;
  const payloadHash = headers.get("x-amz-content-sha256") || "";
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaderText,
    payloadHash
  ].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    headers.get("x-amz-date"),
    scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const kDate = crypto.createHmac("sha256", `AWS4${ENV.IDRIVE_E2_TRAINING_SECRET_KEY}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const expectedSignature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  assert.equal(actualSignature, expectedSignature);
}

test("Trainings-Werte duerfen per ${NAME} auf eine andere Variable zeigen; leerer Verweis bleibt fail-closed", () => {
  const env = {
    IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_ACCESS_KEY: "AKIAHAUPT",
    IDRIVE_E2_SECRET_KEY: "geheim-haupt",
    IDRIVE_E2_TRAINING_ENDPOINT: "${IDRIVE_E2_ENDPOINT}",
    IDRIVE_E2_TRAINING_REGION: "us-west-2",
    IDRIVE_E2_TRAINING_ACCESS_KEY: "${IDRIVE_E2_ACCESS_KEY}",
    IDRIVE_E2_TRAINING_SECRET_KEY: "${IDRIVE_E2_SECRET_KEY}",
    IDRIVE_E2_TRAINING_BUCKET: "smejj-app",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/"
  };
  const config = readTrainingIdriveConfig(env);
  assert.equal(config.endpoint, "https://s3.us-west-2.idrivee2.com");
  assert.equal(config.accessKey, "AKIAHAUPT");
  assert.equal(config.secretKey, "geheim-haupt");
  assert.throws(
    () => readTrainingIdriveConfig({ ...env, IDRIVE_E2_TRAINING_SECRET_KEY: "${IDRIVE_E2_FEHLT}" }),
    /training_idrive_config_reference_missing:IDRIVE_E2_TRAINING_SECRET_KEY->IDRIVE_E2_FEHLT/
  );
  // Ohne Verweis: kein stiller Rueckgriff auf allgemeine Zugaenge.
  assert.throws(
    () => readTrainingIdriveConfig({ ...env, IDRIVE_E2_TRAINING_ACCESS_KEY: "" }),
    /training_idrive_config_missing:IDRIVE_E2_TRAINING_ACCESS_KEY/
  );
});
