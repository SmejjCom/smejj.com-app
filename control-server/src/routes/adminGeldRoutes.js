// smejj.com — Adminbereich Stufe 7: Geld (Module E und F).
//
// Rein lesend — mit EINER Ausnahme seit 2026-09-03: unter /api das Ausstellen
// und Widerrufen von Admin-Schluesseln (smejj-adm-…, publicApiAdminKeys.js).
// Abrechnung wird weiter bei Stripe geaendert, nicht hier: eine zweite
// Stelle, an der man ein Abo umstellen kann, waere eine zweite Wahrheit ueber
// Geld — und die faellt frueher oder later auseinander.
import { privateJson, readJson } from "../http/respond.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { listeAusgestellt, setzeBudget, stelleAus, widerrufeAusgestellt } from "../publicapi/publicApiAdminKeys.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { abrechnungUebersicht } from "../admin/opsAbrechnung.js";
import { kostenUebersicht } from "../admin/opsKosten.js";
import { apiUebersicht } from "../admin/opsApi.js";
import { umsatzUebersicht } from "../admin/opsUmsatz.js";

// Startzeit des Prozesses: die Modellkosten des Token-Messers zaehlen ab hier.
const GESTARTET_MS = Date.now();

const PREFIX = "/api/admin/geld";
const RECHT = "billing.read";
const gate = createRateLimiter({ capacity: 40, refillPerSec: 0.6, maxKeys: 5_000 });

export async function handleAdminGeldRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const schreibend = req.method === "POST"
    && [`${PREFIX}/api/ausstellen`, `${PREFIX}/api/widerrufen`, `${PREFIX}/api/budget`].includes(url.pathname);
  if (req.method !== "GET" && req.method !== "HEAD" && !schreibend) {
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
    // Modul E Teil 2: Abos & Umsatz — Abrechnung plus MRR, Aufladungen, Kosten, je Plan (Design-Vorschlag 2026-08-23).
    if (bereich === "umsatz") return privateJson(res, 200, await umsatzUebersicht({ env, startzeitMs: GESTARTET_MS })), true;
    if (bereich === "kosten") return privateJson(res, 200, await kostenUebersicht({ env })), true;
    // Modul G: die oeffentliche API aus Betreibersicht (Konten, Schluessel, Umsatz).
    if (bereich === "api") return privateJson(res, 200, await apiUebersicht({ env })), true;
    // Vom Admin ausgestellte Schluessel (Beschluss 2026-09-03).
    if (bereich === "api/ausgestellt") return await ausgestellt(res, actor, env), true;
    if (bereich === "api/ausstellen") return await ausstellen(req, res, actor, env), true;
    if (bereich === "api/widerrufen") return await widerrufen(req, res, actor, env), true;
    if (bereich === "api/budget") return await budget(req, res, actor, env), true;
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    const status = [400, 404, 409].includes(Number(error?.status)) ? Number(error.status) : 503;
    privateJson(res, status, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

async function ausgestellt(res, actor, env) {
  if (can(actor.role, "apikeys.read") !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: "apikeys.read" });
  }
  return privateJson(res, 200, await listeAusgestellt(env));
}

async function ausstellen(req, res, actor, env) {
  if (can(actor.role, "apikeys.issue") !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: "apikeys.issue" });
  }
  const body = await readJson(req).catch(() => ({}));
  const ergebnis = await stelleAus({
    actor,
    ausgestelltFuer: body?.ausgestelltFuer,
    laufzeit: body?.laufzeit,
    notiz: body?.notiz,
    budgetToken: body?.budgetToken
  }, env);
  const s = ergebnis.schluessel;
  await appendAuditEntry({
    actor,
    action: "apikey.issue",
    target: `adm:${s.id}`,
    before: null,
    after: { ausgestelltFuer: s.ausgestelltFuer, laufzeit: String(body?.laufzeit || ""), laeuftAbAm: s.laeuftAbAm || "unbefristet", budgetToken: s.budgetToken || "ohne Budget", keyHint: s.keyHint },
    reason: `Ausgestellt fuer ${s.ausgestelltFuer}${s.notiz ? ` — ${s.notiz}` : ""}`,
    ip: clientIp(req)
  }, { env });
  // Der Klartext geht GENAU HIER einmal heraus — wie bei /api/developer/keys.
  return privateJson(res, 201, {
    ok: true,
    hinweis: "Dieser Schluessel wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.",
    apiKey: ergebnis.klartext,
    basisUrl: basisUrlAus(req, env),
    modell: "smejj-1.0",
    schluessel: s
  });
}

async function widerrufen(req, res, actor, env) {
  if (can(actor.role, "apikeys.revoke") !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: "apikeys.revoke" });
  }
  const body = await readJson(req).catch(() => ({}));
  const id = String(body?.id || "").trim();
  const grund = String(body?.reason || "").trim();
  if (!/^adm_[a-f0-9]{12}$/.test(id)) return privateJson(res, 400, { ok: false, error: "schluessel_ziel_fehlt" });
  if (grund.length < 10) {
    return privateJson(res, 400, { ok: false, error: "admin_reason_required", hinweis: "Mindestens 10 Zeichen." });
  }
  const s = await widerrufeAusgestellt(id, actor, env);
  await appendAuditEntry({
    actor,
    action: "apikey.revoke",
    target: `adm:${id}`,
    before: { aktiv: true, ausgestelltFuer: s.ausgestelltFuer },
    after: { aktiv: false, widerrufenAm: s.widerrufenAm },
    reason: grund,
    ip: clientIp(req)
  }, { env });
  return privateJson(res, 200, { ok: true, schluessel: s, hinweis: "Der Schluessel ist unbrauchbar. Programme damit bekommen ab jetzt 401." });
}

async function budget(req, res, actor, env) {
  if (can(actor.role, "apikeys.issue") !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: "apikeys.issue" });
  }
  const body = await readJson(req).catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!/^adm_[a-f0-9]{12}$/.test(id)) return privateJson(res, 400, { ok: false, error: "schluessel_ziel_fehlt" });
  const vorher = (await listeAusgestellt(env)).schluessel.find((s) => s.id === id);
  const s = await setzeBudget(id, body?.budgetToken, env);
  await appendAuditEntry({
    actor,
    action: "apikey.budget",
    target: `adm:${id}`,
    before: { budgetToken: vorher?.budgetToken ?? null },
    after: { budgetToken: s.budgetToken },
    reason: `Monatsbudget fuer ${s.ausgestelltFuer} auf ${s.budgetToken ? `${s.budgetToken} Token` : "ohne Budget"} gesetzt`,
    ip: clientIp(req)
  }, { env });
  return privateJson(res, 200, { ok: true, schluessel: s });
}

function basisUrlAus(req, env) {
  const gesetzt = String(env.SMEJJ_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (gesetzt) return gesetzt;
  return "https://api.smejj.com/v1";
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
