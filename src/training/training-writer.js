import {
  createConditionalIdriveWriter,
  createTrainingEvidenceAttestorWriter,
  readTrainingEvidenceAttestorIdriveConfig,
  readTrainingIdriveConfig
} from "./idrive-conditional-writer.js";
import { writeTrainingCandidateToIdrive } from "./pipeline.js";
import {
  issueTrainingVerificationEvidence,
  trainingEvidenceConfig,
  trainingEvidenceVerifierConfig,
  trainingVerificationEvidenceObject
} from "./evidence.js";

/** Creates the production training writer from dedicated, non-fallback credentials. */
export function createTrainingIdriveWriter({
  env = process.env,
  fetchImpl,
  clock,
  sleep
} = {}) {
  const config = readTrainingIdriveConfig(env);
  return createConditionalIdriveWriter(config, {
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(clock ? { clock } : {}),
    ...(sleep ? { sleep } : {})
  });
}

/** Creates the separate job-readback attestor; it never reuses training-data credentials. */
export function createTrainingEvidenceAttestorIdriveWriter({
  env = process.env,
  fetchImpl,
  clock,
  sleep
} = {}) {
  const config = readTrainingEvidenceAttestorIdriveConfig(env);
  return createTrainingEvidenceAttestorWriter(config, {
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(clock ? { clock } : {}),
    ...(sleep ? { sleep } : {})
  });
}

/** Issues signed evidence through the productive, separately branded IDrive path. */
export async function issueTrainingVerificationEvidenceFromIdrive(descriptors, options = {}) {
  const writer = options.writer || createTrainingEvidenceAttestorIdriveWriter(options);
  return issueTrainingVerificationEvidence(descriptors, {
    writer,
    config: options.signingConfig || trainingEvidenceConfig(options.env),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.randomUUID ? { randomUUID: options.randomUUID } : {})
  });
}

/** Persists a validated two-object candidate plan with its status object last. */
export async function writeTrainingPlanToIdrive(plan, options = {}) {
  const writer = options.writer || createTrainingIdriveWriter(options);
  if (typeof writer?.putObject !== "function") throw new Error("training_idrive_writer_invalid");
  if (typeof options.resolveConsentDecision !== "function") throw new Error("training_consent_resolver_required");
  if (typeof options.resolveVerificationEvidence !== "function") throw new Error("training_evidence_resolver_required");
  const result = await writeTrainingCandidateToIdrive(plan, {
    putObject: writer.putObject,
    resolveConsentDecision: options.resolveConsentDecision,
    resolveVerificationEvidence: options.resolveVerificationEvidence,
    evidenceConfig: options.evidenceConfig || trainingEvidenceVerifierConfig(options.env),
    ...(options.now !== undefined ? { now: options.now } : {})
  });
  return {
    ...result,
    storage: writer.summary || {
      provider: "idrive-e2",
      immutable: true
    }
  };
}

/** Stores a signed evidence attestation append-only before it can authorize capture. */
export async function writeTrainingVerificationEvidenceToIdrive(evidence, options = {}) {
  const writer = options.writer || createTrainingIdriveWriter(options);
  if (typeof writer?.putObject !== "function") throw new Error("training_idrive_writer_invalid");
  const verifier = options.evidenceConfig || trainingEvidenceVerifierConfig(options.env);
  const object = trainingVerificationEvidenceObject(evidence, verifier);
  const result = await writer.putObject(object);
  if (result?.created !== true || result?.conditionEnforced !== true || result?.contentVerified !== true ||
      Number(result?.proofStatus) !== 412 || result?.sha256 !== object.sha256 || result?.sizeBytes !== object.sizeBytes) {
    throw new Error("training_evidence_immutable_write_not_proven");
  }
  return Object.freeze({
    ok: true,
    persisted: true,
    immutable: true,
    key: object.key,
    sizeBytes: object.sizeBytes,
    sha256: object.sha256,
    createdNow: result.createdNow === true,
    idempotent: result.idempotent === true,
    conditionEnforced: true,
    contentVerified: true,
    proofStatus: 412
  });
}
