// smejj.com — Adminbereich, Stufe 2: ausschliesslich lesende Routen.
//
// Bewusst ohne jede schreibende Aktion auf Nutzerkonten. Wer hier nichts kaputt
// machen kann, kann auch nichts kaputt machen, waehrend das Fundament reift.
// Sperren, Loeschen, Rollenvergabe und Rueckerstattung folgen in Stufe 3 —
// zusammen mit Vier-Augen-Prinzip und Einwilligung.
//
// Zwei Ausnahmen vom reinen Lesen, beide mit Pflichtgrund und Audit-Eintrag:
//   - Neubau des Nutzer-Index: beruehrt keine Konten, ist aber teuer.
//   - Einsicht in eine Nutzerakte: liest zwar nur, ist aber ein Zugriff auf
//     personenbezogene Daten und gehoert deshalb nachgewiesen. Ohne Grund
//     keine Einsicht; schlaegt der Nachweis fehl, gibt es keine Daten.
import { nutzerLage } from "../admin/opsNutzerLage.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { privateJson, readJson } from "../http/respond.js";
import { getUserByEmail, userRole, userStatus } from "../auth/emailUserStore.js";
import { permissionsFor } from "../admin/adminRoles.js";
import { checkActorPermission, resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry, readAuditPage, verifyAuditChain } from "../admin/auditLog.js";
import { readUserIndex, readUserIndexFresh, rebuildUserIndex, selectFromIndex } from "../admin/userIndex.js";

const PREFIX = "/api/admin";
const requestGate = createRateLimiter({ capacity: 40, refillPerSec: 0.5, maxKeys: 5_000 });

export async function handleAdminRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  // Fail-closed schon vor jeder Fallunterscheidung: ohne Adminrolle gibt es
  // hier nichts zu sehen — auch keine Routenstruktur.
  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) {
    privateJson(res, resolved.status, { ok: false, error: resolved.error });
    return true;
  }
  const { actor } = resolved;

  const limit = requestGate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  const readMethod = req.method === "GET" || req.method === "HEAD";

  try {
    if (readMethod && rest === "me") return respondMe(res, actor), true;
    if (readMethod && rest === "users") return await respondUsers(res, actor, url, env), true;
    // Modul B, Teil 2: Nutzer-Lage (Plan, bezahlt als, zuletzt, Verbrauch) — Design-Vorschlag 2026-08-23.
    if (readMethod && rest === "users/lage") return await respondNutzerLage(res, actor, url, env), true;
    if (readMethod && rest.startsWith("users/") && rest !== "users/index/rebuild") {
      return await respondUserDetail(req, res, actor, decodeURIComponent(rest.slice("users/".length)), url, env), true;
    }
    if (req.method === "POST" && rest === "users/index/rebuild") {
      return await respondRebuild(req, res, actor, env), true;
    }
    if (readMethod && rest === "audit") return await respondAudit(res, actor, url, env), true;

    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

// ---- Routen ------------------------------------------------------------------

function respondMe(res, actor) {
  return privateJson(res, 200, {
    ok: true,
    actor: { email: actor.email, name: actor.name, role: actor.role, roleSource: actor.roleSource },
    permissions: permissionsFor(actor.role),
    stage: 8,
    // Schreibend seit Stufe 3 — aber nur mit Grund, Nachweis und, wo es
    // unumkehrbar wird, mit der Freigabe einer zweiten Person. Stufe 5 hat
    // daran nichts geaendert: der Betriebsbereich ist rein lesend.
    writable: true
  });
}

async function respondNutzerLage(res, actor, url, env) {
  const gate = checkActorPermission(actor, "users.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });
  const lage = await nutzerLage({
    env,
    query: url.searchParams.get("query") || "",
    offset: url.searchParams.get("offset"),
    limit: url.searchParams.get("limit")
  });
  return privateJson(res, lage.ok ? 200 : 409, lage);
}

async function respondUsers(res, actor, url, env) {
  const gate = checkActorPermission(actor, "users.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

  // Frischt bei Bedarf im Hintergrund auf und antwortet trotzdem sofort.
  const index = await readUserIndexFresh({ env });
  if (!index.ok) return privateJson(res, 409, { ok: false, error: index.error, hint: "POST /api/admin/users/index/rebuild" });

  const page = selectFromIndex(index.entries, {
    query: url.searchParams.get("query") || "",
    role: url.searchParams.get("role") || "",
    status: url.searchParams.get("status") || "",
    offset: url.searchParams.get("offset"),
    limit: url.searchParams.get("limit")
  });
  return privateJson(res, 200, {
    ok: true,
    index: {
      builtAt: index.builtAt,
      ageSeconds: index.ageSeconds,
      count: index.count,
      unreadable: index.unreadable,
      refreshing: index.refreshing === true,
      truncated: index.truncated
    },
    ...page
  });
}

/**
 * Ein Grund, der nur nach einem verunglueckten Aufruf aussieht, ist keiner.
 *
 * Befund 2026-08-07: `akte(id, grund)` in admin-ui/api.js baut die Adresse mit
 * `encodeURIComponent(grund)`. Fehlt der Grund, wird daraus die ZEICHENKETTE
 * "undefined" — neun Zeichen, also lang genug fuer die Laengenpruefung. Die
 * Einsicht ging damit durch, und im Nachweisregister stand als Grund
 * "undefined". Ein Kontrollpunkt, der sich so aushebeln laesst, schuetzt nichts.
 *
 * Solche Woerter koennen nur aus einem Fehler stammen, nie aus einem Menschen,
 * der einen Grund eintippt. Sie werden deshalb behandelt wie gar kein Grund.
 */
function istScheingrund(reason) {
  return /^(undefined|null|nan|none|-+|n\/a|k\.a\.)$/i.test(reason.trim());
}

async function respondUserDetail(req, res, actor, identifier, url, env) {
  const gate = checkActorPermission(actor, "users.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

  // Die Einsicht in eine Nutzerakte ist ein Zugriff auf personenbezogene Daten.
  // Sie verlangt deshalb einen Grund und wird protokolliert — anders als das
  // Blaettern in der Liste, die nur Metadaten zeigt. Ohne Grund keine Einsicht.
  const reason = String(url.searchParams.get("reason") || "").trim();
  if (reason.length < 3 || istScheingrund(reason)) {
    return privateJson(res, 400, {
      ok: false,
      error: "admin_reason_required",
      hinweis: "Die Einsicht in eine Nutzerakte wird protokolliert. Bitte Grund angeben (?reason=...)."
    });
  }

  // Der Index bildet userId -> E-Mail ab; direkte E-Mail-Angabe ist ebenfalls erlaubt.
  let email = identifier.includes("@") ? identifier : "";
  if (!email) {
    const index = await readUserIndex({ env });
    if (!index.ok) return privateJson(res, 409, { ok: false, error: index.error });
    email = index.entries.find((entry) => entry.userId === identifier)?.email || "";
  }
  if (!email) return privateJson(res, 404, { ok: false, error: "admin_user_not_found" });

  let record = null;
  try {
    record = await getUserByEmail(email, env);
  } catch {
    return privateJson(res, 503, { ok: false, error: "admin_directory_unavailable" });
  }
  if (!record) return privateJson(res, 404, { ok: false, error: "admin_user_not_found" });

  // Erst protokollieren, dann herausgeben. Schlaegt der Nachweis fehl, gibt es
  // keine Einsicht — ein Zugriff ohne Spur waere schlimmer als kein Zugriff.
  const audit = await appendAuditEntry({
    actor,
    action: "user.record.read",
    target: record.userId || email,
    before: null,
    after: null,
    reason,
    ip: clientIp(req)
  }, { env });
  if (!audit.ok) return privateJson(res, 503, { ok: false, error: "admin_audit_unavailable" });

  return privateJson(res, 200, { ok: true, user: redactUserRecord(record), protokolliert: true });
}

async function respondRebuild(req, res, actor, env) {
  const gate = checkActorPermission(actor, "index.rebuild");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

  const body = await readJson(req).catch(() => ({}));
  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) return privateJson(res, 400, { ok: false, error: "admin_reason_required" });

  const result = await rebuildUserIndex({ env });
  const audit = await appendAuditEntry({
    actor,
    action: "index.rebuild",
    target: "admin/index/users.json",
    before: null,
    after: { count: result.count ?? null, unreadable: result.unreadable ?? null, ok: result.ok },
    reason,
    ip: clientIp(req)
  }, { env });

  if (!result.ok) return privateJson(res, 503, { ok: false, error: result.error, audit: audit.ok });
  return privateJson(res, 200, { ok: true, ...result, audit: audit.ok });
}

async function respondAudit(res, actor, url, env) {
  const gate = checkActorPermission(actor, "audit.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

  const page = await readAuditPage({
    limit: url.searchParams.get("limit"),
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
    env
  });
  // "grund" trägt den Speicher-Statuscode mit (z.B. s3_status_503). Ohne ihn
  // steht in der Konsole nur "liess sich nicht lesen" — und der naechste, der
  // dem Fehler nachgeht, faengt wieder bei null an. Die Route ist admin-only.
  if (!page.ok) return privateJson(res, 503, { ok: false, error: page.error, ...(page.grund ? { grund: page.grund } : {}) });
  const chain = verifyAuditChain(page.entries);
  // "window" muss mit: die Seite zeigt standardmaessig nur den laufenden und den
  // vorigen Monat. Ohne diese Angabe liest sich eine kurze Liste faelschlich als
  // "mehr ist nie passiert" — bei einem Nachweis-Register waere das fatal.
  return privateJson(res, 200, { ok: true, total: page.total, window: page.window, chain, entries: page.entries });
}

// ---- Helfer ------------------------------------------------------------------

/**
 * Was der Adminbereich von einem Konto sehen darf. Alles andere faellt weg:
 * Passwort-Hash, Verifikations- und Reset-Token, vollstaendige Sitzungs-IDs.
 * Weglassen statt maskieren — was nicht uebertragen wird, kann nicht verlieren.
 */
export function redactUserRecord(record) {
  const sessions = Array.isArray(record?.sessions) ? record.sessions : [];
  const now = Date.now();
  return {
    userId: record?.userId || "",
    email: record?.email || "",
    name: record?.name || "",
    method: record?.method || "email",
    role: userRole(record),
    status: userStatus(record),
    emailVerifiedAt: record?.emailVerifiedAt || null,
    createdAt: record?.createdAt || null,
    updatedAt: record?.updatedAt || null,
    loginGuard: {
      failedCount: Number(record?.loginGuard?.failedCount) || 0,
      lockedUntil: record?.loginGuard?.lockedUntil || null
    },
    hasPendingVerification: Boolean(record?.verify),
    hasPendingReset: Boolean(record?.reset),
    sessions: sessions.map((session) => ({
      sidHint: String(session?.sid || "").slice(0, 8),
      device: session?.uaLabel || "Unbekanntes Geraet",
      createdAt: session?.createdAt || null,
      lastSeenAt: session?.lastSeenAt || null,
      expiresAt: session?.expiresAt || null,
      revokedAt: session?.revokedAt || null,
      active: !session?.revokedAt && new Date(session?.expiresAt || 0).getTime() > now
    }))
  };
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
