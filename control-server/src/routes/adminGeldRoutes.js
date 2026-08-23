// smejj.com — Adminbereich Stufe 7: Geld (Module E und F).
//
// Rein lesend. Abrechnung wird bei Stripe geaendert, nicht hier: eine zweite
// Stelle, an der man ein Abo umstellen kann, waere eine zweite Wahrheit ueber
// Geld — und die faellt frueher oder later auseinander.
import { privateJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { abrechnungUebersicht } from "../admin/opsAbrechnung.js";
import { kostenUebersicht } from "../admin/opsKosten.js";
import { apiUebersicht } from "../admin/opsApi.js";

const PREFIX = "/api/admin/geld";
const RECHT = "billing.read";
const gate = createRateLimiter({ capacity: 40, refillPerSec: 0.6, maxKeys: 5_000 });

export async function handleAdminGeldRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    privateJson(res, 405, {
      ok: false,
      error: "admin_method_not_allowed",
      hinweis: "Abrechnung wird bei Stripe geaendert, nicht hier."
    });
    return true;
  }

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;

  if (can(actor.role, RECHT) !== GRANT.allow) {
    privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: RECHT });
    return true;
  }

  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const bereich = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  try {
    if (bereich === "abos") return privateJson(res, 200, await abrechnungUebersicht({ env })), true;
    if (bereich === "kosten") return privateJson(res, 200, await kostenUebersicht({ env })), true;
    // Modul G: die oeffentliche API aus Betreibersicht (Konten, Schluessel, Umsatz).
    if (bereich === "api") return privateJson(res, 200, await apiUebersicht({ env })), true;
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}
