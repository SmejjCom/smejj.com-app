// smejj.com — Adminbereich Stufe 5: Betrieb (Module G, H, I, P, U).
//
// Rein lesend, deshalb bewusst schlanker als die Schreib-Routen: eine
// Berechtigung (`ops.read`), kein Pflichtgrund, kein Audit-Eintrag.
//
// Warum hier NICHT protokolliert wird, obwohl Stufe 2 Lesezugriffe auf
// Nutzerakten protokolliert: dort wird eine bestimmte Person aufgeschlagen, und
// wer in einer fremden Akte liest, muss das verantworten. Hier steht kein
// Personenbezug — Modell-, Job- und Speicherzustand. Jeden Blick auf den
// Betriebsbildschirm zu protokollieren wuerde das Audit-Log fluten und die
// Eintraege, auf die es ankommt, unauffindbar machen.
import { privateJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { modellUebersicht } from "../admin/opsModelle.js";
import { jobUebersicht } from "../admin/opsJobs.js";
import { workerUebersicht } from "../admin/opsWorker.js";
import { deployUebersicht } from "../admin/opsDeploy.js";
import { speicherUebersicht } from "../admin/opsSpeicher.js";

const PREFIX = "/api/admin/ops";
const RECHT = "ops.read";
// Grosszuegiger als bei den Schreib-Routen: das sind Ansichten, die man beim
// Suchen eines Fehlers oft hintereinander aufruft.
const gate = createRateLimiter({ capacity: 60, refillPerSec: 1, maxKeys: 5_000 });

// Startzeit dieses Prozesses — einmal beim Laden festgehalten, damit Modul P
// die Laufzeit zeigen kann.
const GESTARTET_MS = Date.now();

const BEREICHE = Object.freeze(["modelle", "jobs", "worker", "deploy", "speicher"]);

export async function handleAdminOpsRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed", hinweis: "Der Betriebsbereich ist rein lesend." });
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
    if (bereich === "" ) return privateJson(res, 200, { ok: true, bereiche: BEREICHE }), true;
    if (bereich === "modelle") return privateJson(res, 200, modellUebersicht({ env })), true;
    if (bereich === "jobs") return privateJson(res, 200, jobUebersicht({ limit: grenze(url) })), true;
    if (bereich === "worker") return privateJson(res, 200, await workerUebersicht({ env })), true;
    if (bereich === "deploy") return privateJson(res, 200, deployUebersicht({ env, startzeitMs: GESTARTET_MS })), true;
    if (bereich === "speicher") return privateJson(res, 200, await speicherUebersicht({ env })), true;
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    // Fail-closed mit ehrlicher Meldung: lieber ein sichtbarer Ausfall als eine
    // Ansicht, die Ruhe vortaeuscht, weil eine Quelle stumm weggefallen ist.
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

function grenze(url) {
  const wert = Number(url.searchParams.get("limit") || 100);
  return Number.isFinite(wert) ? Math.min(200, Math.max(1, Math.trunc(wert))) : 100;
}
