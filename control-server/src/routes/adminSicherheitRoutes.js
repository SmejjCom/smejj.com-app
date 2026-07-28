// smejj.com — Adminbereich Stufe 6: Sicherheit (Module J, L, Z).
//
// Drei lesende Ansichten und GENAU EINE schreibende Aktion: den Widerruf eines
// hinterlegten Anbieter-Schluessels.
//
// Der Widerruf steht bewusst hier und nicht bei den Kontoaktionen aus Stufe 3:
// er loescht nichts und aendert kein Konto, er macht einen Schluessel
// unbrauchbar. Das ist im Zweifel die richtige Reaktion und muss schnell gehen —
// deshalb "allow" statt "dual". Rueckgaengig macht es die Nutzerin selbst,
// indem sie einen neuen Schluessel hinterlegt.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { schluesselUebersicht } from "../admin/opsSchluessel.js";
import { sicherheitsUebersicht } from "../admin/opsSicherheit.js";
import { adminUebersicht } from "../admin/opsAdmins.js";
import { disableProviderCredential } from "../providers/providerCredentialVault.js";

const PREFIX = "/api/admin/sicherheit";
const gate = createRateLimiter({ capacity: 40, refillPerSec: 0.6, maxKeys: 5_000 });

const LESERECHTE = Object.freeze({
  schluessel: "apikeys.read",
  ereignisse: "audit.read",
  admins: "users.read"
});

export async function handleAdminSicherheitRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;

  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const teile = url.pathname.slice(PREFIX.length).replace(/^\//, "").split("/");
  const bereich = teile[0] || "";
  const lesen = req.method === "GET" || req.method === "HEAD";

  try {
    if (lesen) return await lesend(res, actor, bereich, url, env), true;
    if (bereich === "schluessel" && teile[1] === "widerrufen") {
      return await widerrufen(req, res, actor, env), true;
    }
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed" });
    return true;
  } catch (error) {
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

async function lesend(res, actor, bereich, url, env) {
  const recht = LESERECHTE[bereich];
  if (!recht) return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
  if (can(actor.role, recht) !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
  }

  if (bereich === "schluessel") return privateJson(res, 200, await schluesselUebersicht({ env }));
  if (bereich === "ereignisse") {
    const tage = Number(url.searchParams.get("tage") || 7);
    return privateJson(res, 200, await sicherheitsUebersicht({ env, tage }));
  }
  return privateJson(res, 200, await adminUebersicht({ env }));
}

async function widerrufen(req, res, actor, env) {
  if (can(actor.role, "apikeys.revoke") !== GRANT.allow) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: "apikeys.revoke" });
  }
  const body = await readJson(req).catch(() => ({}));
  const konto = String(body.konto || "").trim().toLowerCase();
  const anbieter = String(body.anbieter || "").trim().toLowerCase();
  const grund = String(body.reason || "").trim();

  if (!konto || !anbieter) return privateJson(res, 400, { ok: false, error: "schluessel_ziel_fehlt" });
  // Ein Widerruf ohne Grund ist im Nachhinein nicht von einem Versehen zu
  // unterscheiden. Zehn Zeichen sind die Huerde, die schon fuer Sperren gilt.
  if (grund.length < 10) {
    return privateJson(res, 400, { ok: false, error: "admin_reason_required", hinweis: "Mindestens 10 Zeichen." });
  }

  const ergebnis = await disableProviderCredential(konto, anbieter, env);
  if (!ergebnis?.ok) return privateJson(res, 503, { ok: false, error: "schluessel_widerruf_fehlgeschlagen" });

  await appendAuditEntry({
    actor,
    action: "apikey.revoke",
    target: `${konto}:${anbieter}`,
    before: { aktiv: true },
    after: { aktiv: false },
    reason: grund,
    ip: clientIp(req)
  }, { env });

  return privateJson(res, 200, {
    ok: true,
    konto,
    anbieter,
    ablage: ergebnis.storage,
    hinweis: "Der Schluessel ist unbrauchbar. Die Nutzerin kann jederzeit einen neuen hinterlegen."
  });
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
