// smejj.com — Adminbereich Stufe 4: Moderation, DSGVO, Ankuendigungen, Flags.
//
// Eigene Datei, damit adminRoutes (lesend) und adminWriteRoutes (Konten) nicht
// weiter wachsen. Alle vier Bereiche folgen demselben Muster wie Stufe 3:
// Rolle frisch aus dem Store, Berechtigung, Pflichtgrund, ausfuehren, Nachweis.
//
// Berechtigungen bewusst an bestehende gehaengt statt neue zu erfinden:
//   - Moderation und DSGVO -> "users.block" (wer Konten steuern darf)
//   - Ankuendigungen und Flags -> "models.write" (wer den Betrieb steuern darf)
// Eine Rechtematrix, die fuer jede Kleinigkeit einen neuen Eintrag bekommt,
// wird unuebersichtlich — und Unuebersichtlichkeit ist das Gegenteil von
// Sicherheit.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { entscheide, listeSignale, meldeSignal } from "../admin/moderationQueue.js";
import { erfasseAnfrage, listeAnfragen, setzeStatus, verlaengereFrist } from "../admin/gdprRequests.js";
import { erstelleAnkuendigung, listeAnkuendigungen, ziehZurueck } from "../admin/announcements.js";
import { listFlags, upsertFlag } from "../admin/featureFlags.js";

const PREFIX = "/api/admin";
const gate = createRateLimiter({ capacity: 30, refillPerSec: 0.4, maxKeys: 5_000 });

const BEREICHE = Object.freeze({
  moderation: "users.block",
  gdpr: "users.block",
  announcements: "models.write",
  flags: "models.write"
});

export async function handleAdminStage4Route(req, url, res, { env = process.env } = {}) {
  const rest = url.pathname.startsWith(`${PREFIX}/`) ? url.pathname.slice(PREFIX.length + 1) : "";
  const bereich = rest.split("/")[0];
  if (!Object.keys(BEREICHE).includes(bereich)) return false;

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;

  const recht = BEREICHE[bereich];
  if (can(actor.role, recht) === GRANT.deny) {
    privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
    return true;
  }

  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const lesen = req.method === "GET" || req.method === "HEAD";
  const teile = rest.split("/");
  const body = lesen ? {} : await readJson(req).catch(() => ({}));

  try {
    if (bereich === "moderation") return await moderation(req, res, actor, teile, body, lesen, env), true;
    if (bereich === "gdpr") return await dsgvo(req, res, actor, teile, body, lesen, env), true;
    if (bereich === "announcements") return await ankuendigungen(req, res, actor, teile, body, lesen, env), true;
    if (bereich === "flags") return await flags(req, res, actor, teile, body, lesen, env), true;
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

// ---- K · Moderation ----------------------------------------------------------

async function moderation(req, res, actor, teile, body, lesen, env) {
  if (lesen && teile.length === 1) {
    const liste = await listeSignale({ env });
    if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
    return privateJson(res, 200, {
      ok: true, total: liste.total, offen: liste.offen, hoch: liste.hoch, signale: liste.signale,
      hinweis: "Ein Signal ist ein Verdacht, kein Urteil. Es wird nichts automatisch gesperrt."
    });
  }
  if (!lesen && teile[1] === "signal") {
    const ergebnis = await meldeSignal(body, { actor, env });
    if (!ergebnis.ok) return privateJson(res, 400, { ok: false, error: ergebnis.error, hinweis: ergebnis.hinweis });
    await nachweis(actor, "moderation.signal", ergebnis.signal.subjekt, null,
      { id: ergebnis.signal.id, art: ergebnis.signal.art, schwere: ergebnis.signal.schwere },
      ergebnis.signal.beleg, req, env);
    return privateJson(res, 201, { ok: true, signal: ergebnis.signal });
  }
  if (!lesen && teile[2] === "entscheiden") {
    const ergebnis = await entscheide(teile[1], body, { actor, env });
    if (!ergebnis.ok) {
      const status = ergebnis.error === "moderation_not_found" ? 404
        : ergebnis.error === "moderation_already_decided" ? 409 : 400;
      return privateJson(res, status, { ok: false, error: ergebnis.error, hinweis: ergebnis.hinweis });
    }
    await nachweis(actor, "moderation.entscheidung", teile[1], ergebnis.before, ergebnis.after,
      body.begruendung, req, env);
    return privateJson(res, 200, { ok: true, ...ergebnis });
  }
  return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
}

// ---- M · DSGVO ---------------------------------------------------------------

async function dsgvo(req, res, actor, teile, body, lesen, env) {
  if (lesen && teile.length === 1) {
    const liste = await listeAnfragen({ env });
    if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
    return privateJson(res, 200, {
      ok: true, total: liste.total, offen: liste.offen, ueberschritten: liste.ueberschritten,
      vorgaenge: liste.vorgaenge
    });
  }
  if (!lesen && teile[1] === "erfassen") {
    const ergebnis = await erfasseAnfrage(body, { actor, env });
    if (!ergebnis.ok) return privateJson(res, 400, { ok: false, error: ergebnis.error, erlaubt: ergebnis.erlaubt });
    await nachweis(actor, "gdpr.erfasst", ergebnis.vorgang.betroffeneEmail, null,
      { id: ergebnis.vorgang.id, art: ergebnis.vorgang.art, faelligAm: ergebnis.vorgang.faelligAm },
      ergebnis.vorgang.notiz || `Betroffenenanfrage ${ergebnis.vorgang.artikel}`, req, env);
    return privateJson(res, 201, { ok: true, vorgang: ergebnis.vorgang });
  }
  if (!lesen && teile[2] === "status") {
    const ergebnis = await setzeStatus(teile[1], body.status, { nachweis: body.nachweis, actor, env });
    if (!ergebnis.ok) {
      const status = ergebnis.error === "gdpr_not_found" ? 404 : ergebnis.error === "gdpr_no_change" ? 409 : 400;
      return privateJson(res, status, { ok: false, error: ergebnis.error });
    }
    await nachweis(actor, "gdpr.status", teile[1], ergebnis.before, ergebnis.after,
      body.nachweis || `Stand: ${body.status}`, req, env);
    return privateJson(res, 200, { ok: true, ...ergebnis });
  }
  if (!lesen && teile[2] === "verlaengern") {
    const ergebnis = await verlaengereFrist(teile[1], body.begruendung, { actor, env });
    if (!ergebnis.ok) {
      const status = ergebnis.error === "gdpr_not_found" ? 404
        : ergebnis.error === "gdpr_already_extended" ? 409 : 400;
      return privateJson(res, status, { ok: false, error: ergebnis.error });
    }
    await nachweis(actor, "gdpr.frist_verlaengert", teile[1], ergebnis.before, ergebnis.after,
      body.begruendung, req, env);
    return privateJson(res, 200, { ok: true, ...ergebnis });
  }
  return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
}

// ---- Q · Ankuendigungen ------------------------------------------------------

async function ankuendigungen(req, res, actor, teile, body, lesen, env) {
  if (lesen && teile.length === 1) {
    const liste = await listeAnkuendigungen({ env });
    if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
    return privateJson(res, 200, { ok: true, total: liste.total, aktiv: liste.aktiv, ankuendigungen: liste.ankuendigungen });
  }
  if (!lesen && teile[1] === "erstellen") {
    const ergebnis = await erstelleAnkuendigung(body, { actor, env });
    if (!ergebnis.ok) return privateJson(res, 400, { ok: false, error: ergebnis.error });
    await nachweis(actor, "ankuendigung.erstellt", ergebnis.ankuendigung.id, null,
      { art: ergebnis.ankuendigung.art, titel: ergebnis.ankuendigung.titel, bis: ergebnis.ankuendigung.sichtbarBis },
      ergebnis.ankuendigung.titel, req, env);
    return privateJson(res, 201, { ok: true, ankuendigung: ergebnis.ankuendigung });
  }
  if (!lesen && teile[2] === "zurueckziehen") {
    const ergebnis = await ziehZurueck(teile[1], { actor, env });
    if (!ergebnis.ok) {
      const status = ergebnis.error === "ankuendigung_not_found" ? 404 : 409;
      return privateJson(res, status, { ok: false, error: ergebnis.error });
    }
    await nachweis(actor, "ankuendigung.zurueckgezogen", teile[1], ergebnis.before, ergebnis.after,
      String(body.reason || "").trim() || "zurueckgezogen", req, env);
    return privateJson(res, 200, { ok: true, ...ergebnis });
  }
  return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
}

// ---- R · Feature-Flags -------------------------------------------------------

async function flags(req, res, actor, teile, body, lesen, env) {
  if (lesen && teile.length === 1) {
    const liste = await listFlags({ env });
    if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
    return privateJson(res, 200, { ok: true, total: liste.total, flags: liste.flags });
  }
  if (!lesen && teile[1] === "setzen") {
    const grund = String(body.reason || "").trim();
    if (grund.length < 3) return privateJson(res, 400, { ok: false, error: "admin_reason_required" });
    const ergebnis = await upsertFlag(body, { actor, env });
    if (!ergebnis.ok) return privateJson(res, 400, { ok: false, error: ergebnis.error, hinweis: ergebnis.hinweis });
    await nachweis(actor, ergebnis.neu ? "flag.angelegt" : "flag.geaendert", ergebnis.after.name,
      ergebnis.before, ergebnis.after, grund, req, env);
    return privateJson(res, ergebnis.neu ? 201 : 200, { ok: true, ...ergebnis });
  }
  return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
}

// ---- Helfer ------------------------------------------------------------------

async function nachweis(actor, aktion, ziel, before, after, grund, req, env) {
  const eintrag = await appendAuditEntry({
    actor, action: aktion, target: ziel, before, after,
    reason: String(grund || "").trim() || aktion,
    ip: clientIp(req)
  }, { env });
  return eintrag.ok;
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
