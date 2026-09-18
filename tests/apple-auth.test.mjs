// smejj.com — Tests fuer "Mit Apple anmelden" (Web-Ablauf, response_mode=form_post).
// Echte Schluessel statt Attrappen: das Client-Secret ist ein ES256-JWT, das
// id_token wird mit RS256 gegen ein JWKS geprueft. Netz ist gemockt.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  appleAuthorizeUrl, appleConfigFromEnv, appleLoginConfigured, appleNameFromUserField,
  createAppleClientSecret, exchangeAppleCode, leseAppleAuthState, normalizeApplePrivateKey,
  signAppleAuthState, verifyAppleIdToken, vergesseAppleSchluessel
} from "../src/auth/appleAuth.js";
import { createAppleAuthHandlers } from "../src/auth/appleAuthRoutes.js";
import { istOeffentlicheApi, isSafeMutatingControlRequest, requiresAuthenticatedControlAccess } from "../src/shared/controlAccessPolicy.js";
import { ROUTES } from "../src/shared/platform.js";

const SERVICES_ID = "com.smejj.web";
const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const ecPem = ec.privateKey.export({ type: "pkcs8", format: "pem" });
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...rsa.publicKey.export({ format: "jwk" }), kid: "K1", alg: "RS256", use: "sig" };
const appleConfig = { servicesId: SERVICES_ID, teamId: "443R27FNHX", keyId: "ABC123DEFG", privateKey: ecPem };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function idToken(overrides = {}, { kid = "K1", signWith = rsa.privateKey } = {}) {
  const head = b64({ alg: "RS256", kid });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({
    iss: "https://appleid.apple.com", aud: SERVICES_ID, exp: now + 600, iat: now, sub: "001.abc",
    email: "Nutzer@Example.com", email_verified: "true", nonce: "N1", ...overrides
  });
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), signWith).toString("base64url");
  return `${head}.${body}.${sig}`;
}

function appleFetch({ token = idToken(), tokenStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === "https://appleid.apple.com/auth/keys") return { ok: true, json: async () => ({ keys: [jwk] }) };
    if (url === "https://appleid.apple.com/auth/token") {
      return tokenStatus === 200
        ? { ok: true, json: async () => ({ id_token: token }) }
        : { ok: false, json: async () => ({ error: "invalid_grant" }) };
    }
    throw new Error(`unmocked ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test.beforeEach(() => vergesseAppleSchluessel());

test("Konfiguration: alle vier Werte noetig, Schluessel als PEM, \\n-Text oder Base64", () => {
  const env = {
    SMEJJ_APPLE_LOGIN_SERVICES_ID: SERVICES_ID, SMEJJ_APPLE_LOGIN_TEAM_ID: "T", SMEJJ_APPLE_LOGIN_KEY_ID: "K",
    SMEJJ_APPLE_LOGIN_PRIVATE_KEY: ecPem
  };
  assert.equal(appleLoginConfigured(env), true);
  assert.equal(appleLoginConfigured({ ...env, SMEJJ_APPLE_LOGIN_KEY_ID: "" }), false);
  assert.equal(appleLoginConfigured({}), false);
  const einzeilig = ecPem.trim().replace(/\n/g, "\\n");
  assert.equal(normalizeApplePrivateKey(einzeilig), ecPem.trim());
  assert.equal(normalizeApplePrivateKey(Buffer.from(ecPem).toString("base64")), ecPem.trim());
  assert.equal(normalizeApplePrivateKey("kein schluessel"), "");
  assert.equal(appleConfigFromEnv(env).servicesId, SERVICES_ID);
});

test("Autorisierungs-Adresse: form_post, Bereiche, state und nonce", () => {
  const u = new URL(appleAuthorizeUrl({ servicesId: SERVICES_ID, redirectUri: "https://api.smejj.com/api/auth/apple/callback", state: "S", nonce: "N" }));
  assert.equal(u.origin + u.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(u.searchParams.get("response_mode"), "form_post");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "name email");
  assert.equal(u.searchParams.get("client_id"), SERVICES_ID);
  assert.equal(u.searchParams.get("state"), "S");
  assert.equal(u.searchParams.get("nonce"), "N");
});

test("Client-Secret: ES256-JWT mit Team-ID, Services-ID, Key-ID und kurzer Laufzeit", () => {
  const jwt = createAppleClientSecret(appleConfig, 1_800_000_000_000);
  const [h, p, s] = jwt.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  assert.deepEqual([header.alg, header.kid], ["ES256", "ABC123DEFG"]);
  assert.equal(claims.iss, "443R27FNHX");
  assert.equal(claims.sub, SERVICES_ID);
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.equal(claims.exp - claims.iat, 300);
  const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
  assert.equal(ok, true);
});

test("Code-Tausch: schickt Formular mit Secret, gibt id_token zurueck, wirft bei Fehler", async () => {
  const f = appleFetch({ token: "TOKEN" });
  const t = await exchangeAppleCode("CODE", { config: appleConfig, redirectUri: "https://x/cb", fetchImpl: f });
  assert.equal(t, "TOKEN");
  const body = new URLSearchParams(f.calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "CODE");
  assert.equal(body.get("client_id"), SERVICES_ID);
  assert.equal(body.get("client_secret").split(".").length, 3);
  await assert.rejects(() => exchangeAppleCode("C", { config: appleConfig, redirectUri: "r", fetchImpl: appleFetch({ tokenStatus: 400 }) }), /Token-Tausch/);
});

test("id_token: gueltig -> E-Mail klein geschrieben; bool und String email_verified", async () => {
  const f = appleFetch();
  const a = await verifyAppleIdToken(idToken(), { servicesId: SERVICES_ID, expectedNonce: "N1", fetchImpl: f });
  assert.equal(a.email, "nutzer@example.com");
  assert.equal(a.sub, "001.abc");
  const b = await verifyAppleIdToken(idToken({ email_verified: true, is_private_email: "true" }), { servicesId: SERVICES_ID, expectedNonce: "N1", fetchImpl: f });
  assert.equal(b.privateRelay, true);
});

test("id_token: falsche Zielgruppe, Aussteller, nonce, Ablauf, unbestaetigte E-Mail und fremde Signatur werden abgelehnt", async () => {
  const opts = { servicesId: SERVICES_ID, expectedNonce: "N1", fetchImpl: appleFetch() };
  await assert.rejects(() => verifyAppleIdToken(idToken({ aud: "andere.app" }), opts), /Services-ID/);
  await assert.rejects(() => verifyAppleIdToken(idToken({ iss: "https://evil.example" }), opts), /Issuer/);
  await assert.rejects(() => verifyAppleIdToken(idToken({ nonce: "X" }), opts), /Nonce/);
  await assert.rejects(() => verifyAppleIdToken(idToken({ exp: 1 }), opts), /abgelaufen/);
  await assert.rejects(() => verifyAppleIdToken(idToken({ email_verified: "false" }), opts), /nicht verifiziert/);
  await assert.rejects(() => verifyAppleIdToken(idToken({ email: "" }), opts), /nicht verifiziert/);
  const fremd = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(() => verifyAppleIdToken(idToken({}, { signWith: fremd }), opts), /Signatur/);
  await assert.rejects(() => verifyAppleIdToken(idToken({}, { kid: "unbekannt" }), opts), /unbekannt/);
  await assert.rejects(() => verifyAppleIdToken("nur.zwei", opts), /Ungueltiges/);
});

test("Name kommt nur aus dem user-Feld der ersten Anmeldung", () => {
  assert.equal(appleNameFromUserField(JSON.stringify({ name: { firstName: "Ada", lastName: "Lovelace" } })), "Ada Lovelace");
  assert.equal(appleNameFromUserField(""), "");
  assert.equal(appleNameFromUserField("{kaputt"), "");
});

test("State: gueltig, abgelaufen (Inhalt lesbar), ungueltig (keine Daten)", () => {
  const s = signAppleAuthState({ nonce: "n", exp: Date.now() + 60000 }, "geheim");
  assert.equal(leseAppleAuthState(s, "geheim").ok, true);
  assert.equal(leseAppleAuthState(s + "x", "geheim").grund, "ungueltig");
  assert.equal(leseAppleAuthState(s, "anderes").daten, null);
  const alt = signAppleAuthState({ nonce: "n", handoffReturn: "https://smejj.com", exp: Date.now() - 1 }, "geheim");
  const r = leseAppleAuthState(alt, "geheim");
  assert.equal(r.grund, "abgelaufen");
  assert.equal(r.daten.handoffReturn, "https://smejj.com");
});

// ---- Handler --------------------------------------------------------------

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers || {}; };
  res.end = (body) => { res.body = String(body || ""); };
  return res;
}
const json = (res, code, payload) => { res.statusCode = code; res.body = JSON.stringify(payload); };
const SECRET = "sitzungsgeheimnis";
const routes = { api: { authApple: "/api/auth/apple", authAppleCallback: "/api/auth/apple/callback" } };

function handlers(over = {}) {
  return createAppleAuthHandlers({
    config: { sessionSecret: SECRET },
    appleConfig: () => appleConfig,
    json,
    SECURITY_HEADERS: { "x-test": "1" },
    serializeSessionCookie: (u) => `smejj_session=cookie-${u.email}`,
    serializeSessionToken: (u) => `token-${u.email}`,
    sessionHandoffStore: { complete: () => ({ ok: true }) },
    allowedOriginsFromEnv: () => ["https://smejj.com"],
    signAppleAuthState, leseAppleAuthState, appleAuthorizeUrl, exchangeAppleCode, verifyAppleIdToken, appleNameFromUserField,
    ROUTES: routes,
    fetchImpl: appleFetch(),
    env: {},
    ...over
  });
}

function formReq(fields, headers = {}) {
  const req = Readable.from([Buffer.from(new URLSearchParams(fields).toString())]);
  req.headers = { host: "api.smejj.com", "x-forwarded-proto": "https", ...headers };
  return req;
}
const cbUrl = new URL("https://api.smejj.com/api/auth/apple/callback");

test("fail-closed: ohne Konfiguration 503 (Start und Rueckkehr)", async () => {
  const h = handlers({ appleConfig: () => ({ servicesId: "", teamId: "", keyId: "", privateKey: "" }) });
  const a = mockRes(); await h.handleAppleAuthStart({ headers: {} }, a, new URL("https://x/api/auth/apple"));
  const b = mockRes(); await h.handleAppleCallback(formReq({}), b, cbUrl);
  assert.equal(a.statusCode, 503);
  assert.equal(b.statusCode, 503);
});

test("Start: 303 zu appleid.apple.com, Rueckkehr-Adresse aus Host, Handoff nur mit erlaubtem Ursprung", async () => {
  const h = handlers();
  const res = mockRes();
  await h.handleAppleAuthStart({ headers: { host: "api.smejj.com", "x-forwarded-proto": "https" } }, res,
    new URL("https://api.smejj.com/api/auth/apple?handoff=H1&returnOrigin=https://smejj.com"));
  assert.equal(res.statusCode, 303);
  const ziel = new URL(res.headers.Location);
  assert.equal(ziel.hostname, "appleid.apple.com");
  assert.equal(ziel.searchParams.get("redirect_uri"), "https://api.smejj.com/api/auth/apple/callback");
  const state = leseAppleAuthState(ziel.searchParams.get("state"), SECRET).daten;
  assert.equal(state.handoff, "H1");
  assert.equal(state.handoffReturn, "https://smejj.com");
  assert.equal(state.nonce, ziel.searchParams.get("nonce"));

  const fremd = mockRes();
  await h.handleAppleAuthStart({ headers: { host: "api.smejj.com" } }, fremd,
    new URL("https://api.smejj.com/api/auth/apple?handoff=H1&returnOrigin=https://evil.example"));
  const fs = leseAppleAuthState(new URL(fremd.headers.Location).searchParams.get("state"), SECRET).daten;
  assert.equal(fs.handoff, "");
  assert.equal(fs.handoffReturn, "");
});

function gueltigerState(extra = {}) {
  return signAppleAuthState({ nonce: "N1", handoff: "H1", handoffReturn: "https://smejj.com", returnTo: "/profile?apple=ok", exp: Date.now() + 60000, ...extra }, SECRET);
}

test("Rueckkehr: kompletter Erfolgsweg mit Handoff, Cookie und Name aus user", async () => {
  let hinterlegt = null;
  const h = handlers({ sessionHandoffStore: { complete: (id, daten) => { hinterlegt = { id, daten }; return { ok: true }; } } });
  const res = mockRes();
  await h.handleAppleCallback(formReq({
    code: "C", state: gueltigerState(), user: JSON.stringify({ name: { firstName: "Ada", lastName: "L" } })
  }), res, cbUrl);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?handoff=H1");
  assert.equal(res.headers["Set-Cookie"], "smejj_session=cookie-nutzer@example.com");
  assert.equal(hinterlegt.id, "H1");
  assert.equal(hinterlegt.daten.token, "token-nutzer@example.com");
  assert.equal(hinterlegt.daten.user.name, "Ada L");
  assert.equal(hinterlegt.daten.user.method, "apple");
});

test("Rueckkehr: ohne Handoff geht es auf returnTo", async () => {
  const res = mockRes();
  await handlers().handleAppleCallback(formReq({ code: "C", state: gueltigerState({ handoff: "", handoffReturn: "" }) }), res, cbUrl);
  assert.equal(res.headers.Location, "/profile?apple=ok");
});

test("Rueckkehr: Abbruch, fehlender Code, falsche nonce und Tauschfehler enden lesbar auf der Anmeldeseite", async () => {
  const h = handlers();
  const abbruch = mockRes();
  await h.handleAppleCallback(formReq({ error: "user_cancelled_authorize", state: gueltigerState() }), abbruch, cbUrl);
  assert.equal(abbruch.headers.Location, "https://smejj.com/auth/login?fehler=apple_abgebrochen");

  const keinCode = mockRes();
  await h.handleAppleCallback(formReq({ state: gueltigerState() }), keinCode, cbUrl);
  assert.equal(keinCode.headers.Location, "https://smejj.com/auth/login?fehler=apple_fehlgeschlagen");

  const nonce = mockRes();
  await h.handleAppleCallback(formReq({ code: "C", state: gueltigerState({ nonce: "ANDERE" }) }), nonce, cbUrl);
  assert.equal(nonce.headers.Location, "https://smejj.com/auth/login?fehler=apple_fehlgeschlagen");
  assert.equal(nonce.headers["Set-Cookie"], undefined);

  const tausch = mockRes();
  await handlers({ fetchImpl: appleFetch({ tokenStatus: 400 }) }).handleAppleCallback(formReq({ code: "C", state: gueltigerState() }), tausch, cbUrl);
  assert.equal(tausch.headers.Location, "https://smejj.com/auth/login?fehler=apple_fehlgeschlagen");
});

test("Rueckkehr: manipulierter State -> 400 ohne Ziel, abgelaufener State -> zurueck zur Anmeldung", async () => {
  const h = handlers();
  const kaputt = mockRes();
  await h.handleAppleCallback(formReq({ code: "C", state: gueltigerState() + "x" }), kaputt, cbUrl);
  assert.equal(kaputt.statusCode, 400);
  assert.equal(kaputt.headers.Location, undefined);

  const alt = mockRes();
  await h.handleAppleCallback(formReq({ code: "C", state: gueltigerState({ exp: Date.now() - 1 }) }), alt, cbUrl);
  assert.equal(alt.headers.Location, "https://smejj.com/auth/login?fehler=anmeldung_abgelaufen");
});

test("Rueckkehr: kein Open-Redirect ueber handoffReturn im (signierten) State", async () => {
  const res = mockRes();
  await handlers().handleAppleCallback(formReq({ code: "C", state: gueltigerState({ handoffReturn: "https://evil.example" }) }), res, cbUrl);
  assert.doesNotMatch(String(res.headers.Location), /evil\.example/);
});

test("Rueckkehr: nicht einloesbares Ticket -> ehrlich zurueck, mit Grund", async () => {
  const res = mockRes();
  await handlers({ sessionHandoffStore: { complete: () => ({ ok: false, error: "verbraucht" }) } })
    .handleAppleCallback(formReq({ code: "C", state: gueltigerState() }), res, cbUrl);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?fehler=anmeldung_abgelaufen");
});

test("Rueckkehr: zu grosser Koerper wird abgewiesen (413)", async () => {
  const req = Readable.from([Buffer.alloc(70 * 1024, "a")]);
  req.headers = { host: "api.smejj.com" };
  const res = mockRes();
  await handlers().handleAppleCallback(req, res, cbUrl);
  assert.equal(res.statusCode, 413);
});

// ---- Zugriffsrichtlinie -----------------------------------------------------

test("Richtlinie: Apple-Wege sind ohne Sitzung erreichbar, ein erfundener Nachbarpfad nicht", () => {
  assert.equal(istOeffentlicheApi("/api/auth/apple"), true);
  assert.equal(istOeffentlicheApi("/api/auth/apple/callback"), true);
  assert.equal(requiresAuthenticatedControlAccess({ method: "POST" }, { pathname: "/api/auth/apple/callback" }), false);
  assert.equal(requiresAuthenticatedControlAccess({ method: "POST" }, { pathname: "/api/auth/apple/geheim" }), true);
});

test("Richtlinie: Origin appleid.apple.com nur fuer die Rueckkehr-Adresse zugelassen", () => {
  const post = (pathname) => isSafeMutatingControlRequest(
    { method: "POST", headers: { origin: "https://appleid.apple.com", host: "api.smejj.com", "x-forwarded-proto": "https" } },
    { pathname }
  );
  assert.equal(post("/api/auth/apple/callback"), true);
  assert.equal(post("/api/auth/email/login"), false);
  assert.equal(post("/api/auth/google"), false);
  assert.equal(post("/api/chat"), false);
});
