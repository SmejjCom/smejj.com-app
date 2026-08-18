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
import { kontingentUebersicht } from "../admin/opsKontingent.js";
import { wissenUebersicht } from "../admin/opsWissen.js";
import { sprachUebersicht } from "../admin/opsSprachen.js";
import { experimentUebersicht } from "../admin/opsExperimente.js";
import { emailUebersicht } from "../admin/opsEmail.js";
import { analytikUebersicht } from "../admin/opsAnalytik.js";
import { autopilotUebersicht } from "../admin/opsAutopiloten.js";
import { cockpitUebersicht } from "../admin/opsCockpit.js";
import { evolutionDashboard } from "../admin/opsEvolution.js";
// Token-Verbrauch: die Zahl, ohne die jede Kostenentscheidung geraten ist.
import { bericht as verbrauchsBericht } from "../llm/tokenMesser.js";
import { cacheBericht } from "../llm/semantischerCache.js";

const PREFIX = "/api/admin/ops";
const RECHT = "ops.read";
// Grosszuegiger als bei den Schreib-Routen: das sind Ansichten, die man beim
// Suchen eines Fehlers oft hintereinander aufruft.
const gate = createRateLimiter({ capacity: 60, refillPerSec: 1, maxKeys: 5_000 });

// Startzeit dieses Prozesses — einmal beim Laden festgehalten, damit Modul P
// die Laufzeit zeigen kann.
const GESTARTET_MS = Date.now();

const BEREICHE = Object.freeze([
  "cockpit", "modelle", "jobs", "worker", "deploy", "speicher", "kontingent", "wissen", "sprachen",
  "experimente", "email", "analytik", "autopiloten", "evolution", "verbrauch"
]);

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
    if (bereich === "") return privateJson(res, 200, { ok: true, bereiche: BEREICHE }), true;
    if (bereich === "cockpit") return privateJson(res, 200, await cockpitUebersicht({ env })), true;
    if (bereich === "modelle") return privateJson(res, 200, modellUebersicht({ env })), true;
    if (bereich === "jobs") return privateJson(res, 200, jobUebersicht({ limit: grenze(url) })), true;
    if (bereich === "worker") return privateJson(res, 200, await workerUebersicht({ env })), true;
    if (bereich === "deploy") return privateJson(res, 200, deployUebersicht({ env, startzeitMs: GESTARTET_MS })), true;
    if (bereich === "speicher") return privateJson(res, 200, await speicherUebersicht({ env })), true;
    if (bereich === "kontingent") return privateJson(res, 200, await kontingentUebersicht({ env })), true;
    if (bereich === "wissen") return privateJson(res, 200, await wissenUebersicht()), true;
    if (bereich === "sprachen") return privateJson(res, 200, await sprachUebersicht()), true;
    if (bereich === "experimente") return privateJson(res, 200, await experimentUebersicht({ env })), true;
    if (bereich === "email") return privateJson(res, 200, await emailUebersicht({ env })), true;
    if (bereich === "analytik") return privateJson(res, 200, await analytikUebersicht({ env, tage: tageAus(url) })), true;
    if (bereich === "autopiloten") return privateJson(res, 200, autopilotUebersicht({ startzeitMs: GESTARTET_MS })), true;
    if (bereich === "evolution") return privateJson(res, 200, await evolutionDashboard({ env })), true;
    // Der Speicher ist nach jedem Control-Neustart leer — die vollstaendige
    // Historie steht in den Logzeilen "[verbrauch] {...}". Diese Ansicht ist
    // die schnelle Sicht auf den laufenden Prozess, nicht das Archiv.
    if (bereich === "verbrauch") return privateJson(res, 200, { ok: true, ...verbrauchsBericht({ tag: tagAus(url) }), semantischerCache: cacheBericht() }), true;
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    // Fail-closed mit ehrlicher Meldung: lieber ein sichtbarer Ausfall als eine
    // Ansicht, die Ruhe vortaeuscht, weil eine Quelle stumm weggefallen ist.
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

/**
 * Zeitraum fuer Modul W. Wird bewusst NICHT hier geklemmt: analytikUebersicht
 * entscheidet allein, was eine brauchbare Spanne ist — zwei Stellen mit je
 * eigener Regel driften auseinander, und dann klemmt die Route auf 1, waehrend
 * das Modul auf 14 zurueckfallen wollte.
 */
function tageAus(url) {
  const roh = url.searchParams.get("tage");
  return roh === null ? undefined : roh;
}

function tagAus(url) {
  const roh = String(url.searchParams.get("tag") || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(roh) ? roh : "";
}

function grenze(url) {
  const wert = Number(url.searchParams.get("limit") || 100);
  return Number.isFinite(wert) ? Math.min(200, Math.max(1, Math.trunc(wert))) : 100;
}
