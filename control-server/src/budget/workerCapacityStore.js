import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const HEAD_KEY = "jobs/capacity/salad-ephemeral.json";
const JSON_TYPE = "application/json; charset=utf-8";
const RECORD_TYPE = "smejj.com-global-worker-capacity";
const MAX_CAS_ATTEMPTS = 8;

export function createWorkerCapacityStore({
  env = process.env,
  getObject,
  putObject,
  nowMs = () => Date.now()
} = {}) {
  const config = idriveConfig(env);
  const policy = capacityPolicy(env);
  const reader = getObject || ((key) => signedS3Get({ ...config, key, allowNotFound: true }));
  const writer = putObject || ((object) => signedS3Put({ ...config, ...object }));

  async function acquire(job, watchdogLease) {
    if (!config.ok || !policy.ok || !validJob(job) || !validWatchdogLease(watchdogLease)) {
      return failure("global_worker_capacity_configuration_invalid");
    }
    if (Number(watchdogLease.budgetUsd) <= 0 || Number(watchdogLease.budgetUsd) > policy.maxGlobalReservedUsd) {
      return failure("global_worker_capacity_budget_invalid");
    }
    const at = nowMs();
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = await readHead(reader);
      if (!current.ok) return current;
      if (current.value && !samePolicy(current.value, policy)) return failure("global_worker_capacity_policy_mismatch");
      const existing = current.value?.slots.find((slot) => slot.jobId === job.id && slot.watchdogLeaseId === watchdogLease.leaseId);
      if (existing) {
        const audit = await appendAudit(writer, reader, job, existing);
        return audit.ok
          ? { ok: true, idempotent: true, lease: publicLease(existing), audit, snapshot: publicSnapshot(current.value) }
          : audit;
      }
      const state = current.value || emptyState(policy, at);
      const reservedUsd = state.slots.reduce((sum, slot) => sum + slot.budgetUsd, 0);
      if (state.slots.length >= policy.maxConcurrentWorkers) {
        return failure("global_worker_capacity_slots_exhausted", { snapshot: publicSnapshot(state) });
      }
      if (reservedUsd + Number(watchdogLease.budgetUsd) > policy.maxGlobalReservedUsd + Number.EPSILON) {
        return failure("global_worker_capacity_budget_exhausted", { snapshot: publicSnapshot(state) });
      }
      const slot = Object.freeze({
        capacityId: `capacity_${crypto.randomUUID()}`,
        jobId: job.id,
        ownerId: job.userId,
        taskCapsuleRoot: job.taskCapsule.rootPrefix,
        groupName: watchdogLease.groupName,
        watchdogLeaseId: watchdogLease.leaseId,
        budgetUsd: Number(watchdogLease.budgetUsd),
        claimedAt: new Date(at).toISOString(),
        deadlineAt: new Date(watchdogLease.deadlineAt).toISOString(),
        acquiredRevision: state.revision + 1,
        activeSlotsAfterAcquire: state.slots.length + 1,
        reservedUsdAfterAcquire: Number((reservedUsd + Number(watchdogLease.budgetUsd)).toFixed(8))
      });
      const next = nextState(state, [...state.slots, slot], at);
      const written = await compareAndWrite(writer, reader, next, current);
      if (written.reason === "global_worker_capacity_race_lost") continue;
      if (!written.ok) return written;
      const audit = await appendAudit(writer, reader, job, slot);
      if (!audit.ok) return audit;
      return { ok: true, idempotent: false, lease: publicLease(slot), audit, snapshot: publicSnapshot(next) };
    }
    return failure("global_worker_capacity_contention");
  }

  async function release(job, lease, stopEvidence) {
    if (!config.ok || !validJob(job) || !validCapacityLease(lease)) {
      return failure("global_worker_capacity_configuration_invalid");
    }
    const proof = normalizeStopEvidence(stopEvidence);
    if (!proof) return failure("global_worker_capacity_stop_proof_required");
    const at = nowMs();
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = await readHead(reader);
      if (!current.ok) return current;
      const slot = current.value?.slots.find((item) => item.capacityId === lease.capacityId);
      if (!slot) return { ok: true, idempotent: true, lease, snapshot: publicSnapshot(current.value || emptyState(policy, at)) };
      if (!matchingLease(slot, lease) || slot.jobId !== job.id || slot.ownerId !== job.userId) {
        return failure("global_worker_capacity_lease_lost");
      }
      const audit = await appendReleaseAuthorization(writer, reader, job, slot, proof);
      if (!audit.ok) return audit;
      const next = nextState(current.value, current.value.slots.filter((item) => item.capacityId !== slot.capacityId), at);
      const written = await compareAndWrite(writer, reader, next, current);
      if (written.reason === "global_worker_capacity_race_lost") continue;
      if (!written.ok) return written;
      return { ok: true, idempotent: false, lease: publicLease(slot), audit, snapshot: publicSnapshot(next) };
    }
    return failure("global_worker_capacity_contention");
  }

  async function snapshot() {
    if (!config.ok || !policy.ok) return failure("global_worker_capacity_configuration_invalid");
    const current = await readHead(reader);
    if (!current.ok) return current;
    return { ok: true, snapshot: publicSnapshot(current.value || emptyState(policy, nowMs())) };
  }

  async function releaseRecovered(watchdogLease, stopEvidence) {
    if (!config.ok || !validWatchdogLease(watchdogLease)) {
      return failure("global_worker_capacity_configuration_invalid");
    }
    const current = await readHead(reader);
    if (!current.ok) return current;
    const slot = current.value?.slots.find((item) => item.watchdogLeaseId === watchdogLease.leaseId
      && item.groupName === watchdogLease.groupName);
    if (!slot) return { ok: true, idempotent: true, recovered: true };
    return release({
      id: slot.jobId,
      userId: slot.ownerId,
      taskCapsule: { rootPrefix: slot.taskCapsuleRoot }
    }, publicLease(slot), stopEvidence);
  }

  return { acquire, release, releaseRecovered, snapshot, policy };
}

async function readHead(reader) {
  try {
    const result = await reader(HEAD_KEY);
    if (result?.status === 404) return { ok: true, value: null, etag: "" };
    if (result?.ok !== true || !result.etag) return failure("global_worker_capacity_head_read_failed");
    const value = JSON.parse(String(result.body || ""));
    if (!validState(value)) return failure("global_worker_capacity_head_invalid");
    return { ok: true, value, etag: result.etag };
  } catch {
    return failure("global_worker_capacity_head_read_failed");
  }
}

async function compareAndWrite(writer, reader, state, current) {
  const body = `${JSON.stringify(state, null, 2)}\n`;
  const object = {
    key: HEAD_KEY,
    body,
    contentType: JSON_TYPE,
    ...(current.value ? { ifMatch: current.etag } : { ifNoneMatch: "*" })
  };
  let result;
  try {
    result = await writer(object);
  } catch {
    return failure("global_worker_capacity_head_write_failed");
  }
  if (result?.status === 412) return failure("global_worker_capacity_race_lost");
  if (result?.ok !== true || result?.conditionEnforced !== true) {
    return failure("global_worker_capacity_cas_not_enforced");
  }
  const readback = await readHead(reader);
  if (!readback.ok || JSON.stringify(readback.value) !== JSON.stringify(state)) {
    return failure("global_worker_capacity_readback_mismatch");
  }
  return { ok: true, etag: readback.etag };
}

async function appendAudit(writer, reader, job, slot) {
  const key = `${job.taskCapsule.rootPrefix}capacity/${String(slot.acquiredRevision).padStart(8, "0")}-acquired-${slot.capacityId}.json`;
  const record = {
    schemaVersion: 1,
    recordType: "smejj.com-global-worker-capacity-event",
    event: "acquired",
    revision: slot.acquiredRevision,
    jobId: slot.jobId,
    capacityId: slot.capacityId,
    groupName: slot.groupName,
    watchdogLeaseId: slot.watchdogLeaseId,
    budgetUsd: slot.budgetUsd,
    activeSlotsAfter: slot.activeSlotsAfterAcquire,
    reservedUsdAfter: slot.reservedUsdAfterAcquire,
    stopEvidence: null,
    createdAt: slot.claimedAt
  };
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const object = { key, body, contentType: JSON_TYPE, ifNoneMatch: "*" };
  try {
    const created = await writer(object);
    const idempotent = created?.status === 412 && created?.conditionEnforced === true;
    if (!idempotent && (created?.ok !== true || created?.conditionEnforced !== true)) {
      return failure("global_worker_capacity_audit_create_failed");
    }
    if (!idempotent) {
      const proof = await writer(object);
      if (proof?.status !== 412 || proof?.conditionEnforced !== true) {
        return failure("global_worker_capacity_audit_overwrite_proof_failed");
      }
    }
    const readback = await reader(key);
    if (readback?.ok !== true || sha256(readback.body) !== sha256(body)) {
      return failure("global_worker_capacity_audit_readback_failed");
    }
    return { ok: true, key, sha256: sha256(body), proofStatus: 412, idempotent };
  } catch {
    return failure("global_worker_capacity_audit_write_failed");
  }
}

async function appendReleaseAuthorization(writer, reader, job, slot, stopEvidence) {
  const key = `${job.taskCapsule.rootPrefix}capacity/release-authorized-${slot.capacityId}.json`;
  const body = `${JSON.stringify({
    schemaVersion: 1,
    recordType: "smejj.com-global-worker-capacity-event",
    event: "release-authorized",
    jobId: slot.jobId,
    capacityId: slot.capacityId,
    groupName: slot.groupName,
    watchdogLeaseId: slot.watchdogLeaseId,
    budgetUsd: slot.budgetUsd,
    stopEvidence,
    createdAt: stopEvidence.completedAt
  }, null, 2)}\n`;
  const object = { key, body, contentType: JSON_TYPE, ifNoneMatch: "*" };
  try {
    const created = await writer(object);
    const idempotent = created?.status === 412 && created?.conditionEnforced === true;
    if (!idempotent && (created?.ok !== true || created?.conditionEnforced !== true)) {
      return failure("global_worker_capacity_release_audit_create_failed");
    }
    if (!idempotent) {
      const proof = await writer(object);
      if (proof?.status !== 412 || proof?.conditionEnforced !== true) {
        return failure("global_worker_capacity_release_audit_overwrite_proof_failed");
      }
    }
    const readback = await reader(key);
    if (readback?.ok !== true || sha256(readback.body) !== sha256(body)) {
      return failure("global_worker_capacity_release_audit_readback_failed");
    }
    return { ok: true, key, sha256: sha256(body), proofStatus: 412, idempotent };
  } catch {
    return failure("global_worker_capacity_release_audit_write_failed");
  }
}

function emptyState(policy, at) {
  return {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    revision: 0,
    maxConcurrentWorkers: policy.maxConcurrentWorkers,
    maxGlobalReservedUsd: policy.maxGlobalReservedUsd,
    slots: [],
    updatedAt: new Date(at).toISOString()
  };
}

function nextState(current, slots, at) {
  return {
    ...current,
    revision: current.revision + 1,
    slots: [...slots].sort((left, right) => left.capacityId.localeCompare(right.capacityId)),
    updatedAt: new Date(at).toISOString()
  };
}

function validState(value) {
  return value?.schemaVersion === 1
    && value.recordType === RECORD_TYPE
    && Number.isInteger(value.revision)
    && value.revision >= 0
    && Number.isInteger(value.maxConcurrentWorkers)
    && value.maxConcurrentWorkers >= 1
    && value.maxConcurrentWorkers <= 32
    && Number.isFinite(value.maxGlobalReservedUsd)
    && value.maxGlobalReservedUsd > 0
    && Array.isArray(value.slots)
    && value.slots.length <= value.maxConcurrentWorkers
    && value.slots.every(validSlot)
    && new Set(value.slots.map((slot) => slot.capacityId)).size === value.slots.length
    && reservedUsd(value) <= value.maxGlobalReservedUsd + Number.EPSILON
    && Number.isFinite(Date.parse(value.updatedAt));
}

function validSlot(slot) {
  return validCapacityId(slot?.capacityId)
    && validId(slot?.jobId)
    && validId(slot?.ownerId)
    && /^jobs\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{2}\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/$/.test(String(slot?.taskCapsuleRoot || ""))
    && /^[a-z][a-z0-9-]{1,62}$/.test(String(slot?.groupName || ""))
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,120}$/.test(String(slot?.watchdogLeaseId || ""))
    && Number.isFinite(slot?.budgetUsd)
    && slot.budgetUsd > 0
    && Number.isFinite(Date.parse(slot?.claimedAt))
    && Number.isFinite(Date.parse(slot?.deadlineAt))
    && Number.isInteger(slot?.acquiredRevision)
    && slot.acquiredRevision >= 1
    && Number.isInteger(slot?.activeSlotsAfterAcquire)
    && slot.activeSlotsAfterAcquire >= 1
    && Number.isFinite(slot?.reservedUsdAfterAcquire)
    && slot.reservedUsdAfterAcquire > 0;
}

function validJob(job) {
  return validId(job?.id)
    && validId(job?.userId)
    && /^jobs\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{2}\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}\/$/.test(String(job?.taskCapsule?.rootPrefix || ""));
}

function validWatchdogLease(lease) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,120}$/.test(String(lease?.leaseId || ""))
    && /^[a-z][a-z0-9-]{1,62}$/.test(String(lease?.groupName || ""))
    && Number.isFinite(Date.parse(lease?.deadlineAt))
    && Number.isFinite(Number(lease?.budgetUsd));
}

function validCapacityLease(lease) {
  return validCapacityId(lease?.capacityId)
    && validId(lease?.jobId)
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,120}$/.test(String(lease?.watchdogLeaseId || ""));
}

function matchingLease(slot, lease) {
  return slot.capacityId === lease.capacityId
    && slot.jobId === lease.jobId
    && slot.watchdogLeaseId === lease.watchdogLeaseId;
}

function normalizeStopEvidence(value) {
  if (value?.stopVerified !== true || value?.completionPersisted !== true) return null;
  const attempts = Number(value.stopAttempts ?? value.attempts ?? 0);
  const completedAt = new Date(value.completedAt || 0);
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10_000 || Number.isNaN(completedAt.getTime())) return null;
  return { stopVerified: true, completionPersisted: true, stopAttempts: attempts, completedAt: completedAt.toISOString() };
}

function capacityPolicy(env) {
  const maxConcurrentWorkers = Number(env.SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS);
  const maxGlobalReservedUsd = Number(env.SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD);
  const ok = Number.isSafeInteger(maxConcurrentWorkers)
    && maxConcurrentWorkers >= 1
    && maxConcurrentWorkers <= 32
    && Number.isFinite(maxGlobalReservedUsd)
    && maxGlobalReservedUsd > 0;
  return { ok, maxConcurrentWorkers, maxGlobalReservedUsd };
}

function samePolicy(state, policy) {
  return state.maxConcurrentWorkers === policy.maxConcurrentWorkers
    && state.maxGlobalReservedUsd === policy.maxGlobalReservedUsd;
}

function reservedUsd(state) {
  return Number(state.slots.reduce((sum, slot) => sum + Number(slot.budgetUsd), 0).toFixed(8));
}

function publicLease(slot) {
  return {
    capacityId: slot.capacityId,
    jobId: slot.jobId,
    watchdogLeaseId: slot.watchdogLeaseId,
    deadlineAt: slot.deadlineAt,
    budgetUsd: slot.budgetUsd
  };
}

function publicSnapshot(state) {
  return {
    revision: state.revision,
    activeSlots: state.slots.length,
    maxConcurrentWorkers: state.maxConcurrentWorkers,
    reservedUsd: reservedUsd(state),
    maxGlobalReservedUsd: state.maxGlobalReservedUsd,
    jobs: state.slots.map((slot) => ({ jobId: slot.jobId, groupName: slot.groupName, deadlineAt: slot.deadlineAt }))
  };
}

function validCapacityId(value) {
  return /^capacity_[a-f0-9-]{36}$/.test(String(value || ""));
}

function validId(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(value || ""));
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}
