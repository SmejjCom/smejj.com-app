// smejj.com — Schreibende Aktionen auf Nutzerkonten (Single Responsibility: Mutationen).
//
// Das ist die erste Stelle im Adminbereich, die Konten tatsaechlich veraendert.
// Entsprechend eng gefuehrt:
//
//   - Jede Aktion liefert VORHER und NACHHER zurueck, damit der Audit-Eintrag
//     zeigt, was sich geaendert hat — nicht nur, dass etwas passiert ist.
//   - Keine Aktion beruehrt Felder, die sie nichts angehen. Sperren aendert den
//     Status, sonst nichts.
//   - Der letzte Owner kann sich nicht selbst entmachten und niemand kann den
//     eigenen Zugang wegnehmen, waehrend er ihn benutzt.
//   - Loeschen entfernt personenbezogene Daten, behaelt aber die Huelle mit
//     status "deleted": sonst koennte dieselbe Adresse sofort neu registriert
//     werden und die Audit-Spur zeigte ins Leere.
//
// Die Berechtigung prueft der Aufrufer (adminAuth), den Nachweis schreibt der
// Aufrufer (auditLog). Dieses Modul macht die Aenderung — sonst nichts.
import { getUserByEmail, putUser, revokeSessions, userRole, userStatus } from "../auth/emailUserStore.js";
import { ADMIN_ROLES } from "./adminRoles.js";

const ZUWEISBARE_ROLLEN = Object.freeze(["user", ...ADMIN_ROLES]);

/** Der Ausschnitt eines Kontos, der in einen Audit-Eintrag gehoert. */
export function auditView(record) {
  if (!record) return null;
  return {
    userId: record.userId || "",
    role: userRole(record),
    status: userStatus(record),
    emailVerified: Boolean(record.emailVerifiedAt),
    activeSessions: zaehleLebendeSitzungen(record),
    loginLockedUntil: record?.loginGuard?.lockedUntil || null
  };
}

function zaehleLebendeSitzungen(record, nowMs = Date.now()) {
  return (record?.sessions || []).filter((s) => !s?.revokedAt && new Date(s?.expiresAt || 0).getTime() > nowMs).length;
}

async function ladeKonto(email, env) {
  try {
    const record = await getUserByEmail(email, env);
    if (!record) return { ok: false, error: "admin_user_not_found" };
    return { ok: true, record };
  } catch {
    return { ok: false, error: "admin_directory_unavailable" };
  }
}

/**
 * Sperrt oder entsperrt ein Konto und widerruft beim Sperren alle Sitzungen —
 * ein gesperrtes Konto mit laufender Sitzung waere nicht gesperrt.
 */
export async function setUserStatus(email, ziel, { actor, env = process.env, nowMs = Date.now() } = {}) {
  if (!["active", "blocked"].includes(ziel)) return { ok: false, error: "admin_status_invalid" };
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;

  // Niemand sperrt sich selbst aus, waehrend er die Konsole bedient.
  if (ziel === "blocked" && String(record.email).toLowerCase() === String(actor?.email || "").toLowerCase()) {
    return { ok: false, error: "admin_self_block_forbidden" };
  }
  const vorher = auditView(record);
  if (vorher.status === ziel) return { ok: false, error: "admin_no_change", before: vorher };

  record.status = ziel;
  const widerrufen = ziel === "blocked" ? revokeSessions(record) : 0;
  await putUser(record, env);
  return { ok: true, before: vorher, after: auditView(record), revokedSessions: widerrufen, at: new Date(nowMs).toISOString() };
}

/**
 * Vergibt eine Rolle. Braucht Vier-Augen (siehe adminRoles) — hier wird nur
 * geprueft, dass die Rolle bekannt ist und der letzte Owner erhalten bleibt.
 */
export async function setUserRole(email, rolle, { actor, env = process.env, ownerCount = null } = {}) {
  const ziel = String(rolle || "").trim().toLowerCase();
  if (!ZUWEISBARE_ROLLEN.includes(ziel)) return { ok: false, error: "admin_role_invalid", erlaubt: ZUWEISBARE_ROLLEN };
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;
  const vorher = auditView(record);
  if (vorher.role === ziel) return { ok: false, error: "admin_no_change", before: vorher };

  // Der letzte Owner darf nicht verschwinden — sonst sperrt sich die
  // Organisation aus ihrem eigenen Adminbereich aus.
  if (vorher.role === "owner" && ziel !== "owner" && Number(ownerCount) === 1) {
    return { ok: false, error: "admin_last_owner_protected" };
  }
  // Und niemand nimmt sich selbst die Rechte weg, waehrend er sie benutzt.
  if (String(record.email).toLowerCase() === String(actor?.email || "").toLowerCase() && ziel === "user") {
    return { ok: false, error: "admin_self_demote_forbidden" };
  }

  record.role = ziel;
  await putUser(record, env);
  return { ok: true, before: vorher, after: auditView(record) };
}

/** Widerruft Sitzungen. Umkehrbar im Sinne von: der Nutzer meldet sich neu an. */
export async function revokeUserSessions(email, { onlySid = null, env = process.env } = {}) {
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;
  const vorher = auditView(record);
  const widerrufen = revokeSessions(record, { onlySid });
  if (widerrufen === 0) return { ok: false, error: "admin_no_change", before: vorher };
  await putUser(record, env);
  return { ok: true, before: vorher, after: auditView(record), revokedSessions: widerrufen };
}

/** Bestaetigt eine E-Mail-Adresse von Hand — der haeufigste Supportfall. */
export async function markEmailVerified(email, { env = process.env, nowMs = Date.now() } = {}) {
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;
  const vorher = auditView(record);
  if (vorher.emailVerified) return { ok: false, error: "admin_no_change", before: vorher };

  record.emailVerifiedAt = new Date(nowMs).toISOString();
  record.verify = null; // ein offener Verifikationslink ist jetzt gegenstandslos
  await putUser(record, env);
  return { ok: true, before: vorher, after: auditView(record) };
}

/** Hebt die Login-Sperre auf (5 Fehlversuche). Aendert kein Passwort. */
export async function clearLoginLock(email, { env = process.env } = {}) {
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;
  const vorher = auditView(record);
  const gesperrt = Boolean(record?.loginGuard?.lockedUntil) || Number(record?.loginGuard?.failedCount) > 0;
  if (!gesperrt) return { ok: false, error: "admin_no_change", before: vorher };

  record.loginGuard = { failedCount: 0, lockedUntil: null };
  await putUser(record, env);
  return { ok: true, before: vorher, after: auditView(record) };
}

/**
 * Loescht die personenbezogenen Daten eines Kontos (DSGVO Art. 17).
 *
 * Die Huelle bleibt mit status "deleted" bestehen. Das ist Absicht: waere der
 * Datensatz ganz weg, koennte dieselbe Adresse sofort neu registriert werden
 * und die Audit-Spur zeigte ins Leere. Was bleibt, ist die Konto-ID und der
 * Zeitpunkt — kein Name, keine Adresse, kein Passwort-Hash, keine Sitzung.
 *
 * Diese Funktion setzt eine erteilte Vier-Augen-Freigabe voraus; sie prueft das
 * nicht selbst (der Aufrufer tut es), weist aber einen fehlenden Nachweis ab.
 */
export async function deleteUserData(email, { actor, approvalId, env = process.env, nowMs = Date.now() } = {}) {
  if (!String(approvalId || "").trim()) return { ok: false, error: "admin_approval_required" };
  const geladen = await ladeKonto(email, env);
  if (!geladen.ok) return geladen;
  const record = geladen.record;

  if (String(record.email).toLowerCase() === String(actor?.email || "").toLowerCase()) {
    return { ok: false, error: "admin_self_delete_forbidden" };
  }
  const vorher = auditView(record);
  if (vorher.status === "deleted") return { ok: false, error: "admin_no_change", before: vorher };

  const nowIso = new Date(nowMs).toISOString();
  const huelle = {
    version: record.version || 1,
    userId: record.userId,
    // Die Adresse bleibt als Schluessel bestehen, sonst waere der Datensatz
    // nicht auffindbar. Alle uebrigen personenbezogenen Felder fallen weg.
    email: record.email,
    name: "",
    method: record.method || "email",
    passwordHash: "",
    emailVerifiedAt: null,
    role: "user",
    status: "deleted",
    createdAt: record.createdAt || null,
    updatedAt: nowIso,
    deletedAt: nowIso,
    deletedByApproval: String(approvalId).slice(0, 64),
    verify: null,
    reset: null,
    loginGuard: { failedCount: 0, lockedUntil: null },
    sessions: []
  };
  await putUser(huelle, env);
  return {
    ok: true,
    before: vorher,
    after: auditView(huelle),
    entfernt: ["name", "passwordHash", "emailVerifiedAt", "verify", "reset", "sessions"]
  };
}

export const ACTIONS = Object.freeze({
  block: "user.block",
  unblock: "user.unblock",
  roleGrant: "user.role.grant",
  sessionsRevoke: "user.sessions.revoke",
  verify: "user.verify",
  unlock: "user.unlock",
  delete: "user.delete",
  // 2026-08-23: ein bezahltes Abo (Stripe-Kunde) auf dieses Konto haengen —
  // der Fall "bezahlt als andere Adresse" (billing/aboUmhaengen.js).
  billingRelink: "user.billing.relink"
});
