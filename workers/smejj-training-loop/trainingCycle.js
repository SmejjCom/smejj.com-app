// smejj.com training-loop worker — drains pre-built training candidate write
// plans (Single Responsibility: training cycle orchestration).
//
// This module never decides training eligibility, never collects consent, and
// never issues verification evidence — those are already-governed steps that
// must happen before an item reaches the queue (src/training/pipeline.js's
// prepareTrainingCandidate + buildTrainingCandidateWritePlan, called by
// whichever already-consented flow builds the plan). This cycle's only job is
// to re-verify freshness at write time (exactly as
// writeTrainingCandidateToIdrive already requires) and perform the durable,
// idempotent write via src/training/training-writer.js#writeTrainingPlanToIdrive.
//
// Queue contract: one JSON object per candidate under
// training/queue/v1/<candidateId>.json, shape { plan } where `plan` is the
// exact object returned by buildTrainingCandidateWritePlan. Nothing here ever
// deletes a queue object (no delete capability exists in the shared S3 signer,
// and the training-data policy is append-only) — already-written keys are
// skipped via the checkpoint instead.
import {
  createIdriveConsentLedger
} from "../../control-server/src/training/consentLedger.js";
import { parseS3Keys, signedS3Get, signedS3List } from "../../control-server/src/storage/s3Signer.js";
import { trainingConsentConfig } from "../../src/training/consent.js";
import { trainingVerificationEvidenceObjectKey, trainingEvidenceVerifierConfig } from "../../src/training/evidence.js";
import { readTrainingIdriveConfig } from "../../src/training/idrive-conditional-writer.js";
import { writeTrainingPlanToIdrive } from "../../src/training/training-writer.js";

/** Builds the two resolvers writeTrainingPlanToIdrive requires, backed by IDrive e2. */
export function createDefaultResolvers(env = process.env) {
  const consentConfig = trainingConsentConfig(env);
  if (!consentConfig.ready) throw new Error("training_consent_configuration_invalid");
  const ledger = createIdriveConsentLedger(env, { config: consentConfig });
  const s3 = readTrainingIdriveConfig(env);
  const evidenceConfig = trainingEvidenceVerifierConfig(env);

  return {
    resolveConsentDecision: async (reference) => ledger.resolve({
      subjectRef: reference.subjectRef,
      repositoryRef: reference.repositoryRef,
      privacyNoticeSha256: reference.privacyNoticeSha256
    }, { now: Date.now() }),
    resolveVerificationEvidence: async (reference) => {
      const key = trainingVerificationEvidenceObjectKey(reference);
      const result = await signedS3Get({ ...s3, key });
      if (!result?.response?.ok) throw new Error(`training_evidence_read_failed:${result?.response?.status || 0}`);
      return JSON.parse(String(result.body));
    },
    evidenceConfig
  };
}

// `env` is threaded through rather than a pre-resolved `s3` config so that an
// injected listImpl/getPlan (tests, or a future non-IDrive queue source)
// never has to satisfy readTrainingIdriveConfig's required env vars — only
// the *default* implementations below need real IDrive training credentials.
async function defaultList(env, prefix) {
  const s3 = readTrainingIdriveConfig(env);
  const { response, body } = await signedS3List({ ...s3, prefix });
  if (!response?.ok) throw new Error(`training_queue_list_failed:${response?.status || 0}`);
  return parseS3Keys(body).filter((key) => key.endsWith(".json"));
}

async function defaultGetPlan(env, key) {
  const s3 = readTrainingIdriveConfig(env);
  const result = await signedS3Get({ ...s3, key });
  if (!result?.response?.ok) throw new Error(`training_queue_read_failed:${result?.response?.status || 0}`);
  return JSON.parse(String(result.body));
}

/**
 * Processes up to `batchSize` not-yet-written queue items. Returns a summary;
 * never throws for a single item's failure — one bad candidate must not stop
 * the rest of the batch or the loop itself.
 */
export async function runTrainingCycle({
  env = process.env,
  queuePrefix,
  batchSize = 5,
  alreadyProcessed = [],
  resolvers,
  getPlan = defaultGetPlan,
  listImpl = defaultList,
  writePlan = writeTrainingPlanToIdrive
}) {
  const processed = new Set(alreadyProcessed);
  const keys = (await listImpl(env, queuePrefix))
    .filter((key) => !processed.has(key))
    .slice(0, batchSize);

  const { resolveConsentDecision, resolveVerificationEvidence, evidenceConfig } = resolvers || createDefaultResolvers(env);

  const results = [];
  for (const key of keys) {
    try {
      const queued = await getPlan(env, key);
      const outcome = await writePlan(queued.plan, {
        env,
        resolveConsentDecision,
        resolveVerificationEvidence,
        evidenceConfig
      });
      results.push({ key, ok: true, written: outcome.written });
      processed.add(key);
    } catch (error) {
      results.push({ key, ok: false, error: String(error?.message || error).slice(0, 160) });
      // Deliberately NOT added to `processed` — a failed write (e.g. stale
      // consent) must be retried on the next cycle, not silently skipped.
    }
  }

  return {
    ok: results.every((result) => result.ok),
    processedKeys: [...processed],
    attempted: results.length,
    succeeded: results.filter((result) => result.ok).length,
    results
  };
}
