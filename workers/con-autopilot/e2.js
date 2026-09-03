// con-Autopilot — e2-Zugriff (Single Responsibility: JSON/Listen im Bucket, keine Fachlogik).
// Nutzt den geprueften Signierer des Control-Servers; keine neue S3-Implementierung.
import { parseS3ListPage, signedS3Get, signedS3List, signedS3Put } from "../../control-server/src/storage/s3Signer.js";

export function e2KonfigAusEnv(env = process.env) {
  const k = {
    endpoint: String(env.IDRIVE_E2_ENDPOINT || "").replace(/\/$/, ""),
    region: env.IDRIVE_E2_REGION || "us-west-2",
    bucket: String(env.IDRIVE_E2_BUCKET || ""),
    accessKey: String(env.IDRIVE_E2_ACCESS_KEY || ""),
    secretKey: String(env.IDRIVE_E2_SECRET_KEY || "")
  };
  const fehlend = [
    !k.endpoint && "IDRIVE_E2_ENDPOINT", !k.bucket && "IDRIVE_E2_BUCKET",
    !k.accessKey && "IDRIVE_E2_ACCESS_KEY", !k.secretKey && "IDRIVE_E2_SECRET_KEY"
  ].filter(Boolean);
  return { ok: fehlend.length === 0, fehlend, ...k };
}

export function e2Client(konfig, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  if (!konfig?.ok) throw new Error("e2 nicht konfiguriert: " + (konfig?.fehlend || []).join(", "));
  const basis = { endpoint: konfig.endpoint, region: konfig.region, accessKey: konfig.accessKey,
    secretKey: konfig.secretKey, bucket: konfig.bucket, fetchImpl, timeoutMs };
  return {
    async getJson(key, standard = null) {
      const r = await signedS3Get({ ...basis, key, allowNotFound: true });
      if (!r.ok) return standard;
      try { return JSON.parse(r.body); } catch { throw new Error(`e2: ${key} ist kein JSON`); }
    },
    async getText(key) {
      const r = await signedS3Get({ ...basis, key, allowNotFound: true });
      return r.ok ? r.body : null;
    },
    async putJson(key, wert) {
      return signedS3Put({ ...basis, key, body: JSON.stringify(wert, null, 2), contentType: "application/json" });
    },
    async putText(key, text, contentType = "text/plain; charset=utf-8") {
      return signedS3Put({ ...basis, key, body: text, contentType });
    },
    /** Alle Objekte unter prefix: [{key, size}] — seitenweise, bis IsTruncated=false. */
    async liste(prefix) {
      const out = [];
      let token = null;
      for (let seite = 0; seite < 200; seite += 1) {
        const { body } = await signedS3List({ ...basis, prefix, continuationToken: token });
        const page = parseS3ListPage(body);
        const groessen = Array.from(String(body).matchAll(/<Size>(\d+)<\/Size>/g), (m) => Number(m[1]));
        page.keys.forEach((key, i) => out.push({ key, size: groessen[i] ?? null }));
        if (!page.isTruncated) break;
        token = page.nextContinuationToken;
      }
      return out;
    },
    async existiert(key) {
      const r = await signedS3Get({ ...basis, key, allowNotFound: true });
      return r.ok;
    }
  };
}
