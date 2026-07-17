// smejj.com — CORS fuer Browser-Zugriffe vom PWA-Frontend (smejj.com) auf den
// API-Server (z. B. Salad Container Gateway). FAIL-CLOSED: unbekannte Origins
// erhalten KEINE Access-Control-Header und Preflights werden mit 403 beendet.
// Zusaetzliche Origins (z. B. lokale Entwicklung) via SMEJJ_ALLOWED_ORIGINS (kommagetrennt).

const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["https://smejj.com", "https://www.smejj.com"]);

export function allowedOriginsFromEnv(env = process.env) {
  const extra = String(env.SMEJJ_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => /^https?:\/\//.test(origin));
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
}

/** CORS-Header fuer einen erlaubten Origin — null fuer unbekannte (fail-closed). */
export function corsHeadersFor(originHeader, env = process.env) {
  const origin = String(originHeader || "").replace(/\/$/, "");
  if (!origin || !allowedOriginsFromEnv(env).includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "x-smejj-model-backend, x-smejj-provider-request-id",
    "Access-Control-Max-Age": "600"
  };
}

/**
 * Beantwortet OPTIONS-Preflights fuer /api/*: 204 mit Headern bei erlaubtem
 * Origin, sonst 403 ohne CORS-Header. Rueckgabe true = Request ist beantwortet.
 */
export function handlePreflight(req, res, env = process.env) {
  if ((req.method || "") !== "OPTIONS") return false;
  const headers = corsHeadersFor(req.headers?.origin, env);
  res.writeHead(headers ? 204 : 403, headers || {});
  res.end();
  return true;
}
