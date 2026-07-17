import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const JSON_TYPE = "application/json; charset=utf-8";
const RECORD_TYPE = "smejj.com-job-claim-head";

export function createJobClaimStore({
  env = process.env,
  getObject,
  putObject,
  nowMs = () => Date.now(),
  controlId = process.env.SMEJJ_CONTROL_INSTANCE_ID || `control_${crypto.randomUUID()}`
} = {}) {
  const config = idriveConfig(env);
  const reader = getObject || ((key) => signedS3Get({ ...config, key, allowNotFound: true }));
  const writer = putObject || ((object) => signedS3Put({ ...config, ...object }));
  const ttlMs = boundedTtl(env.SMEJJ_JOB_CLAIM_TTL_MS);

  async function claim(job) {
    if (!validJob(job) || !config.ok) return failure("job_claim_configuration_invalid");
    const at = nowMs();
    const current = await readHead(reader, job.id);
    if (!current.ok) return current;
    if (current.value?.state === "active" && Date.parse(current.value.expiresAt) > at) {
      return failure("job_claim_active", { claim: publicClaim(current.value) });
    }
    const claimId = `claim_${crypto.randomUUID()}`;
    const record = claimRecord(job, {
      claimId,
      controlId,
      fence: Math.max(0, Number(current.value?.fence || 0)) + 1,
      claimedAt: new Date(at).toISOString(),
      heartbeatAt: new Date(at).toISOString(),
      expiresAt: new Date(at + ttlMs).toISOString()
    });
    const written = await compareAndWrite(writer, reader, job.id, record, current);
    if (!written.ok) return written;
    const audit = await appendAudit(writer, reader, job, record, "claimed", at);
    if (!audit.ok) return failure("job_claim_audit_failed");
    return { ok: true, lease: leaseFrom(record), audit };
  }

  async function heartbeat(job, lease) {
    const at = nowMs();
    const current = await readHead(reader, job?.id);
    if (!matchingActiveClaim(current.value, lease, at)) return failure("job_claim_lost");
    const record = {
      ...current.value,
      heartbeatAt: new Date(at).toISOString(),
      expiresAt: new Date(at + ttlMs).toISOString()
    };
    const written = await compareAndWrite(writer, reader, job.id, record, current);
    return written.ok ? { ok: true, lease: leaseFrom(record) } : written;
  }

  async function complete(job, lease, outcome = "completed") {
    return finish(job, lease, "completed", outcome);
  }

  async function release(job, lease, outcome = "released") {
    return finish(job, lease, "released", outcome);
  }

  async function finish(job, lease, state, outcome) {
    const at = nowMs();
    const current = await readHead(reader, job?.id);
    if (!matchingClaim(current.value, lease)) return failure("job_claim_lost");
    if (current.value.state !== "active") {
      return current.value.state === state
        ? { ok: true, idempotent: true, lease: leaseFrom(current.value) }
        : failure("job_claim_not_active");
    }
    const record = {
      ...current.value,
      state,
      outcome: safeOutcome(outcome),
      heartbeatAt: new Date(at).toISOString(),
      expiresAt: new Date(at).toISOString(),
      finishedAt: new Date(at).toISOString()
    };
    const written = await compareAndWrite(writer, reader, job.id, record, current);
    if (!written.ok) return written;
    const audit = await appendAudit(writer, reader, job, record, state, at);
    if (!audit.ok) return failure("job_claim_audit_failed");
    return { ok: true, lease: leaseFrom(record), audit };
  }

  return { claim, heartbeat, complete, release, ttlMs };
}

async function readHead(reader, jobId) {
  try {
    const result = await reader(headKey(jobId));
    if (result?.status === 404) return { ok: true, value: null, etag: "" };
    if (result?.ok !== true || !result.etag) return failure("job_claim_head_read_failed");
    const value = JSON.parse(String(result.body || ""));
    if (!validRecord(value, jobId)) return failure("job_claim_head_invalid");
    return { ok: true, value, etag: result.etag };
  } catch {
    return failure("job_claim_head_read_failed");
  }
}

async function compareAndWrite(writer, reader, jobId, record, current) {
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const object = {
    key: headKey(jobId),
    body,
    contentType: JSON_TYPE,
    ...(current.value ? { ifMatch: current.etag } : { ifNoneMatch: "*" })
  };
  let result;
  try {
    result = await writer(object);
  } catch {
    return failure("job_claim_head_write_failed");
  }
  if (result?.status === 412) return failure("job_claim_race_lost");
  if (result?.ok !== true || result?.conditionEnforced !== true) return failure("job_claim_cas_not_enforced");
  const readback = await readHead(reader, jobId);
  if (!readback.ok || JSON.stringify(readback.value) !== JSON.stringify(record)) {
    return failure("job_claim_readback_mismatch");
  }
  return { ok: true, etag: readback.etag };
}

async function appendAudit(writer, reader, job, record, event, at) {
  const key = `${job.taskCapsule.rootPrefix}claims/${String(record.fence).padStart(8, "0")}-${event}-${record.claimId}.json`;
  const body = `${JSON.stringify({
    schemaVersion: 1,
    recordType: "smejj.com-job-claim-event",
    event,
    jobId: job.id,
    claimId: record.claimId,
    fence: record.fence,
    ownerId: record.ownerId,
    state: record.state,
    outcome: record.outcome || null,
    createdAt: new Date(at).toISOString()
  }, null, 2)}\n`;
  try {
    const object = { key, body, contentType: JSON_TYPE, ifNoneMatch: "*" };
    const created = await writer(object);
    if (created?.ok !== true || created?.conditionEnforced !== true) return failure("job_claim_audit_create_failed");
    const proof = await writer(object);
    if (proof?.status !== 412 || proof?.conditionEnforced !== true) return failure("job_claim_audit_overwrite_proof_failed");
    const readback = await reader(key);
    if (readback?.ok !== true || sha256(readback.body) !== sha256(body)) return failure("job_claim_audit_readback_failed");
    return { ok: true, key, sha256: sha256(body), proofStatus: 412 };
  } catch {
    return failure("job_claim_audit_write_failed");
  }
}

function claimRecord(job, lease) {
  return {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    jobId: job.id,
    projectId: job.projectId,
    ownerId: job.userId,
    state: "active",
    outcome: null,
    ...lease
  };
}

function matchingActiveClaim(record, lease, at) {
  return matchingClaim(record, lease)
    && record.state === "active"
    && Date.parse(record.expiresAt) > at;
}

function matchingClaim(record, lease) {
  return Boolean(record && lease
    && record.claimId === lease.claimId
    && record.fence === lease.fence
    && record.jobId === lease.jobId);
}

function validRecord(value, jobId) {
  return value?.schemaVersion === 1
    && value.recordType === RECORD_TYPE
    && value.jobId === jobId
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(value.claimId || ""))
    && Number.isInteger(value.fence)
    && value.fence > 0
    && ["active", "completed", "released"].includes(value.state)
    && Number.isFinite(Date.parse(value.expiresAt));
}

function validJob(job) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(job?.id || ""))
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(job?.userId || ""))
    && /^jobs\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{2}\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/$/.test(String(job?.taskCapsule?.rootPrefix || ""));
}

function leaseFrom(record) {
  return {
    jobId: record.jobId,
    claimId: record.claimId,
    fence: record.fence,
    expiresAt: record.expiresAt
  };
}

function publicClaim(record) {
  return {
    jobId: record.jobId,
    claimId: record.claimId,
    fence: record.fence,
    expiresAt: record.expiresAt
  };
}

function headKey(jobId) {
  return `jobs/claims/${jobId}.json`;
}

function idriveConfig(env) {
  const value = {
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_BUCKET
  };
  return { ...value, ok: Boolean(value.endpoint && value.accessKey && value.secretKey && value.bucket) };
}

function boundedTtl(value) {
  const ttl = Number(value || 120_000);
  return Math.min(15 * 60_000, Math.max(10_000, Number.isFinite(ttl) ? ttl : 120_000));
}

function safeOutcome(value) {
  const text = String(value || "completed").toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,120}$/.test(text) ? text : "completed";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}
