// smejj.com — Adminbereich, Stufe 1: ausschliesslich lesende Routen.
//
// Bewusst ohne jede schreibende Aktion auf Nutzerkonten. Wer hier nichts kaputt
// machen kann, kann auch nichts kaputt machen, waehrend das Fundament reift.
// Sperren, Loeschen, Rollenvergabe und Rueckerstattung folgen in Stufe 3 —
// zusammen mit Vier-Augen-Prinzip und Einwilligung.
//
// Die einzige Ausnahme ist der Neubau des Nutzer-Index: er beruehrt keine
// Konten, ist aber teuer genug, um Berechtigung, Grund und Audit-Eintrag zu
// verlangen.
import { createRateLimiter } from "../http/rateLimiter.js";
import { privateJson, readJson } from "../http/respond.js";
import { getUserByEmail, userRole, userStatus } from "../auth/emailUserStore.js";
import { permissionsFor } from "../admin/adminRoles.js";
import { checkActorPermission, resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry, readAuditPage, verifyAuditChain } from "../admin/auditLog.js";
import { readUserIndex, rebuildUserIndex, selectFromIndex } from "../admin/userIndex.js";

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
    if (readMethod && rest.startsWith("users/") && rest !== "users/index/rebuild") {
      return await respondUserDetail(res, actor, decodeURIComponent(rest.slice("users/".length)), env), true;
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
    stage: 1,
    writable: false // Stufe 1 ist bewusst rein lesend
  });
}

async function respondUsers(res, actor, url, env) {
  const gate = checkActorPermission(actor, "users.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

  const index = await readUserIndex({ env });
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
      truncated: index.truncated
    },
    ...page
  });
}

async function respondUserDetail(res, actor, identifier, env) {
  const gate = checkActorPermission(actor, "users.read");
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, error: gate.error });

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
  return privateJson(res, 200, { ok: true, user: redactUserRecord(record) });
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

  const page = await readAuditPage({ limit: url.searchParams.get("limit"), env });
  if (!page.ok) return privateJson(res, 503, { ok: false, error: page.error });
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
