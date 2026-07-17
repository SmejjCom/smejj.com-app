// smejj.com control-server — immutable consent ledger on the IDrive e2 Object Brain.
import {
  consentDecision,
  verifyConsentEntry
} from "../../../src/training/consent.js";
import {
  createConditionalIdriveWriter,
  createImmutableTrainingObject,
  readTrainingIdriveConfig
} from "../../../src/training/idrive-conditional-writer.js";
import {
  parseS3Keys,
  signedS3Get,
  signedS3List
} from "../storage/s3Signer.js";

const ROOT = "training/consents/v1";
const MAX_LEDGER_ENTRIES = 200;
const MAX_ENTRY_BYTES = 32_000;

export function createImmutableConsentLedger({
  config,
  putImmutable,
  listObjects,
  getObject
} = {}) {
  if (!config?.ready) throw new Error("consent_key_configuration_invalid");
  if (typeof putImmutable !== "function" || typeof listObjects !== "function" || typeof getObject !== "function") {
    throw new Error("consent_ledger_storage_required");
  }

  return Object.freeze({
    async appendGrant(entry) {
      assertEntry(entry, "grant", config);
      const key = eventKey(entry);
      await immutablePut(key, entry, putImmutable);
      return { ok: true, immutable: true, keys: [key] };
    },

    async appendRevocation({ event, sentinel }) {
      assertEntry(event, "revoke", config);
      assertEntry(sentinel, "revocation-sentinel", config);
      if (!sameRevocation(event, sentinel)) throw new Error("consent_revocation_pair_invalid");
      const eventObjectKey = eventKey(event);
      const sentinelObjectKey = revocationKey(sentinel);
      // The revoke event is written first so even a later sentinel failure keeps
      // the scope denied when the ledger is resolved again.
      await immutablePut(eventObjectKey, event, putImmutable);
      await immutablePut(sentinelObjectKey, sentinel, putImmutable);
      return { ok: true, immutable: true, keys: [eventObjectKey, sentinelObjectKey] };
    },

    async readEntries(scope) {
      const prefix = scopePrefix(scope);
      const keys = [...new Set(await listObjects(`${prefix}/`))].sort();
      if (keys.length > MAX_LEDGER_ENTRIES) throw new Error("consent_ledger_entry_limit_exceeded");
      if (keys.some((key) => !isScopedLedgerKey(key, prefix))) throw new Error("consent_ledger_key_invalid");
      const entries = [];
      for (const key of keys) {
        const body = String(await getObject(key));
        if (Buffer.byteLength(body, "utf8") > MAX_ENTRY_BYTES) throw new Error("consent_ledger_entry_too_large");
        let entry;
        try {
          entry = JSON.parse(body);
        } catch {
          throw new Error("consent_ledger_entry_json_invalid");
        }
        entries.push(entry);
      }
      return entries;
    },

    async resolve(scope, { now } = {}) {
      const entries = await this.readEntries(scope);
      return consentDecision({ entries, scope }, { config, now });
    },

    async findGrant(scope, withdrawalId) {
      const entries = await this.readEntries(scope);
      return entries.find((entry) => (
        entry?.eventType === "grant" &&
        entry?.withdrawalId === withdrawalId &&
        entry?.subjectRef === scope?.subjectRef &&
        entry?.repositoryRef === scope?.repositoryRef &&
        entry?.privacyNoticeSha256 === scope?.privacyNoticeSha256 &&
        verifyConsentEntry(entry, config)
      )) || null;
    }
  });
}

export function createIdriveConsentLedger(env = process.env, { config, fetchImpl } = {}) {
  if (!config?.ready) throw new Error("consent_key_configuration_invalid");
  const s3 = readTrainingIdriveConfig(env);
  if (!s3.allowedPrefixes.some((prefix) => `${ROOT}/`.startsWith(prefix))) {
    throw new Error("consent_idrive_prefix_not_allowed");
  }
  const request = fetchImpl ? { fetchImpl } : {};
  const writer = createConditionalIdriveWriter(s3, request);
  return createImmutableConsentLedger({
    config,
    putImmutable: writer.putObject,
    listObjects: async (prefix) => {
      const { response, body } = await signedS3List({ ...s3, ...request, prefix });
      if (!response?.ok) throw new Error(`consent_idrive_list_failed:${response?.status || 0}`);
      return parseS3Keys(body);
    },
    getObject: async (key) => {
      const result = await signedS3Get({ ...s3, ...request, key });
      return result.body;
    }
  });
}

export function consentLedgerObjectKeys(entry) {
  assertSafeRefs(entry);
  return Object.freeze({
    event: eventKey(entry),
    revocation: revocationKey(entry)
  });
}

async function immutablePut(key, entry, putImmutable) {
  const result = await putImmutable(createImmutableTrainingObject({
    key,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(entry, null, 2)}\n`,
    statusLast: false
  }));
  if (result?.conditionEnforced !== true || result?.contentVerified !== true) {
    throw new Error(`consent_immutable_condition_not_proven:${key}`);
  }
  if (result?.created !== true) throw new Error(`consent_immutable_object_exists:${key}`);
}

function eventKey(entry) {
  return `${scopePrefix(entry)}/events/${entry.eventId}.json`;
}

function revocationKey(entry) {
  return `${scopePrefix(entry)}/revocations/${entry.withdrawalId}.json`;
}

function scopePrefix(scope) {
  assertSafeRefs(scope);
  return `${ROOT}/${scope.subjectRef}/${scope.repositoryRef}/${scope.privacyNoticeSha256}`;
}

function isScopedLedgerKey(key, prefix) {
  const suffix = String(key).slice(prefix.length + 1);
  return String(key).startsWith(`${prefix}/`) && (
    /^events\/[a-z][a-z0-9._:-]{7,120}\.json$/.test(suffix) ||
    /^revocations\/[a-z][a-z0-9._:-]{7,120}\.json$/.test(suffix)
  );
}

function assertEntry(entry, expectedType, config) {
  if (entry?.eventType !== expectedType || !verifyConsentEntry(entry, config)) {
    throw new Error(`consent_${expectedType}_entry_invalid`);
  }
}

function assertSafeRefs(value) {
  if (!/^sub_[a-f0-9]{64}$/.test(String(value?.subjectRef || "")) ||
      !/^repo_[a-f0-9]{64}$/.test(String(value?.repositoryRef || "")) ||
      !/^[a-f0-9]{64}$/.test(String(value?.privacyNoticeSha256 || ""))) {
    throw new Error("consent_ledger_scope_invalid");
  }
}

function sameRevocation(event, sentinel) {
  return event.subjectRef === sentinel.subjectRef &&
    event.repositoryRef === sentinel.repositoryRef &&
    event.privacyNoticeSha256 === sentinel.privacyNoticeSha256 &&
    event.consentId === sentinel.consentId &&
    event.withdrawalId === sentinel.withdrawalId &&
    event.eventId === sentinel.supersedesEventId;
}
