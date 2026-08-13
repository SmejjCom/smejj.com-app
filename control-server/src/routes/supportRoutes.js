// smejj.com — Kundensupport Stufe 1: die Routen.
//
//   POST /api/support/ticket   angemeldeter Kunde meldet ein Problem,
//                              bekommt die KI-Sofortantwort direkt zurueck
//   GET  /api/support/meine    eigene Tickets samt Verlauf
//   GET  /api/support/alle     NUR Betreiber (SMEJJ_ADMIN_OWNER_EMAILS) —
//                              die Adminkonsolen-Ansicht kommt in Stufe 2;
//                              bis dahin traegt dieser Endpunkt die Aufsicht.
//
// Rate-Limit bewusst eng (5 Tickets je Stunde und Kunde): Support ist kein
// zweiter Chat. Wer mehr schreibt, redet mit der KI im Chat weiter.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { erstelleTicket, listeTickets } from "../admin/supportTickets.js";

const PREFIX = "/api/support";
const gate = createRateLimiter({ capacity: 5, refillPerSec: 5 / 3600, maxKeys: 5_000 });

function istBetreiber(email, env) {
  return String(env.SMEJJ_ADMIN_OWNER_EMAILS || "")
    .toLowerCase().split(",").map((e) => e.trim()).filter(Boolean)
    .includes(String(email || "").toLowerCase().trim());
}

export async function handleSupportRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const wer = String(req.authUser?.email || "").toLowerCase().trim();
  if (!wer) { privateJson(res, 401, { ok: false, error: "authentication_required" }); return true; }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");

  if ((req.method === "GET" || req.method === "HEAD") && rest === "meine") {
    const tickets = await listeTickets({ env, email: wer });
    privateJson(res, 200, { ok: true, total: tickets.length, tickets });
    return true;
  }

  if ((req.method === "GET" || req.method === "HEAD") && rest === "alle") {
    if (!istBetreiber(wer, env)) { privateJson(res, 403, { ok: false, error: "owner_only" }); return true; }
    const tickets = await listeTickets({ env });
    privateJson(res, 200, {
      ok: true,
      total: tickets.length,
      offen: tickets.filter((t) => t.status === "offen").length,
      tickets
    });
    return true;
  }

  if (req.method === "POST" && rest === "ticket") {
    const limit = gate.take(wer, 1);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      privateJson(res, 429, { ok: false, error: "support_rate_limit", retryAfterSec: limit.retryAfterSec });
      return true;
    }
    const body = await readJson(req).catch(() => ({}));
    const ergebnis = await erstelleTicket({ email: wer, betreff: body?.betreff, text: body?.text, env });
    if (!ergebnis.ok) { privateJson(res, 400, { ok: false, error: ergebnis.error }); return true; }
    privateJson(res, 200, {
      ok: true,
      ticket: ergebnis.ticket,
      hinweis: ergebnis.ticket.status === "beantwortet"
        ? "Automatische Antwort — ein Mensch liest mit."
        : "Angenommen. Ein Mensch uebernimmt, die Ampel ist informiert."
    });
    return true;
  }

  privateJson(res, 404, { ok: false, error: "support_route_not_found" });
  return true;
}
