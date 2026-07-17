// smejj.com — WebAuthn-Zeremonien (Single Responsibility: Registrierung + Assertion pruefen).
// Reines Node crypto, keine Dependency. Verifiziert clientDataJSON, rpIdHash,
// User-Present-Flag, Signatur und Signaturzaehler. Attestation wird als "none"
// akzeptiert (Passkeys/Plattform-Authenticator) — es werden nur oeffentliche
// Schluessel gespeichert. Fail-closed: jeder Fehler wirft, nichts wird "geraten".
import crypto from "node:crypto";
import { base64UrlToBuffer, bufferToBase64Url, decodeCbor, decodeCborFirst } from "./encoding.js";

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

// COSE-Schluessel-Parameter (RFC 8152)
const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_EC_CRV = -1;
const COSE_EC_X = -2;
const COSE_EC_Y = -3;
const COSE_RSA_N = -1;
const COSE_RSA_E = -2;

const ALG_ES256 = -7;
const ALG_RS256 = -257;

export function parseClientData(clientDataJSONb64, expectedType, expectedChallenge, allowedOrigins) {
  const json = JSON.parse(base64UrlToBuffer(clientDataJSONb64).toString("utf8"));
  if (json.type !== expectedType) throw new Error(`clientData.type erwartet ${expectedType}, war ${json.type}`);
  if (json.challenge !== expectedChallenge) throw new Error("clientData.challenge stimmt nicht");
  const origin = String(json.origin || "").replace(/\/$/, "");
  if (!allowedOrigins.includes(origin)) throw new Error(`Origin ${origin} nicht erlaubt`);
  return json;
}

// authenticatorData: rpIdHash(32) | flags(1) | signCount(4) | [attestedCredData] | [ext]
export function parseAuthenticatorData(authData) {
  if (authData.length < 37) throw new Error("authenticatorData zu kurz");
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const signCount = authData.readUInt32BE(33);
  const result = {
    rpIdHash,
    flags,
    signCount,
    userPresent: Boolean(flags & FLAG_USER_PRESENT),
    userVerified: Boolean(flags & FLAG_USER_VERIFIED),
    hasAttestedCredential: Boolean(flags & FLAG_ATTESTED_CREDENTIAL)
  };
  if (result.hasAttestedCredential) {
    let pos = 37;
    result.aaguid = authData.subarray(pos, pos + 16); pos += 16;
    const credIdLen = authData.readUInt16BE(pos); pos += 2;
    result.credentialId = authData.subarray(pos, pos + credIdLen); pos += credIdLen;
    const { value: coseKey } = decodeCborFirst(authData, pos);
    result.publicKeyJwk = coseToJwk(coseKey);
  }
  return result;
}

export function coseToJwk(coseKey) {
  const kty = coseKey.get(COSE_KTY);
  const alg = coseKey.get(COSE_ALG);
  if (kty === 2) { // EC2
    if (alg !== ALG_ES256) throw new Error(`EC-Algorithmus ${alg} nicht unterstuetzt (nur ES256)`);
    return {
      kty: "EC",
      crv: "P-256",
      x: bufferToBase64Url(coseKey.get(COSE_EC_X)),
      y: bufferToBase64Url(coseKey.get(COSE_EC_Y)),
      alg: "ES256"
    };
  }
  if (kty === 3) { // RSA
    if (alg !== ALG_RS256) throw new Error(`RSA-Algorithmus ${alg} nicht unterstuetzt (nur RS256)`);
    return {
      kty: "RSA",
      n: bufferToBase64Url(coseKey.get(COSE_RSA_N)),
      e: bufferToBase64Url(coseKey.get(COSE_RSA_E)),
      alg: "RS256"
    };
  }
  throw new Error(`COSE-Schluesseltyp ${kty} nicht unterstuetzt`);
}

// Registrierung: attestationObject + clientDataJSON pruefen, Credential-Record zurueckgeben.
export function verifyRegistration({ attestationObject, clientDataJSON, expectedChallenge, allowedOrigins, expectedRpId }) {
  parseClientData(clientDataJSON, "webauthn.create", expectedChallenge, allowedOrigins);
  const attestation = decodeCbor(base64UrlToBuffer(attestationObject));
  const authData = attestation.get("authData");
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.userPresent) throw new Error("User Present Flag fehlt");
  assertRpIdHash(parsed.rpIdHash, expectedRpId);
  if (!parsed.hasAttestedCredential || !parsed.publicKeyJwk) throw new Error("Kein Credential im authenticatorData");
  return {
    credentialId: bufferToBase64Url(parsed.credentialId),
    publicKeyJwk: parsed.publicKeyJwk,
    signCount: parsed.signCount,
    userVerified: parsed.userVerified,
    fmt: attestation.get("fmt") || "none"
  };
}

// Anmeldung: Assertion gegen gespeicherten oeffentlichen Schluessel pruefen.
export function verifyAuthentication({ credential, authenticatorData, clientDataJSON, signature, expectedChallenge, allowedOrigins, expectedRpId }) {
  parseClientData(clientDataJSON, "webauthn.get", expectedChallenge, allowedOrigins);
  const authData = base64UrlToBuffer(authenticatorData);
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.userPresent) throw new Error("User Present Flag fehlt");
  assertRpIdHash(parsed.rpIdHash, expectedRpId);

  const clientHash = crypto.createHash("sha256").update(base64UrlToBuffer(clientDataJSON)).digest();
  const signedData = Buffer.concat([authData, clientHash]);
  const publicKey = crypto.createPublicKey({ key: credential.publicKeyJwk, format: "jwk" });
  const sig = base64UrlToBuffer(signature);

  const ok = credential.publicKeyJwk.kty === "EC"
    ? crypto.verify("sha256", signedData, { key: publicKey, dsaEncoding: "der" }, sig)
    : crypto.verify("sha256", signedData, publicKey, sig);
  if (!ok) throw new Error("Signatur ungueltig");

  // Signaturzaehler: muss steigen, falls der Authenticator ihn nutzt (0 = deaktiviert).
  if (parsed.signCount > 0 && parsed.signCount <= Number(credential.signCount || 0)) {
    throw new Error("Signaturzaehler nicht gestiegen (moeglicher Klon)");
  }
  return { newSignCount: parsed.signCount, userVerified: parsed.userVerified };
}

function assertRpIdHash(rpIdHash, expectedRpId) {
  const expected = crypto.createHash("sha256").update(String(expectedRpId), "utf8").digest();
  if (!crypto.timingSafeEqual(rpIdHash, expected)) throw new Error("rpIdHash stimmt nicht mit erwarteter RP-ID");
}
