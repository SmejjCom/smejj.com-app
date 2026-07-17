import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const ALGORITHM = "aes-256-gcm";
const memoryStore = new Map();

export function providerCredentialEncryptionConfig(env = process.env) {
  const keyId = String(env.SMEJJ_PROVIDER_CREDENTIAL_KEY_ID || "").trim();
  const encoded = String(env.SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 || "").trim();
  const key = decode32ByteKey(encoded);
  const ready = Boolean(key && isKeyId(keyId));
  const previousKeyId = String(env.SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_ID || "").trim();
  const previousKey = decode32ByteKey(String(env.SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_B64 || "").trim());
  const previousReady = Boolean(ready && previousKey && isKeyId(previousKeyId) && previousKeyId !== keyId);
  return {
    ready,
    keyId: ready ? keyId : "",
    key: ready ? key : null,
    previousKeyId: previousReady ? previousKeyId : "",
    previousKey: previousReady ? previousKey : null,
    algorithm: "AES-256-GCM"
  };
}

export function encryptProviderCredential(record, config, randomBytes = crypto.randomBytes) {
  if (!config?.ready || !Buffer.isBuffer(config.key) || config.key.length !== 32) {
    throw new Error("provider_credential_encryption_not_configured");
  }
  const providerId = safeProviderId(record?.providerId);
  const subjectId = safeSubjectId(record?.subjectId);
  if (!providerId || !subjectId) throw new Error("provider_credential_scope_invalid");
  const iv = randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error("provider_credential_iv_invalid");
  const aad = `smejj.com-provider-credential-v1:${config.keyId}:${subjectId}:${providerId}`;
  const plaintext = Buffer.from(JSON.stringify({ ...record, providerId, subjectId }), "utf8");
  const cipher = crypto.createCipheriv(ALGORITHM, config.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    envelopeVersion: 1,
    algorithm: "AES-256-GCM",
    keyId: config.keyId,
    providerId,
    subjectId,
    aad,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptProviderCredential(envelope, config) {
  if (!config?.ready || !Buffer.isBuffer(config.key) || config.key.length !== 32) {
    throw new Error("provider_credential_encryption_not_configured");
  }
  const providerId = safeProviderId(envelope?.providerId);
  const subjectId = safeSubjectId(envelope?.subjectId);
  const envelopeKeyId = String(envelope?.keyId || "");
  const decryptionKey = envelopeKeyId === config.keyId
    ? config.key
    : (config.previousKey && envelopeKeyId === config.previousKeyId ? config.previousKey : null);
  const aad = `smejj.com-provider-credential-v1:${envelopeKeyId}:${subjectId}:${providerId}`;
  if (envelope?.algorithm !== "AES-256-GCM" || !decryptionKey || envelope?.aad !== aad) {
    throw new Error("provider_credential_envelope_invalid");
  }
  const iv = Buffer.from(String(envelope.iv || ""), "base64");
  const authTag = Buffer.from(String(envelope.authTag || ""), "base64");
  if (iv.length !== 12 || authTag.length !== 16) throw new Error("provider_credential_envelope_invalid");
  const decipher = crypto.createDecipheriv(ALGORITHM, decryptionKey, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(envelope.ciphertext || ""), "base64")),
    decipher.final()
  ]);
  const record = JSON.parse(plaintext.toString("utf8"));
  if (record.providerId !== providerId || record.subjectId !== subjectId) {
    throw new Error("provider_credential_scope_mismatch");
  }
  return record;
}

export async function putProviderCredential(subjectId, providerId, record, env = process.env) {
  const subject = safeSubjectId(subjectId);
  const provider = safeProviderId(providerId);
  if (!subject || !provider) throw new Error("provider_credential_scope_invalid");
  const config = providerCredentialEncryptionConfig(env);
  const envelope = encryptProviderCredential({ ...record, subjectId: subject, providerId: provider }, config);
  const storage = idriveConfig(env);
  if (!storage) {
    if (!memoryFallbackAllowed(env)) throw new Error("provider_credential_storage_not_configured");
    memoryStore.set(memoryKey(subject, provider), envelope);
    return { ok: true, storage: "encrypted-memory", keyId: config.keyId };
  }
  await signedS3Put({
    ...storage,
    key: objectKey(subject, provider),
    body: `${JSON.stringify(envelope)}\n`,
    contentType: "application/json; charset=utf-8"
  });
  return { ok: true, storage: "idrive-e2-encrypted", keyId: config.keyId };
}

export async function getProviderCredential(subjectId, providerId, env = process.env) {
  const subject = safeSubjectId(subjectId);
  const provider = safeProviderId(providerId);
  if (!subject || !provider) return null;
  const config = providerCredentialEncryptionConfig(env);
  if (!config.ready) throw new Error("provider_credential_encryption_not_configured");
  const storage = idriveConfig(env);
  let envelope;
  if (!storage) {
    if (!memoryFallbackAllowed(env)) throw new Error("provider_credential_storage_not_configured");
    envelope = memoryStore.get(memoryKey(subject, provider));
    if (!envelope) return null;
  } else {
    const result = await signedS3Get({ ...storage, key: objectKey(subject, provider), allowNotFound: true });
    if (!result.ok && result.status === 404) return null;
    envelope = JSON.parse(result.body);
  }
  const record = decryptProviderCredential(envelope, config);
  if (envelope.keyId !== config.keyId) {
    await putProviderCredential(subject, provider, record, env).catch(() => {});
  }
  return record;
}

export async function disableProviderCredential(subjectId, providerId, env = process.env) {
  return putProviderCredential(subjectId, providerId, {
    enabled: false,
    apiKey: "",
    selectedModel: "",
    keyLast4: "",
    updatedAt: new Date().toISOString()
  }, env);
}

export function __clearProviderCredentialMemoryForTests() {
  memoryStore.clear();
}

function objectKey(subjectId, providerId) {
  const subjectHash = crypto.createHash("sha256").update(subjectId).digest("hex");
  return `auth/provider-credentials/${subjectHash}/${providerId}.json.enc`;
}

function memoryKey(subjectId, providerId) {
  return `${subjectId}:${providerId}`;
}

function memoryFallbackAllowed(env) {
  return String(env.SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY || "").trim().toUpperCase() === "YES";
}

function isKeyId(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/.test(String(value || ""));
}

function idriveConfig(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function safeProviderId(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z][a-z0-9-]{1,40}$/.test(text) ? text : "";
}

function safeSubjectId(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,120}$/.test(text) ? text : "";
}

function decode32ByteKey(encoded) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 && key.toString("base64") === encoded ? key : null;
}
