// smejj.com — Passwort-Hashing (Single Responsibility: Hash + Verify).
// Modernes memory-hard Hashing mit node:crypto scrypt, ohne externe Dependency.
// Format (versioniert, selbstbeschreibend): scrypt$v1$N$r$p$saltB64url$hashB64url
// Klartextpasswoerter werden niemals gespeichert oder geloggt.
import crypto from "node:crypto";

const SCRYPT_N = 1 << 15; // 32768 — memory-hard, ~32 MiB
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 512;

export function passwordPolicyError(password) {
  const text = typeof password === "string" ? password : "";
  if (text.length < MIN_PASSWORD_LENGTH) return "password_too_short";
  if (text.length > MAX_PASSWORD_LENGTH) return "password_too_long";
  if (/^\s|\s$/.test(text)) return "password_whitespace_edges";
  return null;
}

export async function hashPassword(password) {
  const policyError = passwordPolicyError(password);
  if (policyError) throw new Error(policyError);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    "scrypt", "v1", String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P),
    salt.toString("base64url"), derived.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash || "").split("$");
    if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1") return false;
    const [N, r, p] = [Number(parts[2]), Number(parts[3]), Number(parts[4])];
    if (!Number.isInteger(N) || N < 16384 || N > (1 << 20) || !(r > 0 && r <= 32) || !(p > 0 && p <= 4)) return false;
    const salt = Buffer.from(parts[5], "base64url");
    const expected = Buffer.from(parts[6], "base64url");
    if (salt.length < 8 || expected.length < 16) return false;
    const derived = await scrypt(String(password || ""), salt, { N, r, p }, expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false; // fail-closed: jede Stoerung gilt als "Passwort falsch"
  }
}

function scrypt(password, salt, { N, r, p }, keyLength = KEY_LENGTH) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, { N, r, p, maxmem: 128 * N * r * 2 }, (error, derivedKey) => {
      if (error) reject(error); else resolve(derivedKey);
    });
  });
}
