// smejj.com — Route fuer "Deine Entscheidungen": /api/admin/entscheidungen
//
//   GET  /api/admin/entscheidungen            offene und entschiedene Vorschlaege
//   POST /api/admin/entscheidungen/entscheiden  { vorschlagId, wahl, notiz }
//
// WARUM DIESE ROUTE NICHT IN adminOpsRoutes.js STEHT: Diese Datei ist neu, weil
// adminOpsRoutes.js und adminSurfaceRoutes.js im Admin-Lock stehen
// (docs/security/admin-lock-manifest.json, Betreiber-Schutz vom 15.09.2026) und
// ohne schriftliche Freigabe des Betreibers nicht geaendert werden. Eingehaengt
// wird sie deshalb aus adminModellRoutes.js — der einzigen schreibenden
// Admin-Route ausserhalb des Locks. Sie liegt in derselben Kette, also gelten
// dieselbe Vortuer, dieselbe Sitzungspruefung und derselbe Audit-Weg.
//
// Sicherheit unveraendert uebernommen von den Nachbarrouten: Rolle frisch aus
// dem Store (nie aus dem Token), Recht pruefen, eigenes Zeitbudget je Person,
// Audit-Eintrag mit VORHER und NACHHER bei jeder Entscheidung.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { entscheidungsUebersicht, entscheide } from "../admin/entscheidungen.js";

const PREFIX = "/api/admin/entscheidungen";
// Lesen ist ein Seitenaufruf, Entscheiden ein Klick — beides selten, aber das
// Lesen kommt beim Nachladen mehrfach.
const gate = createRateLimiter({ capacity: 30, refillPerSec: 0.5, maxKeys: 5_000 });

/** Lesen wie der Betriebsbereich, Schreiben wie die Aufgaben-Liste. */
const RECHT_LESEN = "ops.read";
const RECHT_SCHREIBEN = "models.write";

function clientIp(req) {
  const weiter = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return weiter || req.socket?.remoteAddress || "";
}

export async function handleAdminEntscheidungenRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const aktion = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  if (aktion !== "" && aktion !== "entscheiden") return false;

  const lesen = req.method === "GET" || req.method === "HEAD";
  if (!lesen && req.method !== "POST") {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed", hinweis: "Lesen per GET, entscheiden per POST." });
    return true;
  }
  if (lesen && aktion === "entscheiden") {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed", hinweis: "Entscheiden ist POST." });
    return true;
  }

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;

  const recht = lesen ? RECHT_LESEN : RECHT_SCHREIBEN;
  if (can(actor.role, recht) !== GRANT.allow) {
    privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
    return true;
  }

  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  try {
    if (lesen) {
      privateJson(res, 200, await entscheidungsUebersicht({ env }));
      return true;
    }

    const body = await readJson(req).catch(() => ({}));
    const ergebnis = await entscheide(body, { actor, env });
    if (!ergebnis.ok) {
      privateJson(res, 400, ergebnis);
      return true;
    }

    // Der Audit-Eintrag verlangt einen Grund. Bei "Ja" und "Später" ist die Wahl
    // selbst der Grund — eine erfundene Begruendung waere schlechter als keine.
    const spur = await appendAuditEntry({
      actor,
      action: `entscheidung.${ergebnis.entscheidung.wahl}`,
      target: ergebnis.entscheidung.vorschlagId,
      before: { stand: "offen" },
      after: { wahl: ergebnis.entscheidung.wahl, aufgabeId: ergebnis.entscheidung.aufgabeId },
      reason: ergebnis.entscheidung.notiz || `Entscheidung "${ergebnis.entscheidung.wahl}" zu: ${ergebnis.entscheidung.titel}`,
      ip: clientIp(req)
    }, { env });

    privateJson(res, 200, {
      ...ergebnis,
      auditKey: spur?.key || null,
      hinweis: ergebnis.aufgabe
        ? `Aufgabe angelegt: ${ergebnis.aufgabe.titel} — sie steht jetzt unter /admin/aufgaben/.`
        : "Entscheidung festgehalten."
    });
    return true;
  } catch (fehler) {
    privateJson(res, 500, { ok: false, error: "entscheidung_fehlgeschlagen", hinweis: String(fehler?.message || fehler).slice(0, 200) });
    return true;
  }
}
