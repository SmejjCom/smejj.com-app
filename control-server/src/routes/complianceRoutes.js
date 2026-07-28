// smejj.com — oeffentlicher Transparenz-Endpunkt nach EU-KI-Verordnung.
//
// Bewusst OHNE Anmeldung: eine Informationspflicht, die man erst nach dem Login
// erfuellen kann, ist keine. Der Endpunkt liefert nur oeffentliche Aussagen ueber
// die eingesetzten Systeme — keine Nutzerdaten, keine Betriebsdaten, keine
// Schluessel. Nur GET, damit er nichts veraendern kann.
import { json } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { transparencyReport } from "../compliance/aiTransparency.js";

const PREFIX = "/api/compliance";
// Grosszuegig, aber nicht offen: der Bericht ist klein und statisch.
const requestGate = createRateLimiter({ capacity: 60, refillPerSec: 1, maxKeys: 20_000 });

export function handleComplianceRoute(req, url, res) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { ok: false, error: "compliance_read_only" });
    return true;
  }

  const client = clientKey(req);
  const limit = requestGate.take(client, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    json(res, 429, { ok: false, error: "compliance_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  if (rest === "ai-systems" || rest === "") {
    // Oeffentlich cachebar: der Bericht aendert sich nur mit einem Deploy.
    res.setHeader("Cache-Control", "public, max-age=300");
    json(res, 200, transparencyReport());
    return true;
  }

  json(res, 404, { ok: false, error: "compliance_route_not_found" });
  return true;
}

function clientKey(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "unbekannt");
}
