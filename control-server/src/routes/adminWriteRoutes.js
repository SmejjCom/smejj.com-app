// smejj.com — Adminbereich Stufe 3: schreibende Routen.
//
// Getrennt von adminRoutes.js, damit die lesenden Routen unberuehrt bleiben und
// beide Dateien unter der 800-Zeilen-Regel bleiben.
//
// Der Ablauf ist fuer JEDE Aktion derselbe:
//   1. Rolle frisch aus dem Store (adminAuth) — nie aus dem Token.
//   2. Berechtigung pruefen. "allow" fuehrt sofort aus, "dual" legt einen
//      Antrag an, alles andere wird abgewiesen.
//   3. Grund ist Pflicht. Ohne Grund keine Aktion.
//   4. Ausfuehren.
//   5. Audit-Eintrag mit VORHER und NACHHER schreiben.
//
// Punkt 5 ist kein Beiwerk: schlaegt der Nachweis fehl, wird das in der Antwort
// gemeldet. Eine Aenderung ohne Spur ist ein Mangel, kein Erfolg.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { readUserIndex, invalidateUserIndexCache } from "../admin/userIndex.js";
import {
  STATUS as AP_STATUS, approveRequest, getApproval, listApprovals, markExecuted, rejectRequest, requestApproval
} from "../admin/approvalStore.js";
import {
  ACTIONS, clearLoginLock, deleteUserData, markEmailVerified, revokeUserSessions, setUserRole, setUserStatus
} from "../admin/userActions.js";
import { endImpersonation, listImpersonations, requestImpersonation } from "../admin/impersonation.js";
import { bestaetigeCode, fordereCode, istErhoeht } from "../admin/stepUp.js";
import { ARTEN, meldeEreignis } from "../admin/sicherheitsAlarm.js";

const PREFIX = "/api/admin";
// Enger als beim Lesen: schreibende Aktionen sind selten und teuer.
const schreibGate = createRateLimiter({ capacity: 15, refillPerSec: 0.2, maxKeys: 5_000 });

/** Ordnet jeder Aktion ihre Berechtigung zu. Was hier fehlt, ist nicht erlaubt. */
const RECHT_ZUR_AKTION = Object.freeze({
  [ACTIONS.block]: "users.block",
  [ACTIONS.unblock]: "users.block",
  [ACTIONS.roleGrant]: "users.role.grant",
  [ACTIONS.sessionsRevoke]: "users.sessions.revoke",
  [ACTIONS.verify]: "users.verify",
  [ACTIONS.unlock]: "users.unlock",
  [ACTIONS.delete]: "users.delete"
});

export async function handleAdminWriteRoute(req, url, res, { env = process.env } = {}) {
  if (req.method !== "POST") return false;
  const rest = url.pathname.startsWith(`${PREFIX}/`) ? url.pathname.slice(PREFIX.length + 1) : "";
  const zustaendig = rest.startsWith("users/") && rest.includes("/actions/")
    || rest.startsWith("approvals/") || rest === "approvals"
    || rest.startsWith("impersonation") || rest.startsWith("step-up/");
  if (!zustaendig) return false;
  // Der Index-Neubau bleibt in den Leseruten — er beruehrt keine Konten.
  if (rest === "users/index/rebuild") return false;

  // Unbestaetigte Adressen kommen bis hierher, damit sie die Step-up-Routen
  // erreichen — und NUR die. Alles andere faellt unten durch die Pruefung.
  const resolved = await resolveAdminActor(req.authUser, { env, erlaubeUnbestaetigt: true });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;
  const istStepUpRoute = rest === "step-up/request" || rest === "step-up/confirm";
  if (!istStepUpRoute && !actor.emailVerified) {
    privateJson(res, 403, {
      ok: false,
      error: "admin_email_not_verified",
      hinweis: "Adresse zuerst bestaetigen: Code unter /api/admin/step-up/request anfordern und unter /api/admin/step-up/confirm bestaetigen."
    });
    return true;
  }

  const limit = schreibGate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  try {
    const body = await readJson(req).catch(() => ({}));

    // ---- Step-up: frischer Besitznachweis vor jeder aendernden Aktion ------
    // Die beiden Step-up-Routen selbst und die reinen Listen bleiben frei;
    // alles, was Konten oder Vorgaenge AENDERT, verlangt ein offenes Fenster.
    if (rest === "step-up/request") {
      const anforderung = await fordereCode(actor.email, { env });
      if (!anforderung.ok) return privateJson(res, 503, { ok: false, error: anforderung.error }), true;
      await schreibeNachweis(actor, "step_up.requested", actor.email, null, { gueltigSek: anforderung.gueltigSek }, "step-up", req, env);
      return privateJson(res, 200, { ok: true, gueltigSek: anforderung.gueltigSek, hinweis: "Code an die Admin-Adresse geschickt." }), true;
    }
    if (rest === "step-up/confirm") {
      const bestaetigung = bestaetigeCode(actor.email, body?.code);
      if (!bestaetigung.ok) {
        // Falsche Codes sind das Muster, an dem man einen Angriff erkennt.
        if (bestaetigung.error === "step_up_code_wrong") {
          meldeEreignis(ARTEN.stepUpFalsch, { kennung: actor.email }, { env }).catch(() => {});
        } else if (bestaetigung.error === "step_up_too_many_attempts") {
          meldeEreignis(ARTEN.stepUpVerbrannt, { kennung: actor.email }, { env }).catch(() => {});
        }
        return privateJson(res, 403, { ok: false, error: bestaetigung.error, ...(bestaetigung.verbleibend != null ? { verbleibend: bestaetigung.verbleibend } : {}) }), true;
      }
      await schreibeNachweis(actor, "step_up.confirmed", actor.email, null, { fensterSek: bestaetigung.fensterSek }, "step-up", req, env);
      // Der Code ging an genau diese Adresse und kam zurueck — damit IST der
      // Besitz nachgewiesen. Wer den Step-up besteht, hat seine Adresse
      // bestaetigt; ein zweiter Bestaetigungsweg waere derselbe Beweis nochmal.
      let bestaetigt = actor.emailVerified;
      if (!bestaetigt) {
        const markiert = await markEmailVerified(actor.email, { env });
        bestaetigt = markiert.ok || markiert.error === "admin_no_change";
        if (markiert.ok) {
          invalidateUserIndexCache();
          await schreibeNachweis(actor, "user.verify", actor.email, markiert.before, markiert.after, "durch bestandenen Step-up", req, env);
        }
      }
      return privateJson(res, 200, { ok: true, fensterSek: bestaetigung.fensterSek, emailBestaetigt: bestaetigt }), true;
    }
    const nurListe = rest === "approvals" || rest === "impersonation/list";
    if (!nurListe && !istErhoeht(actor.email)) {
      return privateJson(res, 403, {
        ok: false,
        error: "admin_step_up_required",
        hinweis: "Frische Bestaetigung noetig: Code unter /api/admin/step-up/request anfordern und unter /api/admin/step-up/confirm bestaetigen."
      }), true;
    }

    if (rest.startsWith("users/") && rest.includes("/actions/")) {
      const [, kennung, , aktion] = rest.split("/");
      return await kontoAktion(req, res, actor, decodeURIComponent(kennung), aktion, body, env), true;
    }
    if (rest === "approvals") return await listeFreigaben(res, actor, env), true;
    if (rest.startsWith("approvals/")) {
      const [, id, schritt] = rest.split("/");
      return await entscheideFreigabe(req, res, actor, id, schritt, body, env), true;
    }
    if (rest === "impersonation/request") return await impersonationBeantragen(req, res, actor, body, env), true;
    // Die Liste steht HIER und nicht im Schritt-Zweig darunter: dort wird der
    // Pfad in drei Teile zerlegt (impersonation/{id}/{schritt}), "impersonation/list"
    // hat aber nur zwei — der Schritt bliebe leer und die Liste antwortete 404.
    if (rest === "impersonation/list") return await listeImpersonationen(res, actor, env), true;
    if (rest.startsWith("impersonation/")) {
      const [, id, schritt] = rest.split("/");
      return await impersonationSchritt(req, res, actor, id, schritt, body, env), true;
    }
    privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
    return true;
  } catch (error) {
    privateJson(res, 503, { ok: false, error: String(error?.message || "admin_unavailable").slice(0, 160) });
    return true;
  }
}

// ---- Kontoaktionen -----------------------------------------------------------

async function kontoAktion(req, res, actor, kennung, aktion, body, env) {
  const vollerName = aktion.startsWith("user.") ? aktion : `user.${aktion}`;
  const recht = RECHT_ZUR_AKTION[vollerName];
  if (!recht) return privateJson(res, 404, { ok: false, error: "admin_action_unknown", aktion: vollerName });

  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) return privateJson(res, 400, { ok: false, error: "admin_reason_required" });

  const stufe = can(actor.role, recht);
  if (stufe === GRANT.deny) return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
  if (stufe === GRANT.consent) return privateJson(res, 403, { ok: false, error: "admin_subject_consent_required", recht });

  const email = await aufloesenEmail(kennung, env);
  if (!email) return privateJson(res, 404, { ok: false, error: "admin_user_not_found" });

  // Vier-Augen: nicht ausfuehren, sondern beantragen.
  if (stufe === GRANT.dual) {
    const antrag = await requestApproval({
      action: vollerName, target: email, payload: nutzlastFuer(vollerName, body), reason, requestedBy: actor.email
    }, { env });
    if (!antrag.ok) return privateJson(res, 400, { ok: false, error: antrag.error });
    await schreibeNachweis(actor, `${vollerName}.requested`, email, null, { approvalId: antrag.approval.id }, reason, req, env);
    return privateJson(res, 202, {
      ok: true,
      vierAugen: true,
      approval: antrag.approval,
      hinweis: "Beantragt. Eine zweite Person muss freigeben — der Antragsteller darf das nicht."
    });
  }

  const ergebnis = await fuehreAus(vollerName, email, body, actor, env, null);
  return await antworteAufAktion(req, res, actor, vollerName, email, ergebnis, reason, env);
}

/** Fuehrt die eigentliche Aenderung aus. Eine Stelle, ein Schalter. */
async function fuehreAus(aktion, email, body, actor, env, approvalId) {
  if (aktion === ACTIONS.block) return setUserStatus(email, "blocked", { actor, env });
  if (aktion === ACTIONS.unblock) return setUserStatus(email, "active", { actor, env });
  if (aktion === ACTIONS.sessionsRevoke) return revokeUserSessions(email, { onlySid: body?.sid || null, env });
  if (aktion === ACTIONS.verify) return markEmailVerified(email, { env });
  if (aktion === ACTIONS.unlock) return clearLoginLock(email, { env });
  if (aktion === ACTIONS.roleGrant) {
    return setUserRole(email, body?.role, { actor, env, ownerCount: await zaehleOwner(env) });
  }
  if (aktion === ACTIONS.delete) return deleteUserData(email, { actor, approvalId, env });
  return { ok: false, error: "admin_action_unknown" };
}

async function antworteAufAktion(req, res, actor, aktion, email, ergebnis, reason, env, approvalId = null) {
  if (!ergebnis.ok) {
    const status = ergebnis.error === "admin_user_not_found" ? 404
      : ergebnis.error === "admin_directory_unavailable" ? 503
        : ergebnis.error === "admin_no_change" ? 409 : 400;
    return privateJson(res, status, { ok: false, error: ergebnis.error, before: ergebnis.before ?? null });
  }
  // Der Index zeigt jetzt einen veralteten Stand — die naechste Liste soll frisch sein.
  invalidateUserIndexCache();
  const nachweis = await schreibeNachweis(actor, aktion, email, ergebnis.before, ergebnis.after, reason, req, env, approvalId);
  return privateJson(res, 200, {
    ok: true,
    aktion,
    before: ergebnis.before,
    after: ergebnis.after,
    ...(ergebnis.revokedSessions != null ? { revokedSessions: ergebnis.revokedSessions } : {}),
    ...(ergebnis.entfernt ? { entfernt: ergebnis.entfernt } : {}),
    protokolliert: nachweis
  });
}

// ---- Vier-Augen --------------------------------------------------------------

async function listeFreigaben(res, actor, env) {
  if (can(actor.role, "audit.read") === GRANT.deny && can(actor.role, "users.block") === GRANT.deny) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied" });
  }
  const liste = await listApprovals({ env });
  if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
  return privateJson(res, 200, { ok: true, total: liste.total, approvals: liste.approvals });
}

async function entscheideFreigabe(req, res, actor, id, schritt, body, env) {
  const geladen = await getApproval(id, { env });
  if (!geladen.ok) return privateJson(res, 404, { ok: false, error: geladen.error });
  const antrag = geladen.approval;

  // Auch der Freigebende braucht das Recht zur Sache selbst — sonst koennte
  // jemand ohne Loeschrecht eine Loeschung durchwinken.
  const recht = RECHT_ZUR_AKTION[antrag.action];
  if (recht && can(actor.role, recht) === GRANT.deny) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
  }

  if (schritt === "reject") {
    const grund = String(body?.reason || "").trim();
    if (grund.length < 3) return privateJson(res, 400, { ok: false, error: "admin_reason_required" });
    const ab = await rejectRequest(id, actor.email, grund, { env });
    // Dieselbe Regel wie beim Freigeben, deshalb derselbe Statuscode: wer
    // beantragt hat, darf auch nicht ablehnen. 409 wuerde "spaeter nochmal
    // versuchen" bedeuten — hier gilt aber "nie".
    if (!ab.ok) {
      const status = ab.error === "approval_self_approval_forbidden" ? 403
        : ab.error === "approval_expired" ? 410 : 409;
      return privateJson(res, status, { ok: false, error: ab.error });
    }
    await schreibeNachweis(actor, "approval.reject", antrag.target, { status: AP_STATUS.pending },
      { status: AP_STATUS.rejected, approvalId: id }, grund, req, env, id);
    return privateJson(res, 200, { ok: true, approval: ab.approval });
  }

  if (schritt !== "approve") return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });

  const frei = await approveRequest(id, actor.email, { env });
  if (!frei.ok) {
    const status = frei.error === "approval_self_approval_forbidden" ? 403
      : frei.error === "approval_expired" ? 410 : 409;
    return privateJson(res, status, { ok: false, error: frei.error });
  }
  await schreibeNachweis(actor, "approval.approve", antrag.target, { status: AP_STATUS.pending },
    { status: AP_STATUS.approved, approvalId: id }, antrag.reason, req, env, id);

  // Freigegeben heisst ausgefuehrt: sonst bliebe ein zweiter Knopf uebrig, den
  // wieder eine einzelne Person druecken muesste.
  const ergebnis = await fuehreAus(antrag.action, antrag.target, antrag.payload || {}, actor, env, id);
  if (!ergebnis.ok) {
    await markExecuted(id, { ok: false, error: ergebnis.error }, { env });
    return privateJson(res, 409, { ok: false, error: ergebnis.error, approvalId: id, freigegeben: true });
  }
  invalidateUserIndexCache();
  await markExecuted(id, { ok: true, after: ergebnis.after }, { env });
  const nachweis = await schreibeNachweis(actor, antrag.action, antrag.target,
    ergebnis.before, ergebnis.after, antrag.reason, req, env, id);
  return privateJson(res, 200, {
    ok: true, ausgefuehrt: true, approvalId: id,
    beantragtVon: antrag.requestedBy, freigegebenVon: actor.email,
    before: ergebnis.before, after: ergebnis.after, protokolliert: nachweis
  });
}

// ---- Impersonation -----------------------------------------------------------

async function impersonationBeantragen(req, res, actor, body, env) {
  const stufe = can(actor.role, "impersonation.start");
  if (stufe === GRANT.deny) return privateJson(res, 403, { ok: false, error: "admin_permission_denied" });

  const email = await aufloesenEmail(String(body?.subject || ""), env);
  if (!email) return privateJson(res, 404, { ok: false, error: "admin_user_not_found" });

  const antrag = await requestImpersonation({
    subjectEmail: email, operator: actor, scopes: body?.scopes,
    reason: String(body?.reason || ""), durationMs: Number(body?.durationMs) || 0,
    breakGlass: body?.breakGlass === true
  }, { env });
  if (!antrag.ok) return privateJson(res, 400, { ok: false, error: antrag.error });

  const vorgang = antrag.impersonation;
  await schreibeNachweis(actor, vorgang.breakGlass ? "impersonation.break_glass" : "impersonation.request",
    email, null, { id: vorgang.id, scopes: vorgang.scopes, breakGlass: vorgang.breakGlass },
    vorgang.reason, req, env);
  return privateJson(res, vorgang.breakGlass ? 200 : 202, {
    ok: true,
    impersonation: vorgang,
    hinweis: vorgang.breakGlass
      ? "Break-Glass laeuft. Der Vorgang ist als Alarm markiert und deutlich kuerzer."
      : "Beantragt. Die betroffene Person muss in ihrer eigenen Sitzung einwilligen."
  });
}

async function impersonationSchritt(req, res, actor, id, schritt, body, env) {
  // Einwilligen und Ablehnen gehoeren NICHT hierher: das tut die betroffene
  // Person, die keine Adminrolle hat. Der Weg dafuer ist
  // /api/account/impersonation/{id}/consent — hinter dem Admin-Gate waere
  // genau derjenige ausgesperrt, dessen Zustimmung man braucht.
  if (schritt === "consent" || schritt === "deny") {
    return privateJson(res, 403, {
      ok: false,
      error: "impersonation_consent_belongs_to_subject",
      hinweis: "Die Einwilligung gibt die betroffene Person unter /api/account/impersonation/{id}/consent."
    });
  }

  if (schritt === "end") {
    const wer = String(req.authUser?.email || actor.email || "").toLowerCase();
    const ergebnis = await endImpersonation(id, wer, { env });
    if (!ergebnis.ok) {
      const status = ergebnis.error === "impersonation_end_not_allowed" ? 403
        : ergebnis.error === "impersonation_not_found" ? 404 : 409;
      return privateJson(res, status, { ok: false, error: ergebnis.error });
    }
    await schreibeNachweis(actor, "impersonation.end", ergebnis.impersonation.subjectEmail, null,
      { id, endedBy: ergebnis.impersonation.endedBy }, ergebnis.impersonation.reason, req, env);
    return privateJson(res, 200, { ok: true, impersonation: ergebnis.impersonation });
  }

  return privateJson(res, 404, { ok: false, error: "admin_route_not_found" });
}

async function listeImpersonationen(res, actor, env) {
  if (can(actor.role, "impersonation.start") === GRANT.deny && can(actor.role, "audit.read") === GRANT.deny) {
    return privateJson(res, 403, { ok: false, error: "admin_permission_denied" });
  }
  const liste = await listImpersonations({ env });
  if (!liste.ok) return privateJson(res, 503, { ok: false, error: liste.error });
  return privateJson(res, 200, { ok: true, total: liste.total, impersonations: liste.impersonations });
}

// ---- Helfer ------------------------------------------------------------------

/** Konto-ID oder E-Mail zu einer E-Mail aufloesen. */
async function aufloesenEmail(kennung, env) {
  const wert = String(kennung || "").trim();
  if (!wert) return "";
  if (wert.includes("@")) return wert.toLowerCase();
  const index = await readUserIndex({ env });
  if (!index.ok) return "";
  return index.entries.find((e) => e.userId === wert)?.email || "";
}

async function zaehleOwner(env) {
  const index = await readUserIndex({ env });
  if (!index.ok) return null;
  return index.entries.filter((e) => e.role === "owner").length;
}

function nutzlastFuer(aktion, body) {
  if (aktion === ACTIONS.roleGrant) return { role: String(body?.role || "").trim().toLowerCase() };
  return null;
}

async function schreibeNachweis(actor, aktion, ziel, before, after, reason, req, env, approvalId = null) {
  const eintrag = await appendAuditEntry({
    actor, action: aktion, target: ziel, before, reason, ip: clientIp(req),
    after: approvalId ? { ...(after || {}), approvalId } : after
  }, { env });
  return eintrag.ok;
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
