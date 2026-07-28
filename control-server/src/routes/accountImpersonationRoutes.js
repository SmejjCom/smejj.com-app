// smejj.com — Einwilligung zur Impersonation aus Sicht der betroffenen Person.
//
// Warum eine eigene Route und nicht /api/admin/...:
// Die Einwilligung gibt die BETROFFENE PERSON. Die hat keine Adminrolle — sie
// ist ein gewoehnliches Konto. Haengt der Endpunkt hinter dem Admin-Gate,
// blockiert man genau denjenigen, dessen Zustimmung man braucht. Genau dieser
// Fehler ist im ersten Entwurf passiert und im Test aufgefallen.
//
// Hier gilt deshalb: angemeldet reicht. Wer welchen Vorgang beruehren darf,
// entscheidet impersonation.js anhand der E-Mail — nicht anhand einer Rolle.
//
// Nebeneffekt, der beabsichtigt ist: jede Person kann hier nachsehen, wer wann
// mit welcher Begruendung in ihr Konto geschaut hat. Das ist die Zusage aus dem
// Mockup ("Eintrag im eigenen Konto") und macht Impersonation ueberpruefbar.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { denyConsent, endImpersonation, grantConsent, listImpersonations } from "../admin/impersonation.js";

const PREFIX = "/api/account/impersonation";
const gate = createRateLimiter({ capacity: 30, refillPerSec: 0.5, maxKeys: 20_000 });

export async function handleAccountImpersonationRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const wer = String(req.authUser?.email || "").toLowerCase().trim();
  if (!wer) { privateJson(res, 401, { ok: false, error: "authentication_required" }); return true; }

  const limit = gate.take(wer, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "account_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");

  // Eigene Vorgaenge ansehen — nur die eigenen.
  if ((req.method === "GET" || req.method === "HEAD") && rest === "") {
    const liste = await listImpersonations({ env, subjectEmail: wer });
    if (!liste.ok) { privateJson(res, 503, { ok: false, error: liste.error }); return true; }
    privateJson(res, 200, {
      ok: true,
      total: liste.total,
      hinweis: "Hier steht, wer wann mit welcher Begruendung in dein Konto geschaut hat.",
      impersonations: liste.impersonations.map(sichtFuerBetroffene)
    });
    return true;
  }

  if (req.method !== "POST") { privateJson(res, 405, { ok: false, error: "method_not_allowed" }); return true; }

  const [id, schritt] = rest.split("/");
  if (!id || !schritt) { privateJson(res, 404, { ok: false, error: "account_route_not_found" }); return true; }

  const body = await readJson(req).catch(() => ({}));
  const ergebnis = schritt === "consent" ? await grantConsent(id, wer, { env })
    : schritt === "deny" ? await denyConsent(id, wer, { env })
      : schritt === "end" ? await endImpersonation(id, wer, { env })
        : { ok: false, error: "account_route_not_found" };

  if (!ergebnis.ok) {
    const status = ergebnis.error === "impersonation_consent_wrong_person"
      || ergebnis.error === "impersonation_end_not_allowed" ? 403
      : ergebnis.error === "impersonation_expired" ? 410
        : ergebnis.error === "impersonation_not_found" ? 404
          : ergebnis.error === "account_route_not_found" ? 404 : 409;
    privateJson(res, status, { ok: false, error: ergebnis.error });
    return true;
  }

  // Die Entscheidung der betroffenen Person gehoert genauso ins Audit-Log wie
  // die des Supports — sonst stuende dort nur eine Seite der Geschichte.
  await appendAuditEntry({
    actor: { email: wer, role: "subject", roleSource: "self" },
    action: `impersonation.${schritt}`,
    target: ergebnis.impersonation.subjectEmail,
    before: null,
    after: { id, operator: ergebnis.impersonation.operatorEmail, status: ergebnis.impersonation.status },
    reason: String(body?.reason || "").trim() || ergebnis.impersonation.reason,
    ip: clientIp(req)
  }, { env });

  privateJson(res, 200, { ok: true, impersonation: sichtFuerBetroffene(ergebnis.impersonation) });
  return true;
}

/** Was die betroffene Person sehen soll: wer, warum, wie lange, welcher Umfang. */
function sichtFuerBetroffene(vorgang) {
  return {
    id: vorgang.id,
    status: vorgang.status,
    wer: vorgang.operatorEmail,
    rolle: vorgang.operatorRole,
    grund: vorgang.reason,
    umfang: vorgang.scopes,
    breakGlass: vorgang.breakGlass === true,
    beantragtAm: vorgang.requestedAt,
    eingewilligtAm: vorgang.consentGivenAt,
    laeuftBis: vorgang.endsAt,
    beendetAm: vorgang.endedAt,
    beendetVon: vorgang.endedBy
  };
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
