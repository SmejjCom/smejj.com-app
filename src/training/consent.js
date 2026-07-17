import crypto from "node:crypto";
import { canonicalJson } from "./sanitize.js";

const RESOLVED_DECISION = Symbol("smejj.com.resolved-training-consent");
const ENTRY_TYPES = new Set(["grant", "revoke", "revocation-sentinel"]);
const ID_PATTERN = /^[a-z][a-z0-9._:-]{7,120}$/;
const SUBJECT_REF_PATTERN = /^sub_[a-f0-9]{64}$/;
const REPOSITORY_REF_PATTERN = /^repo_[a-f0-9]{64}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CONSENT_DECISION_MAX_AGE_MS = 60_000;
export const CONSENT_DECISION_FUTURE_SKEW_MS = 5_000;

export function trainingConsentConfig(env = process.env) {
  const signingKeyId = safeKeyId(env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID);
  const bindingKeyId = safeKeyId(env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID);
  const signingKey = decode32ByteKey(env.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64);
  const bindingKey = decode32ByteKey(env.SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64);
  const otherKeyIds = [
    safeKeyId(env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID),
    safeKeyId(env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID),
    safeKeyId(env.SMEJJ_TRAINING_EVIDENCE_SIGNING_KEY_ID),
    safeKeyId(env.SMEJJ_TRAINING_RECORD_PROOF_SIGNING_KEY_ID)
  ].filter(Boolean);
  const otherKeys = [
    decode32ByteKey(env.SMEJJ_TRAINING_ENCRYPTION_KEY_B64),
    decode32ByteKey(env.SMEJJ_TRAINING_FINGERPRINT_KEY_B64)
  ].filter(Boolean);
  const privacyNoticeSha256 = String(env.SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256 || "").trim().toLowerCase();
  const separated = Boolean(
    signingKey && bindingKey &&
    signingKeyId && bindingKeyId &&
    signingKeyId !== bindingKeyId &&
    !otherKeyIds.includes(signingKeyId) &&
    !otherKeyIds.includes(bindingKeyId) &&
    !crypto.timingSafeEqual(signingKey, bindingKey) &&
    !otherKeys.some((key) => crypto.timingSafeEqual(signingKey, key) || crypto.timingSafeEqual(bindingKey, key))
  );
  const ready = separated && HASH_PATTERN.test(privacyNoticeSha256);
  return Object.freeze({
    ready,
    signingKeyId: ready ? signingKeyId : "",
    bindingKeyId: ready ? bindingKeyId : "",
    signingKey: ready ? signingKey : null,
    bindingKey: ready ? bindingKey : null,
    privacyNoticeSha256: ready ? privacyNoticeSha256 : "",
    algorithm: "HMAC-SHA-256",
    keySeparationVerified: separated
  });
}

export function bindConsentScope({ subjectId, repository, privacyNoticeSha256 }, config) {
  assertReadyConfig(config);
  const subject = normalizeSubject(subjectId);
  const canonicalRepository = normalizeRepository(repository);
  const noticeHash = normalizeHash(privacyNoticeSha256);
  return Object.freeze({
    subjectRef: opaqueRef("sub", `subject\0${subject}`, config.bindingKey),
    repositoryRef: opaqueRef("repo", `repository\0${canonicalRepository}`, config.bindingKey),
    privacyNoticeSha256: noticeHash
  });
}

export function createConsentGrant({
  subjectId,
  repository,
  privacyNoticeSha256,
  captureReviewConsent,
  modelTrainingConsent,
  sourceRightsConfirmed
}, {
  config,
  now = new Date().toISOString(),
  randomUUID = crypto.randomUUID
} = {}) {
  assertReadyConfig(config);
  if (normalizeHash(privacyNoticeSha256) !== config.privacyNoticeSha256) {
    throw new Error("consent_privacy_notice_not_current");
  }
  if (captureReviewConsent !== true || modelTrainingConsent !== true || sourceRightsConfirmed !== true) {
    throw new Error("consent_explicit_scope_required");
  }
  const scope = bindConsentScope({ subjectId, repository, privacyNoticeSha256 }, config);
  const consentId = uniqueId("consent", randomUUID);
  const withdrawalId = uniqueId("withdrawal", randomUUID);
  const event = baseEntry({
    ...scope,
    eventType: "grant",
    eventId: uniqueId("event", randomUUID),
    consentId,
    withdrawalId,
    occurredAt: validTimestamp(now),
    supersedesEventId: null,
    scope: consentScope(true),
    config
  });
  return signEntry(event, config);
}

export function createConsentRevocation({ grant, subjectId, repository }, {
  config,
  now = new Date().toISOString(),
  randomUUID = crypto.randomUUID
} = {}) {
  assertReadyConfig(config);
  if (!verifyConsentEntry(grant, config) || grant.eventType !== "grant") {
    throw new Error("consent_verified_grant_required");
  }
  const scope = bindConsentScope({
    subjectId,
    repository,
    privacyNoticeSha256: grant.privacyNoticeSha256
  }, config);
  if (!sameScope(grant, scope)) throw new Error("consent_scope_mismatch");
  const occurredAt = validTimestamp(now);
  const event = signEntry(baseEntry({
    ...scope,
    eventType: "revoke",
    eventId: uniqueId("event", randomUUID),
    consentId: grant.consentId,
    withdrawalId: grant.withdrawalId,
    occurredAt,
    supersedesEventId: grant.eventId,
    scope: consentScope(false),
    config
  }), config);
  const sentinel = signEntry(baseEntry({
    ...scope,
    eventType: "revocation-sentinel",
    eventId: uniqueId("sentinel", randomUUID),
    consentId: grant.consentId,
    withdrawalId: grant.withdrawalId,
    occurredAt,
    supersedesEventId: event.eventId,
    scope: consentScope(false),
    config
  }), config);
  return Object.freeze({ event, sentinel });
}

/**
 * Pure, deterministic resolution over an append-only ledger snapshot.
 * Revocation always wins. Invalid/tampered entries deny the entire scope.
 */
export function consentDecision({ entries = [], scope }, {
  config,
  now = new Date().toISOString()
} = {}) {
  const expected = normalizeScope(scope);
  const ledgerEntries = Array.isArray(entries) ? [...entries] : [];
  const ledgerDigest = crypto.createHash("sha256")
    .update(canonicalJson(ledgerEntries.map(entryDigestMaterial).sort(compareEntryMaterial)))
    .digest("hex");
  if (!config?.ready) return resolvedDecision(deniedFacts(expected, "consent_key_configuration_invalid", ledgerDigest, now));
  if (ledgerEntries.length === 0) return resolvedDecision(deniedFacts(expected, "consent_grant_missing", ledgerDigest, now));

  const verified = [];
  for (const entry of ledgerEntries) {
    if (!verifyConsentEntry(entry, config) || !sameScope(entry, expected) || isFutureEntry(entry, now)) {
      return resolvedDecision(deniedFacts(expected, "consent_ledger_entry_invalid", ledgerDigest, now));
    }
    verified.push(entry);
  }
  verified.sort((left, right) => (
    String(left.occurredAt).localeCompare(String(right.occurredAt)) ||
    String(left.eventId).localeCompare(String(right.eventId))
  ));
  const revocation = [...verified].reverse().find((entry) => (
    entry.eventType === "revoke" || entry.eventType === "revocation-sentinel"
  ));
  if (revocation) {
    return resolvedDecision({
      ...decisionBase(expected, ledgerDigest, now),
      verified: true,
      status: "revoked",
      captureAllowed: false,
      trainingAllowed: false,
      rightsConfirmed: false,
      recordedBy: "authenticated-human",
      evidenceId: revocation.eventId,
      consentId: revocation.consentId,
      withdrawalId: revocation.withdrawalId,
      reasons: ["consent_revoked"]
    });
  }
  const grant = [...verified].reverse().find((entry) => entry.eventType === "grant");
  if (!grant) return resolvedDecision(deniedFacts(expected, "consent_grant_missing", ledgerDigest, now));
  return resolvedDecision({
    ...decisionBase(expected, ledgerDigest, now),
    verified: true,
    status: "granted",
    captureAllowed: grant.scope.captureReview === true,
    trainingAllowed: grant.scope.modelTraining === true,
    rightsConfirmed: grant.scope.sourceRightsConfirmed === true,
    recordedBy: grant.recordedBy,
    evidenceId: grant.eventId,
    consentId: grant.consentId,
    withdrawalId: grant.withdrawalId,
    reasons: []
  });
}

export function verifyConsentEntry(entry, config) {
  if (!config?.ready || !validEntryShape(entry, config)) return false;
  const expected = signPayload(unsignedEntry(entry), config.signingKey);
  return sameText(expected, entry.signature);
}

export function isResolvedConsentDecision(value) {
  return Boolean(value?.[RESOLVED_DECISION] === true);
}

/** A resolved decision is authorization evidence only for a short, bounded window. */
export function isFreshResolvedConsentDecision(value, {
  now = new Date().toISOString(),
  maxAgeMs = CONSENT_DECISION_MAX_AGE_MS,
  futureSkewMs = CONSENT_DECISION_FUTURE_SKEW_MS
} = {}) {
  if (!isResolvedConsentDecision(value)) return false;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > CONSENT_DECISION_MAX_AGE_MS) return false;
  if (!Number.isSafeInteger(futureSkewMs) || futureSkewMs < 0 || futureSkewMs > CONSENT_DECISION_FUTURE_SKEW_MS) return false;
  const nowMs = Date.parse(String(now || ""));
  const resolvedAtMs = Date.parse(String(value.resolvedAt || ""));
  if (!Number.isFinite(nowMs) || !Number.isFinite(resolvedAtMs)) return false;
  const ageMs = nowMs - resolvedAtMs;
  return ageMs >= -futureSkewMs && ageMs <= maxAgeMs;
}

export function consentDecisionReference(value) {
  if (!isResolvedConsentDecision(value)) return null;
  const reference = {};
  for (const key of [
    "verified", "status", "captureAllowed", "trainingAllowed", "rightsConfirmed",
    "recordedBy", "evidenceId", "consentId", "withdrawalId", "subjectRef",
    "repositoryRef", "privacyNoticeSha256", "ledgerDigest", "resolvedAt"
  ]) reference[key] = value[key] ?? null;
  reference.reasons = [...(value.reasons || [])];
  return Object.freeze(reference);
}

export function consentDecisionMatchesReference(decision, reference) {
  const resolved = consentDecisionReference(decision);
  if (!resolved || !reference) return false;
  if (!Number.isFinite(Date.parse(String(resolved.resolvedAt || ""))) ||
      !Number.isFinite(Date.parse(String(reference.resolvedAt || "")))) return false;
  const stableResolved = { ...resolved };
  const stableReference = { ...reference };
  delete stableResolved.resolvedAt;
  delete stableReference.resolvedAt;
  return canonicalJson(stableResolved) === canonicalJson(stableReference);
}

export function authenticatedConsentSubject(user) {
  const value = user?.userId || user?.sub || user?.email;
  return normalizeSubject(value);
}

function baseEntry({
  eventType, eventId, subjectRef, repositoryRef, privacyNoticeSha256,
  consentId, withdrawalId, occurredAt, supersedesEventId, scope, config
}) {
  return {
    schemaVersion: 1,
    eventId,
    eventType,
    subjectRef,
    repositoryRef,
    privacyNoticeSha256,
    consentId,
    withdrawalId,
    occurredAt,
    recordedBy: "authenticated-human",
    signingKeyId: config.signingKeyId,
    bindingKeyId: config.bindingKeyId,
    supersedesEventId,
    scope
  };
}

function signEntry(entry, config) {
  return Object.freeze({ ...entry, signature: signPayload(entry, config.signingKey) });
}

function signPayload(value, key) {
  return crypto.createHmac("sha256", key).update(canonicalJson(value)).digest("base64url");
}

function unsignedEntry(entry) {
  const copy = { ...entry };
  delete copy.signature;
  return copy;
}

function validEntryShape(entry, config) {
  if (!entry || typeof entry !== "object" || entry.schemaVersion !== 1) return false;
  if (!ENTRY_TYPES.has(entry.eventType) || !ID_PATTERN.test(String(entry.eventId || ""))) return false;
  if (!SUBJECT_REF_PATTERN.test(String(entry.subjectRef || "")) ||
      !REPOSITORY_REF_PATTERN.test(String(entry.repositoryRef || ""))) return false;
  if (!HASH_PATTERN.test(String(entry.privacyNoticeSha256 || ""))) return false;
  if (!ID_PATTERN.test(String(entry.consentId || "")) || !ID_PATTERN.test(String(entry.withdrawalId || ""))) return false;
  if (!validTimestampOrNull(entry.occurredAt) || entry.recordedBy !== "authenticated-human") return false;
  if (entry.signingKeyId !== config.signingKeyId || entry.bindingKeyId !== config.bindingKeyId) return false;
  if (!SIGNATURE_PATTERN.test(String(entry.signature || ""))) return false;
  if (entry.supersedesEventId !== null && !ID_PATTERN.test(String(entry.supersedesEventId || ""))) return false;
  const shouldGrant = entry.eventType === "grant";
  return entry.scope?.captureReview === shouldGrant &&
    entry.scope?.modelTraining === shouldGrant &&
    entry.scope?.sourceRightsConfirmed === shouldGrant &&
    Object.keys(entry.scope || {}).length === 3;
}

function resolvedDecision(facts) {
  const result = { ...facts };
  Object.defineProperty(result, RESOLVED_DECISION, { value: true, enumerable: false });
  return Object.freeze(result);
}

function deniedFacts(scope, reason, ledgerDigest, now) {
  return {
    ...decisionBase(scope, ledgerDigest, now),
    verified: false,
    status: "denied",
    captureAllowed: false,
    trainingAllowed: false,
    rightsConfirmed: false,
    recordedBy: null,
    evidenceId: null,
    consentId: null,
    withdrawalId: null,
    reasons: [reason]
  };
}

function decisionBase(scope, ledgerDigest, now) {
  return {
    subjectRef: scope.subjectRef,
    repositoryRef: scope.repositoryRef,
    privacyNoticeSha256: scope.privacyNoticeSha256,
    ledgerDigest,
    resolvedAt: validTimestamp(now)
  };
}

function normalizeScope(scope) {
  const normalized = {
    subjectRef: String(scope?.subjectRef || ""),
    repositoryRef: String(scope?.repositoryRef || ""),
    privacyNoticeSha256: String(scope?.privacyNoticeSha256 || "").toLowerCase()
  };
  if (!SUBJECT_REF_PATTERN.test(normalized.subjectRef) || !REPOSITORY_REF_PATTERN.test(normalized.repositoryRef) ||
      !HASH_PATTERN.test(normalized.privacyNoticeSha256)) throw new Error("consent_scope_invalid");
  return Object.freeze(normalized);
}

function sameScope(left, right) {
  return left?.subjectRef === right?.subjectRef &&
    left?.repositoryRef === right?.repositoryRef &&
    left?.privacyNoticeSha256 === right?.privacyNoticeSha256;
}

function consentScope(granted) {
  return Object.freeze({
    captureReview: granted,
    modelTraining: granted,
    sourceRightsConfirmed: granted
  });
}

function entryDigestMaterial(entry) {
  return {
    eventId: String(entry?.eventId || ""),
    eventType: String(entry?.eventType || ""),
    signature: String(entry?.signature || "")
  };
}

function compareEntryMaterial(left, right) {
  return canonicalJson(left).localeCompare(canonicalJson(right));
}

function isFutureEntry(entry, now) {
  return Date.parse(entry.occurredAt) > Date.parse(validTimestamp(now)) + 5 * 60 * 1000;
}

function opaqueRef(prefix, value, key) {
  return `${prefix}_${crypto.createHmac("sha256", key).update(value).digest("hex")}`;
}

function normalizeSubject(value) {
  const subject = String(value || "").normalize("NFKC").trim();
  if (subject.length < 3 || subject.length > 240 || /[\u0000-\u001f\u007f]/.test(subject)) {
    throw new Error("consent_authenticated_subject_invalid");
  }
  return subject.includes("@") ? subject.toLowerCase() : subject;
}

function normalizeRepository(value) {
  const input = String(value || "").normalize("NFKC").trim();
  if (!input || input.length > 500 || /[\u0000-\u001f\u007f\\]/.test(input)) {
    throw new Error("consent_repository_invalid");
  }
  if (/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(input)) return `github.com/${input.toLowerCase().replace(/\.git$/, "")}`;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("consent_repository_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("consent_repository_invalid");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  if (!/^\/[a-z0-9._~!$&'()+,;=:@%-]+\/[a-z0-9._~!$&'()+,;=:@%-]+(?:\/[a-z0-9._~!$&'()+,;=:@%-]+)*$/i.test(path) ||
      path.split("/").includes("..")) throw new Error("consent_repository_invalid");
  return `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}${path}`;
}

function normalizeHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(hash)) throw new Error("consent_privacy_notice_hash_invalid");
  return hash;
}

function uniqueId(prefix, randomUUID) {
  const uuid = String(randomUUID()).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uuid)) {
    throw new Error("consent_random_id_invalid");
  }
  return `${prefix}:${uuid}`;
}

function safeKeyId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/.test(id) ? id : "";
}

function decode32ByteKey(value) {
  const encoded = String(value || "").trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 && key.toString("base64") === encoded ? key : null;
}

function assertReadyConfig(config) {
  if (!config?.ready || !Buffer.isBuffer(config.signingKey) || !Buffer.isBuffer(config.bindingKey)) {
    throw new Error("consent_key_configuration_invalid");
  }
}

function validTimestamp(value) {
  const text = String(value || "");
  if (!validTimestampOrNull(text)) throw new Error("consent_timestamp_invalid");
  return new Date(text).toISOString();
}

function validTimestampOrNull(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 35 && Number.isFinite(Date.parse(value));
}

function sameText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
