import crypto from "node:crypto";
import { canonicalJson } from "./sanitize.js";

const ALGORITHM = "aes-256-gcm";

export function trainingEncryptionConfig(env = process.env) {
  const keyId = String(env.SMEJJ_TRAINING_ENCRYPTION_KEY_ID || "").trim();
  const encoded = String(env.SMEJJ_TRAINING_ENCRYPTION_KEY_B64 || "").trim();
  const key = decode32ByteKey(encoded);
  const ready = Boolean(keyId && key?.length === 32);
  return { ready, keyId: ready ? keyId : "", key: ready ? key : null, algorithm: ALGORITHM };
}

export function trainingFingerprintConfig(env = process.env) {
  const keyId = String(env.SMEJJ_TRAINING_FINGERPRINT_KEY_ID || "").trim();
  const encoded = String(env.SMEJJ_TRAINING_FINGERPRINT_KEY_B64 || "").trim();
  const key = decode32ByteKey(encoded);
  const ready = Boolean(keyId && key?.length === 32);
  return { ready, keyId: ready ? keyId : "", key: ready ? key : null, algorithm: "HMAC-SHA-256" };
}

export function encryptTrainingRecord(record, {
  key,
  keyId,
  randomBytes = crypto.randomBytes
} = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("training_encryption_key_invalid");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/.test(String(keyId || ""))) throw new Error("training_encryption_key_id_invalid");
  if (!record?.recordId) throw new Error("training_record_id_required");
  const plaintext = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const iv = randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error("training_encryption_iv_invalid");
  const aadValue = `smejj.com-training-v1:${keyId}:${record.recordId}`;
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aadValue, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    envelopeVersion: 1,
    algorithm: "AES-256-GCM",
    keyId,
    recordId: record.recordId,
    aad: aadValue,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    plaintextHmacSha256: crypto.createHmac("sha256", key).update(plaintext).digest("hex")
  };
}

export function decryptTrainingRecord(envelope, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("training_encryption_key_invalid");
  const expectedAad = `smejj.com-training-v1:${envelope?.keyId}:${envelope?.recordId}`;
  if (envelope?.algorithm !== "AES-256-GCM" || envelope?.aad !== expectedAad) {
    throw new Error("training_envelope_metadata_invalid");
  }
  const iv = Buffer.from(String(envelope.iv || ""), "base64");
  const authTag = Buffer.from(String(envelope.authTag || ""), "base64");
  if (iv.length !== 12 || authTag.length !== 16) throw new Error("training_envelope_metadata_invalid");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(envelope.aad, "utf8"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  const digest = crypto.createHmac("sha256", key).update(plaintext).digest("hex");
  const expectedDigest = Buffer.from(String(envelope.plaintextHmacSha256 || ""), "hex");
  const actualDigest = Buffer.from(digest, "hex");
  if (expectedDigest.length !== actualDigest.length || !crypto.timingSafeEqual(expectedDigest, actualDigest)) {
    throw new Error("training_plaintext_checksum_mismatch");
  }
  return JSON.parse(plaintext.toString("utf8"));
}

function decode32ByteKey(encoded) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) return null;
  return key;
}
