// smejj.com — Unit-Tests fuer den passwortlosen Magic-Link-Login.
// Deckt Token-Round-Trip, fail-closed ohne Mailer, E-Mail-Validierung, Versand
// des Links, Verify mit Cookie/Redirect, Single-Use und Handoff-Rueckkehr.
import test from "node:test";
import assert from "node:assert/strict";
import { createMagicLinkHandlers, signMagicToken, verifyMagicToken } from "../control-server/src/routes/magicLinkRoutes.js";

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = { ...res.headers, ...(headers || {}) }; };
  res.end = (body) => { res.body = String(body || ""); };
  return res;
}
const json = (res, code, payload) => { res.statusCode = code; res.body = JSON.stringify(payload); };
const mailerEnv = { SMEJJ_SMTP_HOST: "smtp.test", SMEJJ_SMTP_USER: "u@test", SMEJJ_SMTP_PASS: "p", SMEJJ_SMTP_FROM: "no-reply@smejj.com" };

function makeHandlers(overrides = {}) {
  const sent = [];
  const h = createMagicLinkHandlers({
    json,
    readJson: async (req) => req.__body || {},
    SECURITY_HEADERS: { "x-test": "1" },
    serializeSessionCookie: (u) => `smejj_session=tok-${u.email}`,
    serializeSessionToken: (u) => `token-${u.email}`,
    sessionHandoffStore: { complete: () => ({ ok: true }) },
    allowedOriginsFromEnv: () => ["https://smejj.com"],
    sessionSecret: () => "geheim",
    ROUTES: { api: { authMagicLinkVerify: "/api/auth/magic-link/verify" } },
    env: mailerEnv,
    sendMail: async (msg) => { sent.push(msg); return { sent: true }; },
    ...overrides
  });
  return { h, sent };
}

test("Token: Round-Trip gueltig, Manipulation und Ablauf werfen", () => {
  const t = signMagicToken({ email: "a@b.de", jti: "j", exp: Date.now() + 1000 }, "s");
  assert.equal(verifyMagicToken(t, "s").email, "a@b.de");
  assert.throws(() => verifyMagicToken(t + "x", "s"));
  assert.throws(() => verifyMagicToken(signMagicToken({ email: "a@b.de", exp: 1 }, "s"), "s"), /abgelaufen/);
});

test("fail-closed: 503 ohne Mailer-Konfiguration", async () => {
  const { h } = makeHandlers({ env: {} });
  const res = mockRes();
  await h.handleMagicLinkRequest({ headers: {}, __body: { email: "a@b.de" } }, res, new URL("https://c.test/x"));
  assert.equal(res.statusCode, 503);
});

test("Request: ungueltige E-Mail -> 400", async () => {
  const { h } = makeHandlers();
  const res = mockRes();
  await h.handleMagicLinkRequest({ headers: { host: "c.test" }, __body: { email: "keine-mail" } }, res, new URL("https://c.test/x"));
  assert.equal(res.statusCode, 400);
});

test("Request: sendet Link mit Verify-URL", async () => {
  const { h, sent } = makeHandlers();
  const res = mockRes();
  await h.handleMagicLinkRequest(
    { headers: { host: "control.example", "x-forwarded-proto": "https" }, __body: { email: "smejjcom@gmail.com" } },
    res, new URL("https://control.example/api/auth/magic-link/request")
  );
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /https:\/\/control\.example\/api\/auth\/magic-link\/verify\?token=/);
});

test("Verify: gueltiger Token -> Cookie + 303 zu /profile, danach Single-Use", async () => {
  const { h } = makeHandlers();
  const token = signMagicToken({ email: "smejjcom@gmail.com", jti: "j1", exp: Date.now() + 60000 }, "geheim");
  const res = mockRes();
  await h.handleMagicLinkVerify({ headers: {} }, res, new URL(`https://c.test/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`));
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "/profile?magic=ok");
  assert.match(res.headers["Set-Cookie"], /smejj_session=tok-smejjcom@gmail\.com/);
  // Zweite Verwendung desselben Tokens wird abgelehnt.
  const res2 = mockRes();
  await assert.rejects(() => h.handleMagicLinkVerify({ headers: {} }, res2, new URL(`https://c.test/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`)), /bereits verwendet/);
});

test("Verify: verfallener Handoff wird durch frischen ersetzt (Link lebt 15 Min, Handoff nur 2)", async () => {
  // Live-Befund 2026-07-25: E-Mail nach >2 Minuten geoeffnet -> alter Handoff
  // geloescht -> Anmeldung schlug fehl. Jetzt: frischer Handoff, Login klappt.
  const calls = [];
  const store = {
    complete: (id, data) => { calls.push(["complete", id]); return id === "FRISCH" ? { ok: true } : { ok: false, status: 404, error: "session_handoff_not_found" }; },
    start: (origin) => { calls.push(["start", origin]); return { ok: true, status: 201, id: "FRISCH" }; }
  };
  const { h } = makeHandlers({ sessionHandoffStore: store });
  const token = signMagicToken({ email: "smejjcom@gmail.com", jti: "j3", handoff: "VERFALLEN", handoffReturn: "https://smejj.com", exp: Date.now() + 60000 }, "geheim");
  const res = mockRes();
  await h.handleMagicLinkVerify({ headers: {} }, res, new URL(`https://c.test/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`));
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?handoff=FRISCH");
  assert.deepEqual(calls, [["complete", "VERFALLEN"], ["start", "https://smejj.com"], ["complete", "FRISCH"]]);
});

test("Verify: Handoff-Rueckkehr zur App mit hinterlegtem Token", async () => {
  let deposited = null;
  const { h } = makeHandlers({ sessionHandoffStore: { complete: (id, data) => { deposited = { id, data }; return { ok: true }; } } });
  const token = signMagicToken({ email: "smejjcom@gmail.com", jti: "j2", handoff: "H9", handoffReturn: "https://smejj.com", exp: Date.now() + 60000 }, "geheim");
  const res = mockRes();
  await h.handleMagicLinkVerify({ headers: {} }, res, new URL(`https://c.test/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`));
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?handoff=H9");
  assert.equal(deposited.data.user.method, "magiclink");
});
