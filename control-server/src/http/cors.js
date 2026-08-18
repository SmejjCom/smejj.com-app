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
    // PUT/DELETE seit dem Verlauf-Sync (Stufe 3, /api/chats): Der Browser
    // fragt sie im Preflight an; ohne Eintrag scheitert der PUT als stummes
    // "Failed to fetch" (live gemessen 2026-08-13). Die Freigabe hier oeffnet
    // nichts — welche Methoden eine Route WIRKLICH beantwortet, entscheidet
    // weiterhin ihr Handler.
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // x-smejj-cache-aehnlichkeit gehoert dazu, seit der semantische Cache
    // antwortet: ohne sie liest der Client zwar "semantischer-cache" als
    // Backend, kann aber nicht sehen, WIE aehnlich die Frage war. Genau die
    // Zahl braucht man, um einen Fehltreffer zu erkennen (gemessen 2026-08-18:
    // der Wert kam im Browser als null an, weil er nicht freigegeben war).
    "Access-Control-Expose-Headers": "x-smejj-model-backend, x-smejj-provider-request-id, x-smejj-cache-aehnlichkeit",
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
