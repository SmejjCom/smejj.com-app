// smejj.com — Tests fuer E-Mail-/Passwort-Auth (Hashing, Konto, Sessions, Routen).
import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, passwordPolicyError, verifyPassword } from "../control-server/src/auth/passwordHash.js";
import {
  __clearMemoryStoreForTests, getUserByEmail, hashToken, normalizeEmail, putUser
} from "../control-server/src/auth/emailUserStore.js";
import {
  changePassword, checkEmailSession, confirmPasswordReset, listSessions,
  loginUser, registerUser, requestPasswordReset, revokeUserSessions, verifyEmailToken
} from "../control-server/src/auth/emailAuthService.js";
import { sendAuthMail } from "../control-server/src/auth/mailer.js";
import { emailSessionStillValid, handleEmailAuthRoutes } from "../control-server/src/routes/emailAuthRoutes.js";

// Leere Env: kein IDrive (Memory-Store), kein SMTP, keine Allowlist-Beschraenkung.
const ENV = { SMEJJ_AUTH_ALLOWED_EMAILS: "" };
const EMAIL = "user@example.com";
const PASSWORD = "korrekt-pferd-batterie-42";

test.beforeEach(() => __clearMemoryStoreForTests());

test("passwordHash: Policy, Roundtrip, Manipulation", async () => {
  assert.equal(passwordPolicyError("kurz"), "password_too_short");
  assert.equal(passwordPolicyError(" leading-space-pw"), "password_whitespace_edges");
  assert.equal(passwordPolicyError(PASSWORD), null);
  const stored = await hashPassword(PASSWORD);
  assert.match(stored, /^scrypt\$v1\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(PASSWORD, stored), true);
  assert.equal(await verifyPassword("falsches-passwort-123", stored), false);
  // Manipulation deterministisch: erstes Zeichen des Hash-Segments traegt
  // immer 6 signifikante Bits (base64url). Das fruehere Ersetzen des LETZTEN
  // Zeichens war flaky, weil dessen 4 Fuellbits die dekodierten Bytes in
  // ~25% der Faelle unveraendert liessen.
  const parts = stored.split("$");
  const tampered = [...parts.slice(0, 6), (parts[6][0] === "A" ? "B" : "A") + parts[6].slice(1)].join("$");
  assert.equal(await verifyPassword(PASSWORD, tampered), false);
  assert.equal(await verifyPassword(PASSWORD, "kaputt"), false);
});

test("register + login: Erfolg, falsches Passwort, Enumeration-Schutz", async () => {
  const reg = await registerUser({ email: EMAIL, password: PASSWORD, name: "Test", origin: "https://smejj.com" }, ENV);
  assert.equal(reg.ok, true);
  assert.equal(reg.pendingVerification, true);
  assert.equal(reg.mail.sent, false); // SMTP nicht konfiguriert -> ehrlich unversendet
  const record = await getUserByEmail(EMAIL, ENV);
  assert.ok(record.passwordHash.startsWith("scrypt$v1$"));
  assert.ok(!JSON.stringify(record).includes(PASSWORD)); // niemals Klartext

  // Doppelte Registrierung: gleiche Antwort, kein Konto-Ueberschreiben.
  const again = await registerUser({ email: EMAIL, password: "anderes-passwort-999", origin: "https://smejj.com" }, ENV);
  assert.equal(again.ok, true);
  assert.equal((await getUserByEmail(EMAIL, ENV)).passwordHash, record.passwordHash);

  const bad = await loginUser({ email: EMAIL, password: "falsch-falsch-falsch" }, ENV);
  assert.equal(bad.status, 401);
  const unknown = await loginUser({ email: "niemand@example.com", password: PASSWORD }, ENV);
  assert.equal(unknown.status, 401); // identische Antwort wie falsches Passwort

  const good = await loginUser({ email: EMAIL, password: PASSWORD, userAgent: "TestUA Macintosh" }, ENV);
  assert.equal(good.ok, true);
  assert.ok(good.sid.startsWith("s_"));
  assert.equal(good.user.method, "email");
});

test("login: Brute-Force-Lockout nach 8 Fehlversuchen", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  for (let i = 0; i < 8; i += 1) {
    await loginUser({ email: EMAIL, password: `falsch-${i}-xxxxxxxx` }, ENV);
  }
  const locked = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  assert.equal(locked.status, 429);
  assert.equal(locked.error, "account_temporarily_locked");
});

test("E-Mail-Verifikation: Einmal-Token mit Ablauf", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  const record = await getUserByEmail(EMAIL, ENV);
  record.verify = { tokenHash: hashToken("test-token"), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await putUser(record, ENV);
  assert.equal((await verifyEmailToken({ email: EMAIL, token: "falsch" }, ENV)).ok, false);
  const ok = await verifyEmailToken({ email: EMAIL, token: "test-token" }, ENV);
  assert.equal(ok.ok, true);
  // Einmalverwendung: zweiter Versuch schlaegt fehl.
  assert.equal((await verifyEmailToken({ email: EMAIL, token: "test-token" }, ENV)).ok, false);
  assert.ok((await getUserByEmail(EMAIL, ENV)).emailVerifiedAt);
});

test("Passwort-Reset: Einmal-Token, Ablauf, Session-Invalidierung", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  const login = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  assert.equal(login.ok, true);

  const request = await requestPasswordReset({ email: EMAIL, origin: "https://smejj.com" }, ENV);
  assert.equal(request.ok, true);
  // Unbekanntes Konto: identisch uniforme Antwort (kein Enumeration-Signal).
  const unknown = await requestPasswordReset({ email: "niemand@example.com", origin: "https://smejj.com" }, ENV);
  assert.equal(unknown.ok, true);

  const record = await getUserByEmail(EMAIL, ENV);
  record.reset = { tokenHash: hashToken("reset-token"), expiresAt: new Date(Date.now() + 60_000).toISOString(), usedAt: null };
  await putUser(record, ENV);

  const tooShort = await confirmPasswordReset({ email: EMAIL, token: "reset-token", newPassword: "kurz" }, ENV);
  assert.equal(tooShort.ok, false);
  const done = await confirmPasswordReset({ email: EMAIL, token: "reset-token", newPassword: "neues-sicheres-passwort-77" }, ENV);
  assert.equal(done.ok, true);
  // Einmalverwendung + alle Sessions widerrufen.
  assert.equal((await confirmPasswordReset({ email: EMAIL, token: "reset-token", newPassword: "noch-eins-88888888" }, ENV)).ok, false);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: login.sid }, ENV)).ok, false);
  assert.equal((await loginUser({ email: EMAIL, password: "neues-sicheres-passwort-77" }, ENV)).ok, true);

  // Abgelaufener Token wird abgelehnt.
  const expired = await getUserByEmail(EMAIL, ENV);
  expired.reset = { tokenHash: hashToken("late"), expiresAt: new Date(Date.now() - 1000).toISOString(), usedAt: null };
  await putUser(expired, ENV);
  assert.equal((await confirmPasswordReset({ email: EMAIL, token: "late", newPassword: "spaet-aber-lang-genug-99" }, ENV)).ok, false);
});

test("Sessions: Anzeige, gezielter Widerruf, alle anderen beenden", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  const first = await loginUser({ email: EMAIL, password: PASSWORD, userAgent: "iPhone" }, ENV);
  const second = await loginUser({ email: EMAIL, password: PASSWORD, userAgent: "Macintosh" }, ENV);
  assert.notEqual(first.sid, second.sid); // frische Session-ID je Login (Fixation-Schutz)

  const list = await listSessions({ email: EMAIL, currentSid: second.sid }, ENV);
  assert.equal(list.sessions.length, 2);
  assert.equal(list.sessions.find((s) => s.sid === second.sid).current, true);

  await revokeUserSessions({ email: EMAIL, onlySid: first.sid }, ENV);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: first.sid }, ENV)).ok, false);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: second.sid }, ENV)).ok, true);

  const third = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  await revokeUserSessions({ email: EMAIL, keepSid: third.sid }, ENV);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: second.sid }, ENV)).ok, false);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: third.sid }, ENV)).ok, true);
});

test("Passwort aendern: aktuelle Session bleibt, andere enden", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  const keep = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  const other = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  const wrong = await changePassword({ email: EMAIL, currentPassword: "falsch-1234567890", newPassword: "ganz-neu-und-lang-55", keepSid: keep.sid }, ENV);
  assert.equal(wrong.status, 403);
  const done = await changePassword({ email: EMAIL, currentPassword: PASSWORD, newPassword: "ganz-neu-und-lang-55", keepSid: keep.sid }, ENV);
  assert.equal(done.ok, true);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: keep.sid }, ENV)).ok, true);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: other.sid }, ENV)).ok, false);
});

test("Allowlist: nicht freigegebene E-Mail wird abgelehnt", async () => {
  const env = { SMEJJ_AUTH_ALLOWED_EMAILS: "smejjcom@gmail.com" };
  const denied = await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, env);
  assert.equal(denied.status, 403);
  assert.equal(denied.error, "email_not_allowed");
});

test("mailer: fail-closed ohne Konfiguration, Versand mit Transport-Stub", async () => {
  assert.deepEqual(await sendAuthMail({ to: EMAIL, subject: "x", text: "y" }, {}), { sent: false, reason: "email_delivery_unconfigured" });
  const calls = [];
  const env = { SMEJJ_SMTP_HOST: "smtp.example.com", SMEJJ_SMTP_PORT: "465", SMEJJ_SMTP_USER: "u@example.com", SMEJJ_SMTP_PASS: "p", SMEJJ_SMTP_FROM: "u@example.com" };
  const result = await sendAuthMail({ to: EMAIL, subject: "Bestätigung äöü", text: "Zeile1\n.punkt" }, env, async (cfg, message, recipient) => {
    calls.push({ cfg: { host: cfg.host, port: cfg.port }, message, recipient });
  });
  assert.equal(result.sent, true);
  assert.equal(calls[0].recipient, EMAIL);
  assert.match(calls[0].message, /Subject: =\?UTF-8\?B\?/);
  assert.match(calls[0].message, /\r\n\.\.punkt/); // Dot-Stuffing
  assert.ok(!calls[0].message.includes("\np")); // Passwort nie im Mailtext
});

test("Routen: Login setzt HttpOnly-Cookie, Sessions-API, Widerruf greift", async () => {
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  let currentUser = null;
  const ctx = {
    env: ENV,
    readJson: async (req) => req.__body || {},
    json: (res, status, payload) => { res.__status = status; res.__payload = payload; },
    readSession: () => currentUser,
    makeSessionCookie: (user) => `smejj_session=stub.${user.sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
    makeAccessToken: (user) => `token.${user.sid}`,
    requestOrigin: () => "https://smejj.com"
  };
  const request = (pathname, method, body) => ({
    req: { method, headers: { "user-agent": "TestUA", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, __body: body },
    url: { pathname },
    res: { headers: {}, setHeader(name, value) { this.headers[name] = value; } }
  });

  const login = request("/api/auth/email/login", "POST", { email: EMAIL, password: PASSWORD });
  assert.equal(await handleEmailAuthRoutes(login.req, login.url, login.res, ctx), true);
  assert.equal(login.res.__status, 200);
  assert.match(login.res.headers["Set-Cookie"], /HttpOnly; Secure; SameSite=Lax/);
  currentUser = login.res.__payload.user;
  assert.equal(await emailSessionStillValid(currentUser, ENV), true);

  const sessions = request("/api/auth/sessions", "GET");
  await handleEmailAuthRoutes(sessions.req, sessions.url, sessions.res, ctx);
  assert.equal(sessions.res.__status, 200);
  assert.equal(sessions.res.__payload.sessions.length, 1);

  const revoke = request("/api/auth/sessions/revoke", "POST", { sid: currentUser.sid });
  await handleEmailAuthRoutes(revoke.req, revoke.url, revoke.res, ctx);
  assert.equal(revoke.res.__status, 200);
  assert.equal(await emailSessionStillValid(currentUser, ENV), false);

  const anon = request("/api/auth/account/export", "GET");
  currentUser = null;
  await handleEmailAuthRoutes(anon.req, anon.url, anon.res, ctx);
  assert.equal(anon.res.__status, 401);
});

test("Konto löschen: nur mit Passwort und wörtlicher Bestätigung, Soft-Delete", async () => {
  const { deleteAccount } = await import("../control-server/src/auth/emailAuthService.js");
  await registerUser({ email: EMAIL, password: PASSWORD, origin: "https://smejj.com" }, ENV);
  const login = await loginUser({ email: EMAIL, password: PASSWORD }, ENV);
  assert.equal((await deleteAccount({ email: EMAIL, password: PASSWORD, confirmText: "falsch" }, ENV)).status, 400);
  assert.equal((await deleteAccount({ email: EMAIL, password: "falsch-1234567890", confirmText: "KONTO LÖSCHEN" }, ENV)).status, 403);
  const done = await deleteAccount({ email: EMAIL, password: PASSWORD, confirmText: "KONTO LÖSCHEN" }, ENV);
  assert.equal(done.ok, true);
  // Login unmoeglich, Sessions beendet, Tombstone bleibt auditierbar.
  assert.equal((await loginUser({ email: EMAIL, password: PASSWORD }, ENV)).status, 401);
  assert.equal((await checkEmailSession({ email: EMAIL, sid: login.sid }, ENV)).ok, false);
  const record = await getUserByEmail(EMAIL, ENV);
  assert.ok(record.deletedAt);
  assert.equal(record.passwordHash, null);
});

test("normalizeEmail: robuste Validierung", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizeEmail("kaputt"), "");
  assert.equal(normalizeEmail("a@b"), "");
});
