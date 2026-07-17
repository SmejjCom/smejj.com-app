// smejj.com — WebAuthn-Challenge als signiertes, kurzlebiges Token (stateless).
// Der Server merkt sich KEINE Challenge im Speicher (Salad ist zustandslos/
// mehrere Replicas). Die Options-Antwort gibt das HMAC-signierte Token zurueck,
// der Client schickt es beim Verify im Body zurueck. Das funktioniert auch
// cross-origin (smejj.com -> Salad-API) ohne Cookie. Ein Token kann nicht
// gefaelscht werden (kein Secret); die Challenge selbst steckt zusaetzlich
// signiert im clientDataJSON des Authenticators. Fail-closed bei ungueltig/alt.
import crypto from "node:crypto";
import { hmac } from "../../shared/hash.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function createChallenge() {
  return crypto.randomBytes(32).toString("base64url");
}

export function signChallengeToken({ secret, challenge, type, userId = "", nowMs = Date.now() }) {
  const payload = Buffer.from(JSON.stringify({
    challenge,
    type,
    userId,
    exp: nowMs + CHALLENGE_TTL_MS
  })).toString("base64url");
  const signature = hmac(secret, payload, "base64url");
  return `${payload}.${signature}`;
}

export function verifyChallengeToken({ secret, token, expectedType, nowMs = Date.now() }) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) throw new Error("Challenge-Token fehlt oder ist unvollstaendig");
  const expected = hmac(secret, payload, "base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Challenge-Token-Signatur ungueltig");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (data.type !== expectedType) throw new Error("Challenge-Token-Typ passt nicht");
  if (Number(data.exp || 0) <= nowMs) throw new Error("Challenge abgelaufen");
  return data;
}
