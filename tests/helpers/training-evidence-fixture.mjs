import crypto from "node:crypto";
import { canonicalJson } from "../../src/training/sanitize.js";

/** Test-only fixture signer. Production code intentionally exports no raw signer. */
export function signTestTrainingEvidence(input, {
  config,
  privateKey,
  now = "2026-07-10T12:00:00.000Z",
  uuid = "22222222-2222-4222-8222-222222222222"
} = {}) {
  if (!config?.ready || !privateKey) throw new Error("test_training_evidence_config_invalid");
  const quality = {
    build: input.quality.build,
    typecheck: input.quality.typecheck,
    lint: input.quality.lint,
    unitTests: input.quality.unitTests,
    integrationTests: input.quality.integrationTests,
    privacyReview: input.quality.privacyReview,
    security: input.quality.security,
    nonRegression: input.quality.nonRegression,
    rollback: input.quality.rollback,
    stagingOrLive: input.quality.stagingOrLive,
    uiAffected: input.quality.uiAffected === true,
    browser: input.quality.uiAffected === true ? input.quality.browser : "not-required",
    diffStatus: input.quality.diffStatus,
    acceptance: {
      status: input.quality.acceptance.status,
      source: input.quality.acceptance.source
    }
  };
  const provenance = {
    sources: input.provenance.sources.map((source) => ({ ...source })),
    repositoryFingerprint: input.provenance.repositoryFingerprint,
    baseCommit: input.provenance.baseCommit,
    affectedPaths: [...new Set(input.provenance.affectedPaths)].sort()
  };
  const unsigned = {
    schemaVersion: 1,
    evidenceId: `training-evidence:${uuid}`,
    occurredAt: new Date(now).toISOString(),
    signingKeyId: config.keyId,
    publicKeySha256: config.publicKeySha256,
    subjectRef: input.subjectRef,
    repositoryRef: input.repositoryRef,
    payloadSha256: input.payloadSha256,
    diffSha256: input.diffSha256,
    sourceProof: { ...input.sourceProof },
    provenance,
    quality,
    repositoryRights: { ...input.repositoryRights }
  };
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalJson(unsigned), "utf8"),
    privateKey
  ).toString("base64url");
  return { ...unsigned, signature };
}
