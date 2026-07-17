// smejj.com — Passkey-Credential-Store (Single Responsibility: Ablage oeffentlicher Schluessel).
// Speichert NUR oeffentliche Schluessel + Metadaten (keine Geheimnisse) je Nutzer.
// Primaer IDrive e2 (Object Brain, stateless-freundlich), Fallback In-Memory fuer
// lokale Entwicklung ohne IDrive. Ablageschema: passkeys/users/{userId}.json
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const memoryStore = new Map(); // userId -> record (nur wenn IDrive nicht konfiguriert)

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function userKey(userId) {
  return `passkeys/users/${encodeURIComponent(userId)}.json`;
}

export async function getUserRecord(userId, env = process.env) {
  const cfg = idriveConfig(env);
  if (!cfg) return memoryStore.get(userId) || null;
  try {
    const { body } = await signedS3Get({ ...cfg, key: userKey(userId) });
    return JSON.parse(body);
  } catch (error) {
    if (/40[34]|NoSuchKey|not found/i.test(String(error?.message || error))) return null;
    throw error;
  }
}

async function putUserRecord(record, env = process.env) {
  const cfg = idriveConfig(env);
  if (!cfg) { memoryStore.set(record.userId, record); return; }
  await signedS3Put({
    ...cfg,
    key: userKey(record.userId),
    body: JSON.stringify(record, null, 2),
    contentType: "application/json; charset=utf-8"
  });
}

export async function listCredentials(userId, env = process.env) {
  const record = await getUserRecord(userId, env);
  return record?.credentials || [];
}

export async function findCredential(userId, credentialId, env = process.env) {
  const creds = await listCredentials(userId, env);
  return creds.find((c) => c.credentialId === credentialId) || null;
}

export async function saveCredential(userId, credential, meta = {}, env = process.env) {
  const record = (await getUserRecord(userId, env)) || { userId, displayName: meta.displayName || userId, credentials: [] };
  if (meta.displayName) record.displayName = meta.displayName;
  record.credentials = (record.credentials || []).filter((c) => c.credentialId !== credential.credentialId);
  record.credentials.push({
    credentialId: credential.credentialId,
    publicKeyJwk: credential.publicKeyJwk,
    signCount: Number(credential.signCount || 0),
    fmt: credential.fmt || "none",
    label: meta.label || "Passkey",
    createdAt: new Date().toISOString()
  });
  await putUserRecord(record, env);
  return record;
}

export async function updateSignCount(userId, credentialId, newSignCount, env = process.env) {
  const record = await getUserRecord(userId, env);
  if (!record) return;
  const cred = (record.credentials || []).find((c) => c.credentialId === credentialId);
  if (!cred) return;
  cred.signCount = Number(newSignCount || 0);
  cred.lastUsedAt = new Date().toISOString();
  await putUserRecord(record, env);
}

// Nur fuer Tests: In-Memory-Store leeren.
export function _resetMemoryStore() {
  memoryStore.clear();
}
