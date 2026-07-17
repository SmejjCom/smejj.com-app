// smejj.com — schlanker In-Memory Token-Bucket (Single Responsibility: Rate-Limit).
// Bewusst ohne externe Dependency und ohne persistenten Zustand: passt zum
// stateless Salad-Worker-Prinzip (Neustart = leerer Bucket, das ist ok, weil
// das Limit nur Missbrauch daempft, keine Geschaeftslogik traegt).
// Fail-open bei fehlender Client-Kennung, fail-closed sobald das Limit greift.

// Client-IP aus den ueblichen Proxy-Headern (Salad Gateway) ableiten.
export function clientKeyFromRequest(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").trim();
}

/**
 * Erzeugt einen Rate-Limiter mit Token-Bucket pro Schluessel.
 * @param {object} options
 * @param {number} options.capacity  Maximale Tokens (Burst).
 * @param {number} options.refillPerSec  Nachfuellrate pro Sekunde.
 * @param {number} [options.maxKeys]  Schutz gegen Speicherwachstum (LRU-Drop).
 * @param {() => number} [options.now]  Zeitquelle (fuer Tests).
 */
export function createRateLimiter({ capacity, refillPerSec, maxKeys = 10_000, now = () => Date.now() } = {}) {
  if (!(capacity > 0) || !(refillPerSec > 0)) {
    throw new Error("rateLimiter: capacity und refillPerSec muessen > 0 sein");
  }
  const buckets = new Map();

  function take(key, cost = 1) {
    // Ohne Schluessel (keine IP ermittelbar) nicht blockieren — fail-open.
    if (!key) return { allowed: true, remaining: capacity, retryAfterSec: 0 };

    const nowMs = now();
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        // Aeltesten Eintrag verwerfen (Map bewahrt Einfuegereihenfolge).
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      bucket = { tokens: capacity, updated: nowMs };
      buckets.set(key, bucket);
    } else {
      const elapsedSec = Math.max(0, (nowMs - bucket.updated) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
      bucket.updated = nowMs;
      // Als "zuletzt gesehen" ans Ende der Map schieben (LRU).
      buckets.delete(key);
      buckets.set(key, bucket);
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
    }
    const deficit = cost - bucket.tokens;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(deficit / refillPerSec))
    };
  }

  return { take, size: () => buckets.size };
}
