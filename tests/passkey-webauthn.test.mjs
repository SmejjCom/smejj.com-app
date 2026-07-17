// smejj.com — WebAuthn/Passkey-Tests: voller Round-Trip mit selbst erzeugtem
// P-256-Schluessel (simuliert einen Plattform-Authenticator), plus Encoding-,
// Challenge- und Store-Tests. Kein echter Authenticator noetig.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { base64UrlToBuffer, bufferToBase64Url, decodeCbor } from "../control-server/src/auth/webauthn/encoding.js";
import { verifyAuthentication, verifyRegistration } from "../control-server/src/auth/webauthn/ceremony.js";
import { createChallenge, signChallengeToken, verifyChallengeToken } from "../control-server/src/auth/webauthn/challenge.js";
import { _resetMemoryStore, findCredential, listCredentials, saveCredential, updateSignCount } from "../control-server/src/auth/passkeyStore.js";
import { handlePasskeyRegisterOptions } from "../control-server/src/routes/passkeyRoutes.js";

// ---- Minimaler CBOR-Encoder nur fuer die Tests ----
function encUint(n) {
  if (n < 24) return Buffer.from([n]);
  if (n < 256) return Buffer.from([0x18, n]);
  if (n < 65536) return Buffer.from([0x19, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5); b[0] = 0x1a; b.writeUInt32BE(n, 1); return b;
}
function withMajor(buf, major) { const c = Buffer.from(buf); c[0] = (c[0] & 0x1f) | (major << 5); return c; }
function encNint(n) { return withMajor(encUint(-1 - n), 1); }
function encBstr(buf) { return Buffer.concat([withMajor(encUint(buf.length), 2), buf]); }
function encTstr(s) { const b = Buffer.from(s, "utf8"); return Buffer.concat([withMajor(encUint(b.length), 3), b]); }
function encInt(n) { return n < 0 ? encNint(n) : encUint(n); }
function encMap(entries) {
  const head = withMajor(encUint(entries.length), 5);
  return Buffer.concat([head, ...entries.flatMap(([k, v]) => [k, v])]);
}

const RP_ID = "localhost";
const ORIGIN = "http://localhost";
const ORIGINS = [ORIGIN];

function routeReq(body, authUser = null) {
  const text = JSON.stringify(body || {});
  return {
    authUser,
    on(event, listener) {
      if (event === "data") queueMicrotask(() => listener(text));
      if (event === "end") queueMicrotask(() => listener());
    }
  };
}

function routeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

function makeAuthData({ rpId, flags, signCount, credentialId, coseKey }) {
  const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
  const head = Buffer.alloc(5);
  head[0] = flags;
  head.writeUInt32BE(signCount, 1);
  const parts = [rpIdHash, head];
  if (credentialId && coseKey) {
    const aaguid = Buffer.alloc(16, 0);
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(credentialId.length, 0);
    parts.push(aaguid, idLen, credentialId, coseKey);
  }
  return Buffer.concat(parts);
}

function coseKeyFromJwk(jwk) {
  const x = base64UrlToBuffer(jwk.x);
  const y = base64UrlToBuffer(jwk.y);
  // {1:2 (EC2), 3:-7 (ES256), -1:1 (P-256), -2:x, -3:y}
  return encMap([
    [encInt(1), encInt(2)],
    [encInt(3), encInt(-7)],
    [encInt(-1), encInt(1)],
    [encInt(-2), encBstr(x)],
    [encInt(-3), encBstr(y)]
  ]);
}

function clientData(type, challenge) {
  return bufferToBase64Url(Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN }), "utf8"));
}

test("Encoding: base64url round-trip", () => {
  const buf = crypto.randomBytes(40);
  assert.deepEqual(base64UrlToBuffer(bufferToBase64Url(buf)), buf);
});

test("Challenge-Token: gueltig, manipuliert, abgelaufen, falscher Typ", () => {
  const secret = "test-secret";
  const challenge = createChallenge();
  const token = signChallengeToken({ secret, challenge, type: "reg", userId: "u_1" });
  const data = verifyChallengeToken({ secret, token, expectedType: "reg" });
  assert.equal(data.challenge, challenge);
  assert.throws(() => verifyChallengeToken({ secret, token: token.slice(0, -2) + "xy", expectedType: "reg" }));
  assert.throws(() => verifyChallengeToken({ secret, token, expectedType: "auth" }));
  const expired = signChallengeToken({ secret, challenge, type: "reg", userId: "u_1", nowMs: Date.now() - 10 * 60 * 1000 });
  assert.throws(() => verifyChallengeToken({ secret, token: expired, expectedType: "reg" }));
});

test("Passkey-Registrierung erfordert eine Sitzung und bindet die Server-Identitaet", async () => {
  _resetMemoryStore();
  const env = { SMEJJ_SESSION_SECRET: "test-secret", SMEJJ_PASSKEY_RP_ID: "localhost", SMEJJ_ALLOWED_ORIGINS: ORIGIN };
  const anonymous = routeRes();
  await handlePasskeyRegisterOptions(routeReq({ email: "owner@example.com" }), anonymous, { env });
  assert.equal(anonymous.statusCode, 401);

  const authenticated = routeRes();
  await handlePasskeyRegisterOptions(routeReq(
    { email: "attacker@example.com", displayName: "Attacker" },
    { email: "owner@example.com", name: "Owner" }
  ), authenticated, { env });
  assert.equal(authenticated.statusCode, 200);
  const options = authenticated.payload();
  assert.equal(options.user.name, "owner@example.com");
  const challenge = verifyChallengeToken({ secret: env.SMEJJ_SESSION_SECRET, token: options.challengeToken, expectedType: "reg" });
  assert.match(challenge.userId, /^u_/);
  assert.doesNotMatch(JSON.stringify(options), /attacker@example\.com|Attacker/);
});

test("Voller Round-Trip: Registrierung + Anmeldung mit echtem P-256-Schluessel", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = crypto.randomBytes(16);
  const coseKey = coseKeyFromJwk(jwk);

  // --- Registrierung ---
  const regChallenge = createChallenge();
  const regAuthData = makeAuthData({ rpId: RP_ID, flags: 0x45, signCount: 0, credentialId, coseKey });
  const attestationObject = bufferToBase64Url(encMap([
    [encTstr("fmt"), encTstr("none")],
    [encTstr("attStmt"), encMap([])],
    [encTstr("authData"), encBstr(regAuthData)]
  ]));
  const credential = verifyRegistration({
    attestationObject,
    clientDataJSON: clientData("webauthn.create", regChallenge),
    expectedChallenge: regChallenge,
    allowedOrigins: ORIGINS,
    expectedRpId: RP_ID
  });
  assert.equal(credential.credentialId, bufferToBase64Url(credentialId));
  assert.equal(credential.publicKeyJwk.kty, "EC");
  assert.equal(credential.signCount, 0);

  // --- Anmeldung (Assertion) ---
  const authChallenge = createChallenge();
  const authData = makeAuthData({ rpId: RP_ID, flags: 0x05, signCount: 5 });
  const cdJSON = clientData("webauthn.get", authChallenge);
  const clientHash = crypto.createHash("sha256").update(base64UrlToBuffer(cdJSON)).digest();
  const signature = crypto.sign("sha256", Buffer.concat([authData, clientHash]), privateKey); // DER
  const result = verifyAuthentication({
    credential,
    authenticatorData: bufferToBase64Url(authData),
    clientDataJSON: cdJSON,
    signature: bufferToBase64Url(signature),
    expectedChallenge: authChallenge,
    allowedOrigins: ORIGINS,
    expectedRpId: RP_ID
  });
  assert.equal(result.newSignCount, 5);
});

test("Anmeldung lehnt falsche Challenge, fremde Origin und kaputte Signatur ab", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credential = { credentialId: "x", publicKeyJwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, signCount: 0 };
  const challenge = createChallenge();
  const authData = makeAuthData({ rpId: RP_ID, flags: 0x05, signCount: 1 });
  const cdJSON = clientData("webauthn.get", challenge);
  const clientHash = crypto.createHash("sha256").update(base64UrlToBuffer(cdJSON)).digest();
  const sig = bufferToBase64Url(crypto.sign("sha256", Buffer.concat([authData, clientHash]), privateKey));

  // falsche Challenge
  assert.throws(() => verifyAuthentication({ credential, authenticatorData: bufferToBase64Url(authData), clientDataJSON: cdJSON, signature: sig, expectedChallenge: "andere", allowedOrigins: ORIGINS, expectedRpId: RP_ID }));
  // fremde Origin
  assert.throws(() => verifyAuthentication({ credential, authenticatorData: bufferToBase64Url(authData), clientDataJSON: cdJSON, signature: sig, expectedChallenge: challenge, allowedOrigins: ["https://evil.example"], expectedRpId: RP_ID }));
  // kaputte Signatur
  const badSig = bufferToBase64Url(Buffer.concat([base64UrlToBuffer(sig).subarray(0, -1), Buffer.from([0x00])]));
  assert.throws(() => verifyAuthentication({ credential, authenticatorData: bufferToBase64Url(authData), clientDataJSON: cdJSON, signature: badSig, expectedChallenge: challenge, allowedOrigins: ORIGINS, expectedRpId: RP_ID }));
});

test("passkeyStore: speichern, finden, Zaehler aktualisieren (In-Memory)", async () => {
  _resetMemoryStore();
  const env = {}; // keine IDrive-Konfig -> In-Memory
  await saveCredential("u_test", { credentialId: "cred1", publicKeyJwk: { kty: "EC" }, signCount: 0, fmt: "none" }, { displayName: "Test" }, env);
  const list = await listCredentials("u_test", env);
  assert.equal(list.length, 1);
  const found = await findCredential("u_test", "cred1", env);
  assert.ok(found);
  await updateSignCount("u_test", "cred1", 9, env);
  assert.equal((await findCredential("u_test", "cred1", env)).signCount, 9);
});

test("CBOR-Decoder liest verschachtelte Map korrekt", () => {
  const buf = encMap([[encTstr("a"), encInt(1)], [encTstr("b"), encBstr(Buffer.from([1, 2, 3]))]]);
  const map = decodeCbor(buf);
  assert.equal(map.get("a"), 1);
  assert.deepEqual(map.get("b"), Buffer.from([1, 2, 3]));
});
