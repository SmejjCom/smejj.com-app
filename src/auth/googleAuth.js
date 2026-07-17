import crypto from "node:crypto";
import { hmac } from "../../control-server/src/shared/hash.js";

export async function verifyGoogleIdToken(token, {
  clientId,
  expectedNonce = "",
  fetchImpl = fetch,
  nowMs = Date.now()
} = {}) {
  const [headerPart, payloadPart, signaturePart] = String(token || "").split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Ungueltiges Google Token.");
  const header = parseJwtPart(headerPart);
  const payload = parseJwtPart(payloadPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Ungueltige Google Signatur.");
  if (payload.aud !== clientId) throw new Error("Google Client-ID passt nicht.");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) throw new Error("Ungueltiger Google Issuer.");
  if (Number(payload.exp || 0) <= Math.floor(nowMs / 1000)) throw new Error("Google Token ist abgelaufen.");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("Google Login Nonce passt nicht.");
  const key = await getGooglePublicKey(header.kid, fetchImpl);
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    base64UrlDecode(signaturePart)
  );
  if (!ok) throw new Error("Google Signatur konnte nicht geprueft werden.");
  return payload;
}

export function signGoogleAuthState(data, secret) {
  const payload = base64UrlEncode(JSON.stringify(data));
  const signature = hmac(secret, payload, "base64url");
  return `${payload}.${signature}`;
}

export function verifyGoogleAuthState(state, secret, nowMs = Date.now()) {
  const [payload, signature] = String(state || "").split(".");
  const expected = hmac(secret, payload || "", "base64url");
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Google Login State ist ungueltig.");
  }
  const data = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  if (Number(data.exp || 0) <= nowMs) throw new Error("Google Login State ist abgelaufen.");
  return data;
}

async function getGooglePublicKey(kid, fetchImpl) {
  const response = await fetchImpl("https://www.googleapis.com/oauth2/v3/certs", { redirect: "error" });
  if (!response.ok) throw new Error("Google Zertifikate konnten nicht geladen werden.");
  const { keys = [] } = await response.json();
  const jwk = keys.find((key) => key.kid === kid);
  if (!jwk) throw new Error("Passendes Google Zertifikat fehlt.");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

function parseJwtPart(part) {
  return JSON.parse(base64UrlDecode(part).toString("utf8"));
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}
