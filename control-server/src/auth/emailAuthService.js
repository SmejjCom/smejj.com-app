// smejj.com — E-Mail-/Passwort-Auth-Service (Single Responsibility: Kontologik).
// Fail-closed, enumeration-sicher (Registrierung/Reset antworten uniform),
// Brute-Force-Lockout je Konto, Einmal-Tokens nur als SHA-256-Hash gespeichert.
import crypto from "node:crypto";
import { hashPassword, passwordPolicyError, verifyPassword } from "./passwordHash.js";
import {
  DEFAULT_ROLE, addSessionToRecord, createUserRecord, findSession, getUserByEmail, hashToken,
  isSessionDead, newUserId, normalizeEmail, putUser, revokeSessions
} from "./emailUserStore.js";
import { mailerConfig, sendAuthMail } from "./mailer.js";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

function allowedEmails(env = process.env) {
  const raw = String(env.SMEJJ_AUTH_ALLOWED_EMAILS || env.GOOGLE_ALLOWED_EMAIL || "").toLowerCase();
  return new Set(raw.split(",").map((e) => e.trim()).filter(Boolean));
}

function emailAllowed(email, env) {
  const allow = allowedEmails(env);
  return allow.size === 0 || allow.has(normalizeEmail(email));
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function newSessionId() {
  return `s_${crypto.randomBytes(16).toString("base64url")}`;
}

export async function registerUser({ email, password, name, origin }, env = process.env) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, status: 400, error: "email_invalid" };
  if (!emailAllowed(normalized, env)) return { ok: false, status: 403, error: "email_not_allowed" };
  const policyError = passwordPolicyError(password);
  if (policyError) return { ok: false, status: 400, error: policyError };
  // Haengt NUR an der Serverkonfiguration, nie am konkreten Konto — deshalb
  // fuer neue und bestehende Adressen identisch und damit enumeration-sicher.
  const verificationMailExpected = Boolean(mailerConfig(env));
  const existing = await getUserByEmail(normalized, env);
  if (existing) {
    // Enumeration-sicher: gleiche Antwort wie Erfolg, aber keine Aenderung am Konto.
    // Das Mailergebnis heisst `internalMail` und wird von der Route NICHT
    // ausgeliefert — als `mail` verriet es "account_exists" nach aussen.
    return { ok: true, status: 200, pendingVerification: true, verificationMailExpected, internalMail: { sent: false, reason: "account_exists" } };
  }
  const record = createUserRecord({ email: normalized, name, passwordHash: await hashPassword(password) });
  const token = newToken();
  record.verify = { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS).toISOString() };
  await putUser(record, env);
  const internalMail = await sendVerification({ email: normalized, token, origin }, env);
  return { ok: true, status: 200, pendingVerification: true, verificationMailExpected, internalMail };
}

export async function loginUser({ email, password, userAgent }, env = process.env) {
  const invalid = { ok: false, status: 401, error: "email_or_password_invalid" };
  const record = await getUserByEmail(email, env);
  if (!record || !record.passwordHash) {
    await verifyPassword(String(password || ""), "scrypt$v1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    return invalid; // Timing-Angleichung, kein Nutzer-Enumeration-Signal
  }
  const guard = record.loginGuard || { failedCount: 0, lockedUntil: null };
  if (guard.lockedUntil && new Date(guard.lockedUntil).getTime() > Date.now()) {
    return { ok: false, status: 429, error: "account_temporarily_locked" };
  }
  const valid = await verifyPassword(String(password || ""), record.passwordHash);
  if (!valid) {
    guard.failedCount = Number(guard.failedCount || 0) + 1;
    if (guard.failedCount >= LOCKOUT_THRESHOLD) {
      guard.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      guard.failedCount = 0;
    }
    record.loginGuard = guard;
    await putUser(record, env);
    return invalid;
  }
  if (!record.emailVerifiedAt && requireVerifiedEmail(env)) {
    return { ok: false, status: 403, error: "email_not_verified" };
  }
  record.loginGuard = { failedCount: 0, lockedUntil: null };
  const sid = newSessionId(); // neue Session-ID bei jedem Login: Schutz vor Session-Fixation
  const expiresAt = Date.now() + SESSION_TTL_MS;
  addSessionToRecord(record, { sid, expiresAt, userAgent });
  await putUser(record, env);
  return {
    ok: true, status: 200, sid, expiresAt,
    user: { userId: record.userId, email: record.email, name: record.name, method: "email", sid }
  };
}

export async function verifyEmailToken({ email, token }, env = process.env) {
  const record = await getUserByEmail(email, env);
  const invalid = { ok: false, status: 400, error: "verification_invalid_or_expired" };
  if (!record?.verify?.tokenHash) return invalid;
  if (new Date(record.verify.expiresAt).getTime() <= Date.now()) return invalid;
  if (!timingSafeHexEqual(record.verify.tokenHash, hashToken(token))) return invalid;
  record.emailVerifiedAt = new Date().toISOString();
  record.verify = null; // Einmalverwendung
  await putUser(record, env);
  return { ok: true, status: 200, verified: true };
}

// Antwort ist bewusst IMMER dieselbe — sonst verraet sie, ob es das Konto gibt.
//
// Befund der Anmeldewege-Pruefung vom 2026-07-28 (live gegen den Control-Server
// gemessen): die Antwort trug ein `mail`-Feld nach aussen. Fuer eine unbekannte
// Adresse stand dort {"sent":false,"reason":"unknown_account"}, fuer eine
// bekannte {"sent":true}. Damit konnte jeder ohne Anmeldung durchprobieren,
// welche E-Mail-Adressen ein Konto haben (Konto-Enumeration) — die Oberflaeche
// formuliert seit jeher datensparsam ("Wenn ein Konto existiert ..."), die
// API widersprach ihr. Das Ergebnis des Mailversands bleibt intern (Rueckgabe
// `internalMail`, wird von der Route NICHT ausgeliefert).
export async function requestPasswordReset({ email, origin }, env = process.env) {
  const uniform = { ok: true, status: 200, requested: true };
  const record = await getUserByEmail(email, env);
  if (!record) return { ...uniform, internalMail: { sent: false, reason: "unknown_account" } };
  const token = newToken();
  record.reset = { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), usedAt: null };
  await putUser(record, env);
  const internalMail = await sendReset({ email: record.email, token, origin }, env);
  return { ...uniform, internalMail };
}

export async function confirmPasswordReset({ email, token, newPassword }, env = process.env) {
  const invalid = { ok: false, status: 400, error: "reset_invalid_or_expired" };
  const record = await getUserByEmail(email, env);
  if (!record?.reset?.tokenHash || record.reset.usedAt) return invalid;
  if (new Date(record.reset.expiresAt).getTime() <= Date.now()) return invalid;
  if (!timingSafeHexEqual(record.reset.tokenHash, hashToken(token))) return invalid;
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return { ok: false, status: 400, error: policyError };
  record.passwordHash = await hashPassword(newPassword);
  record.reset = { ...record.reset, usedAt: new Date().toISOString() }; // Einmalverwendung
  record.loginGuard = { failedCount: 0, lockedUntil: null };
  if (!record.emailVerifiedAt) record.emailVerifiedAt = new Date().toISOString(); // Besitznachweis der Mailbox
  revokeSessions(record); // Pflicht: alle Sessions nach Passwortaenderung beenden
  await putUser(record, env);
  return { ok: true, status: 200, reset: true };
}

export async function changePassword({ email, currentPassword, newPassword, keepSid }, env = process.env) {
  const record = await getUserByEmail(email, env);
  if (!record?.passwordHash) return { ok: false, status: 401, error: "authentication_required" };
  if (!(await verifyPassword(String(currentPassword || ""), record.passwordHash))) {
    return { ok: false, status: 403, error: "current_password_invalid" };
  }
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return { ok: false, status: 400, error: policyError };
  record.passwordHash = await hashPassword(newPassword);
  revokeSessions(record, { keepSid }); // andere Sessions beenden, aktuelle bleibt
  await putUser(record, env);
  return { ok: true, status: 200, changed: true };
}

export async function checkEmailSession({ email, sid }, env = process.env) {
  const record = await getUserByEmail(email, env);
  if (!record) return { ok: false };
  const session = findSession(record, sid);
  if (!session || isSessionDead(session)) return { ok: false };
  return { ok: true, record, session };
}

export async function listSessions({ email, currentSid }, env = process.env) {
  const record = await getUserByEmail(email, env);
  if (!record) return { ok: false, status: 404, error: "account_not_found" };
  const sessions = (record.sessions || []).filter((s) => !isSessionDead(s)).map((s) => ({
    sid: s.sid, createdAt: s.createdAt, expiresAt: s.expiresAt, lastSeenAt: s.lastSeenAt,
    device: s.uaLabel || "Browser", current: s.sid === currentSid
  }));
  return { ok: true, status: 200, sessions };
}

export async function revokeUserSessions({ email, onlySid, keepSid }, env = process.env) {
  const record = await getUserByEmail(email, env);
  if (!record) return { ok: false, status: 404, error: "account_not_found" };
  const revoked = revokeSessions(record, { onlySid: onlySid || null, keepSid: keepSid || null });
  await putUser(record, env);
  return { ok: true, status: 200, revoked };
}

export async function exportAccountData({ email }, env = process.env) {
  const record = await getUserByEmail(email, env);
  if (!record) return { ok: false, status: 404, error: "account_not_found" };
  return {
    ok: true, status: 200,
    account: {
      userId: record.userId, email: record.email, name: record.name, method: record.method,
      emailVerifiedAt: record.emailVerifiedAt, createdAt: record.createdAt, updatedAt: record.updatedAt,
      activeSessions: (record.sessions || []).filter((s) => !isSessionDead(s)).length
    }
  };
}

/**
 * Woertliche Loeschbestaetigung.
 *
 * Die Oberflaeche zeigt das Wort in der Sprache der Huelle (14 Sprachen seit
 * i18n-Stufe 5). Bis zum 21.09.2026 verglich der Server hart gegen die deutsche
 * Fassung — wer die App auf Englisch benutzte, sah "DELETE ACCOUNT", tippte es
 * ab und bekam `delete_confirmation_required`. Beide Fassungen sind gueltig;
 * verglichen wird in Grossschreibung, damit Tastaturen ohne Feststelltaste
 * niemanden aussperren.
 */
const LOESCH_BESTAETIGUNGEN = new Set(["KONTO LÖSCHEN", "DELETE ACCOUNT"]);

function loeschBestaetigt(confirmText) {
  return LOESCH_BESTAETIGUNGEN.has(String(confirmText || "").trim().toLocaleUpperCase("de-DE"));
}

/**
 * Grabstein fuer ein passwortloses Konto (Google, GitHub, Passkey).
 *
 * Diese Anmeldewege legen im Nutzerregister gar keinen Datensatz an — die
 * Sitzung ist zustandslos signiert. Ohne Grabstein waere die Loeschung nicht
 * nachweisbar; mit ihm bleibt sie auditierbar wie bei E-Mail-Konten.
 */
function grabsteinFuerPasswortlosesKonto({ email, name, method }) {
  const jetzt = new Date().toISOString();
  return {
    version: 1,
    userId: newUserId(),
    email: normalizeEmail(email),
    name: String(name || "").slice(0, 120),
    method: String(method || "external"),
    passwordHash: null,
    emailVerifiedAt: null,
    role: DEFAULT_ROLE,
    status: "deleted",
    createdAt: jetzt,
    updatedAt: jetzt,
    verify: null,
    reset: null,
    loginGuard: { failedCount: 0, lockedUntil: null },
    sessions: []
  };
}

/**
 * Konto loeschen.
 *
 * `method` ist der Anmeldeweg der laufenden Sitzung, nicht die Wahl des
 * Aufrufers — die Route reicht ihn aus dem geprueften Sitzungstoken durch.
 * Fuer "email" bleibt die Zwei-Stufen-Bremse (Passwort UND Wort). Fuer die
 * passwortlosen Wege KANN es kein Passwort geben; dort ist der Nachweis die
 * gueltige Sitzung plus das Wort. Apple verlangt in Richtlinie 5.1.1(v), dass
 * die Loeschung in der App startbar ist — vorher endete sie fuer diese Konten
 * mit `account_delete_requires_email_login` und lief nur ueber den Support.
 */
export async function deleteAccount({ email, password, confirmText, name, method = "email" }, env = process.env) {
  if (!loeschBestaetigt(confirmText)) {
    return { ok: false, status: 400, error: "delete_confirmation_required" };
  }
  const passwortlos = String(method || "email") !== "email";
  const record = passwortlos
    ? (await getUserByEmail(email, env)) || grabsteinFuerPasswortlosesKonto({ email, name, method })
    : await getUserByEmail(email, env);
  if (!passwortlos) {
    if (!record?.passwordHash) return { ok: false, status: 404, error: "account_not_found" };
    if (!(await verifyPassword(String(password || ""), record.passwordHash))) {
      return { ok: false, status: 403, error: "current_password_invalid" };
    }
  }
  // Soft-Delete (append-only-Philosophie): Login unmoeglich, Sessions beendet,
  // Tombstone bleibt auditierbar. Endgueltige Objektloeschung ist ein separater,
  // manueller Admin-Schritt und wird niemals automatisch ausgefuehrt.
  record.passwordHash = null;
  record.deletedAt = new Date().toISOString();
  record.verify = null;
  record.reset = null;
  record.status = "deleted";
  revokeSessions(record);
  await putUser(record, env);
  return { ok: true, status: 200, deleted: true, method: record.method };
}

function requireVerifiedEmail(env = process.env) {
  // Fail-closed-Default: Verifikation ist Pflicht, sobald E-Mail-Versand konfiguriert ist.
  // Ohne Mail-Konfiguration wuerde die Pflicht jeden Login dauerhaft blockieren.
  return String(env.SMEJJ_SMTP_HOST || "").length > 0;
}

async function sendVerification({ email, token, origin }, env) {
  const link = `${origin}/auth/login/?verify=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return sendAuthMail({
    to: email,
    subject: "smejj.com — E-Mail-Adresse bestätigen",
    text: `Bitte bestätige deine E-Mail-Adresse für smejj.com:\n\n${link}\n\nDer Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, ignoriere diese E-Mail.`
  }, env);
}

async function sendReset({ email, token, origin }, env) {
  const link = `${origin}/auth/login/?reset=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return sendAuthMail({
    to: email,
    subject: "smejj.com — Passwort zurücksetzen",
    text: `Zum Zurücksetzen deines smejj.com-Passworts:\n\n${link}\n\nDer Link ist 30 Minuten gültig und nur einmal verwendbar. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.`
  }, env);
}

function timingSafeHexEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
