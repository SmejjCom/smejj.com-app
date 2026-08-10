// smejj.com Control Server — generalisierte Session-Registry (H2, 2026-08-09).
//
// Problem (Audit): E-Mail-Sitzungen haben eine serverseitige sid-Registry und
// sind einzeln widerrufbar. Google-/Passkey-/GitHub-/Magic-Link-Sitzungen waren
// rein HMAC-signiert (180 Tage) und NICHT widerrufbar — Logout loeschte nur die
// lokale Kopie, ein kopiertes Token blieb bis zum Ablauf gueltig.
//
// Diese Registry generalisiert den Widerruf auf ALLE Methoden. Sie ist additiv
// und flag-gegatet (SMEJJ_SESSION_REGISTRY, Default AUS):
//  - Flag AUS  -> altes Verhalten, keine sid-Vergabe fuer Nicht-E-Mail.
//  - Flag AN   -> Login vergibt eine sid und hinterlegt sie hier als aktiv;
//                 jede Anfrage prueft die sid; Logout markiert sie widerrufen.
//
// Rueckwaertskompatibel: Tokens OHNE sid (vor Flag-Aktivierung ausgestellt)
// gelten weiter bis zum Ablauf — nur Tokens MIT sid werden geprueft.
//
// Ablage: auth/sessions/{sid}.json in IDrive e2 (derselbe Objektspeicher wie die
// E-Mail-Registry). Fail-closed bei Storage-Stoerung wie emailSessionStillValid.

import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

export function sessionRegistryEnabled(env = process.env) {
  return ["1", "true", "yes"].includes(String(env.SMEJJ_SESSION_REGISTRY || "").toLowerCase());
}

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

// Neue Session-ID: 144 Bit Entropie, URL-/pfadsicher.
export function newSessionId() {
  return crypto.randomBytes(18).toString("base64url");
}

// sid -> Objektschluessel. Nur pfadsichere Zeichen zulassen (kein Traversal).
function sessionObjectKey(sid) {
  const safe = String(sid || "").replace(/[^A-Za-z0-9_-]/g, "");
  return `auth/sessions/${safe}.json`;
}

// Kurzer Cache wie bei der E-Mail-Pruefung: ein S3-Read pro Request waere sonst
// zu teuer. Fail-closed-Ergebnisse werden ebenfalls kurz gecacht.
const CHECK_TTL_MS = 30_000;
const checkCache = new Map();

/** Beim Login: sid als aktive Sitzung hinterlegen. Best-effort. */
export async function registerSession({ sid, subject, method, expiresAtMs }, env = process.env) {
  const cfg = idriveConfig(env);
  if (!cfg || !sid) return { ok: false, reason: "not_configured" };
  const record = {
    schemaVersion: 1,
    sid,
    subject: String(subject || "").slice(0, 300),
    method: String(method || "").slice(0, 40),
    createdAt: new Date().toISOString(),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
    revoked: false
  };
  try {
    await signedS3Put({ ...cfg, key: sessionObjectKey(sid), body: JSON.stringify(record), contentType: "application/json" });
    checkCache.set(sid, { ok: true, until: Date.now() + CHECK_TTL_MS });
    return { ok: true };
  } catch {
    // Registrierung best-effort: schlaegt sie fehl, bleibt die Sitzung ohne
    // Registry-Eintrag — dann greift die Rueckwaerts-Regel (sid vorhanden, aber
    // kein Eintrag) unten. Damit Nutzer nicht ausgesperrt werden, behandelt
    // isSessionActive einen 404 NICHT als "widerrufen" (siehe dort).
    return { ok: false, reason: "write_failed" };
  }
}

/**
 * Pro Request: ist die sid noch aktiv? true, wenn aktiv ODER wenn (noch) kein
 * Eintrag existiert (Registrierung best-effort/asynchron — kein Aussperren).
 * false NUR bei explizitem revoked-Flag oder abgelaufenem Eintrag. Fail-closed
 * bei Storage-Stoerung (wie emailSessionStillValid).
 */
export async function isSessionActive(sid, env = process.env) {
  if (!sid) return true;
  const cached = checkCache.get(sid);
  if (cached && cached.until > Date.now()) return cached.ok;
  const cfg = idriveConfig(env);
  if (!cfg) return true; // Registry nicht konfiguriert -> nicht sperren
  let ok = false;
  try {
    const { body, status } = await signedS3Get({ ...cfg, key: sessionObjectKey(sid), allowNotFound: true });
    if (status === 404 || !body) {
      ok = true; // kein Eintrag -> nicht widerrufen (Registrierung evtl. noch offen)
    } else {
      const rec = JSON.parse(body);
      const expired = rec.expiresAt ? Date.parse(rec.expiresAt) <= Date.now() : false;
      ok = rec.revoked !== true && !expired;
    }
  } catch {
    ok = false; // Storage-Stoerung: fail-closed
  }
  checkCache.set(sid, { ok, until: Date.now() + CHECK_TTL_MS });
  if (checkCache.size > 5000) checkCache.clear();
  return ok;
}

/** Logout / Fern-Widerruf: die sid als widerrufen markieren. */
export async function revokeSession(sid, env = process.env) {
  const cfg = idriveConfig(env);
  if (!cfg || !sid) return { ok: false };
  try {
    const { body, status } = await signedS3Get({ ...cfg, key: sessionObjectKey(sid), allowNotFound: true });
    const rec = status === 404 || !body
      ? { schemaVersion: 1, sid, method: "", createdAt: new Date().toISOString(), expiresAt: null }
      : JSON.parse(body);
    rec.revoked = true;
    rec.revokedAt = new Date().toISOString();
    await signedS3Put({ ...cfg, key: sessionObjectKey(sid), body: JSON.stringify(rec), contentType: "application/json" });
    checkCache.set(sid, { ok: false, until: Date.now() + CHECK_TTL_MS });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function __clearRegistryCacheForTests() {
  checkCache.clear();
}
