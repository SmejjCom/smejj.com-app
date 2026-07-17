// smejj.com control-server — Worker-Authentifizierung (Single Responsibility: HMAC-Signaturprüfung).
// Salad Worker signieren jeden Status-Callback mit einem Shared Secret:
//   signature = hex( hmac-sha256( secret, `${timestamp}.${rawBody}` ) )
// Fail-closed: Ohne konfiguriertes Secret werden alle Worker-Callbacks abgelehnt (503).
// Timestamp-Fenster verhindert Replay-Angriffe; Vergleich ist timing-safe.
import crypto from "node:crypto";
import { hmac } from "../shared/hash.js";

export const WORKER_SIGNATURE_HEADER = "x-smejj-worker-signature";
export const WORKER_TIMESTAMP_HEADER = "x-smejj-worker-timestamp";
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function signWorkerPayload(secret, timestampMs, rawBody) {
  return hmac(String(secret), `${timestampMs}.${String(rawBody)}`, "hex");
}

export function verifyWorkerSignature({ env = {}, headers = {}, rawBody = "", nowMs = Date.now() } = {}) {
  const secret = String(env.SMEJJ_WORKER_CALLBACK_SECRET || "").trim();
  if (!secret) {
    return { ok: false, status: 503, reason: "worker_callback_secret_not_configured" };
  }

  const signature = String(headers[WORKER_SIGNATURE_HEADER] || "").trim();
  const timestamp = Number(headers[WORKER_TIMESTAMP_HEADER] || 0);
  if (!signature) return { ok: false, status: 401, reason: "worker_signature_missing" };
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { ok: false, status: 401, reason: "worker_timestamp_missing_or_invalid" };
  }
  if (Math.abs(nowMs - timestamp) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, status: 401, reason: "worker_timestamp_outside_allowed_window" };
  }

  const expected = signWorkerPayload(secret, timestamp, rawBody);
  const provided = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    return { ok: false, status: 401, reason: "worker_signature_invalid" };
  }

  return { ok: true, status: 200, reason: "verified" };
}
