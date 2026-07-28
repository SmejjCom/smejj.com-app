// smejj.com — E-Mail-Benutzer-Store (Single Responsibility: Ablage von Benutzerkonten).
// Primaer IDrive e2 (Object Brain), Fallback In-Memory fuer lokale Entwicklung.
// Ablageschema: auth/email-users/{sha256(email)}.json
// Es werden NIEMALS Klartextpasswoerter oder Klartext-Tokens gespeichert — nur
// scrypt-Passwort-Hashes und SHA-256-Hashes der Verifikations-/Reset-Tokens.
import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const memoryStore = new Map(); // emailKey -> record (nur ohne IDrive-Konfiguration)

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

export function normalizeEmail(email) {
  const text = String(email || "").trim().toLowerCase();
  if (text.length < 6 || text.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return "";
  return text;
}

export function emailKey(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function objectKey(email) {
  return `auth/email-users/${emailKey(email)}.json`;
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function newUserId() {
  return `u_${crypto.randomBytes(12).toString("base64url")}`;
}

// Verwaltungsrolle und Kontostand. Bestandskonten wurden ohne diese Felder
// angelegt; die Normalisierer liefern deshalb den sichersten Rueckfall, damit
// keine Migration noetig ist. Ein unbekannter Wert ist NIE ein Vorteil.
export const DEFAULT_ROLE = "user";
export const DEFAULT_STATUS = "active";
const KNOWN_ROLES = new Set(["user", "readonly", "auditor", "finance", "support", "admin", "owner"]);
const KNOWN_STATUS = new Set(["active", "blocked", "deleted"]);

export function userRole(record) {
  const role = String(record?.role || "").trim().toLowerCase();
  return KNOWN_ROLES.has(role) ? role : DEFAULT_ROLE;
}

export function userStatus(record) {
  const status = String(record?.status || "").trim().toLowerCase();
  return KNOWN_STATUS.has(status) ? status : DEFAULT_STATUS;
}

export async function getUserByEmail(email, env = process.env) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const cfg = idriveConfig(env);
  if (!cfg) return memoryStore.get(emailKey(normalized)) || null;
  try {
    const { body } = await signedS3Get({ ...cfg, key: objectKey(normalized) });
    return JSON.parse(body);
  } catch (error) {
    if (/40[34]|NoSuchKey|not found/i.test(String(error?.message || error))) return null;
    throw error; // fail-closed: Storage-Stoerung nicht als "Nutzer existiert nicht" werten
  }
}

export async function putUser(record, env = process.env) {
  if (!record || !normalizeEmail(record.email)) throw new Error("email_user_record_invalid");
  record.updatedAt = new Date().toISOString();
  const cfg = idriveConfig(env);
  if (!cfg) { memoryStore.set(emailKey(record.email), record); return record; }
  await signedS3Put({
    ...cfg,
    key: objectKey(record.email),
    body: JSON.stringify(record, null, 2),
    contentType: "application/json; charset=utf-8"
  });
  return record;
}

export function createUserRecord({ email, name, passwordHash }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !passwordHash) throw new Error("email_user_record_invalid");
  const now = new Date().toISOString();
  return {
    version: 1,
    userId: newUserId(),
    email: normalized,
    name: String(name || normalized.split("@")[0]).slice(0, 120),
    method: "email",
    passwordHash,
    emailVerifiedAt: null,
    role: DEFAULT_ROLE,      // Verwaltungsrolle; Vergabe ausschliesslich ueber den Adminbereich
    status: DEFAULT_STATUS,  // "active" | "blocked" | "deleted"
    createdAt: now,
    updatedAt: now,
    verify: null,   // { tokenHash, expiresAt }
    reset: null,    // { tokenHash, expiresAt, usedAt }
    loginGuard: { failedCount: 0, lockedUntil: null },
    sessions: []    // [{ sid, createdAt, expiresAt, lastSeenAt, uaHash, revokedAt }]
  };
}

// Sitzungen: server-seitige Registry je Nutzer (Anzeige + Widerruf, AP3).
const MAX_SESSIONS = 20;

export function addSessionToRecord(record, { sid, expiresAt, userAgent }) {
  const now = new Date().toISOString();
  record.sessions = (record.sessions || []).filter((s) => !isSessionDead(s));
  record.sessions.push({
    sid: String(sid),
    createdAt: now,
    expiresAt: new Date(expiresAt).toISOString(),
    lastSeenAt: now,
    uaHash: userAgent ? crypto.createHash("sha256").update(String(userAgent)).digest("hex").slice(0, 16) : null,
    uaLabel: shortUserAgent(userAgent),
    revokedAt: null
  });
  while (record.sessions.length > MAX_SESSIONS) record.sessions.shift();
  return record;
}

export function findSession(record, sid) {
  return (record?.sessions || []).find((s) => s.sid === String(sid)) || null;
}

export function isSessionDead(session) {
  if (!session) return true;
  if (session.revokedAt) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export function revokeSessions(record, { keepSid = null, onlySid = null } = {}) {
  const now = new Date().toISOString();
  let revoked = 0;
  for (const session of record.sessions || []) {
    if (session.revokedAt) continue;
    if (onlySid && session.sid !== onlySid) continue;
    if (keepSid && session.sid === keepSid) continue;
    session.revokedAt = now;
    revoked += 1;
  }
  return revoked;
}

function shortUserAgent(userAgent) {
  const text = String(userAgent || "");
  if (!text) return "Unbekanntes Geraet";
  if (/iPhone|iPad/i.test(text)) return "iPhone/iPad";
  if (/Android/i.test(text)) return "Android";
  if (/Macintosh/i.test(text)) return "Mac";
  if (/Windows/i.test(text)) return "Windows";
  if (/Linux/i.test(text)) return "Linux";
  return "Browser";
}

export function __clearMemoryStoreForTests() {
  memoryStore.clear();
}
