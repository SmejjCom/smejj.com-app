// smejj.com control-server — Stripe-Webhook-Signaturpruefung (Single Responsibility).
// Prueft den `Stripe-Signature`-Header (Schema: t=<unix>,v1=<hmac>,...) gegen den
// rohen Request-Body. Pure Funktion, ohne I/O — dadurch ohne Server-Boot testbar.
// Fail-closed: jede Abweichung (fehlender Header, falsche HMAC, zu alter
// Zeitstempel) ergibt { ok: false, reason } — niemals ein stilles Durchwinken.
import crypto from "node:crypto";

export const DEFAULT_TOLERANCE_SECONDS = 300;

// Input: rawBody (String, exakt wie empfangen), signatureHeader (String),
// secret (whsec_...), optional toleranceSeconds und nowSeconds (fuer Tests).
// Output: { ok: true } oder { ok: false, reason: string }.
export function verifyStripeSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  if (!secret) return { ok: false, reason: "webhook_secret_missing" };
  const header = String(signatureHeader || "");
  if (!header) return { ok: false, reason: "signature_header_missing" };

  let timestamp = 0;
  const candidates = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => String(s || "").trim());
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) candidates.push(value.toLowerCase());
  }
  if (!timestamp || candidates.length === 0) return { ok: false, reason: "signature_header_malformed" };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { ok: false, reason: "timestamp_outside_tolerance" };

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${String(rawBody || "")}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  for (const candidate of candidates) {
    const candidateBuffer = Buffer.from(candidate, "hex");
    if (candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
