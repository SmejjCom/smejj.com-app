// smejj.com — Vier-Augen-Prinzip (Single Responsibility: Freigaben verwalten).
//
// Manche Aktionen darf keine einzelne Person allein ausloesen: Loeschen ist
// unumkehrbar, Rollenvergabe ist Rechteausweitung. Dieser Speicher haelt den
// Antrag fest, bis eine ZWEITE Person ihn freigibt.
//
// Vier Regeln, die den Sinn ausmachen:
//   1. Der Antragsteller darf niemals selbst freigeben — auch nicht der Owner.
//      Sonst waeren vier Augen nur zwei mit Umweg.
//   2. Ein Antrag laeuft nach 24 Stunden ab. Eine offene Freigabe, die wochenlang
//      herumliegt, ist eine Hintertuer.
//   3. Jeder Zustandswechsel (beantragt, freigegeben, abgelehnt, ausgefuehrt)
//      erzeugt einen Audit-Eintrag. Der Antrag selbst ist Arbeitszustand, das
//      Audit-Log ist der Nachweis.
//   4. Ein Antrag wird genau einmal ausgefuehrt. Danach ist er abgeschlossen.
//
// Der Antrag speichert NUR, was zur Ausfuehrung noetig ist — keine Kontodaten,
// keine Geheimnisse.
import crypto from "node:crypto";
import { parseS3ListPage, signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

const PREFIX = "admin/approvals";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OFFEN = 200;

export const STATUS = Object.freeze({
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  executed: "executed",
  expired: "expired"
});

// Nur ohne IDrive-Konfiguration (lokale Entwicklung, Tests).
const memory = new Map();

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function objectKey(id) {
  return `${PREFIX}/${id}.json`;
}

export function newApprovalId() {
  return `ap_${crypto.randomBytes(9).toString("base64url")}`;
}

/** Abgelaufen? Wird beim Lesen berechnet, nicht durch einen Zeitgeber gesetzt. */
export function isExpired(record, nowMs = Date.now()) {
  if (!record || record.status !== STATUS.pending) return false;
  return new Date(record.expiresAt || 0).getTime() <= nowMs;
}

/** Der nach aussen sichtbare Zustand — beruecksichtigt den Ablauf. */
export function effectiveStatus(record, nowMs = Date.now()) {
  if (!record) return null;
  return isExpired(record, nowMs) ? STATUS.expired : record.status;
}

async function leseRoh(id, cfg, fetchImpl) {
  if (!cfg) return memory.get(id) || null;
  try {
    const result = await signedS3Get({ ...cfg, key: objectKey(id), allowNotFound: true, fetchImpl });
    if (!result.ok || !result.body) return null;
    return JSON.parse(result.body);
  } catch {
    return null;
  }
}

async function schreibe(record, cfg, fetchImpl) {
  if (!cfg) { memory.set(record.id, record); return record; }
  await signedS3Put({
    ...cfg,
    key: objectKey(record.id),
    body: JSON.stringify(record, null, 2),
    contentType: "application/json; charset=utf-8",
    fetchImpl
  });
  return record;
}

/**
 * Beantragt eine Aktion, die eine zweite Person freigeben muss.
 * @returns {Promise<{ok: true, approval: object} | {ok: false, error: string}>}
 */
export async function requestApproval({
  action, target, payload = null, reason, requestedBy
}, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (!String(action || "").trim()) return { ok: false, error: "approval_action_required" };
  if (!String(target || "").trim()) return { ok: false, error: "approval_target_required" };
  if (String(reason || "").trim().length < 3) return { ok: false, error: "approval_reason_required" };
  if (!String(requestedBy || "").trim()) return { ok: false, error: "approval_requester_required" };

  const nowIso = new Date(nowMs).toISOString();
  const record = {
    version: 1,
    id: newApprovalId(),
    action: String(action).slice(0, 80),
    target: String(target).slice(0, 200),
    payload: payload && typeof payload === "object" ? payload : null,
    reason: String(reason).trim().slice(0, 400),
    requestedBy: String(requestedBy).toLowerCase().slice(0, 254),
    requestedAt: nowIso,
    expiresAt: new Date(nowMs + TTL_MS).toISOString(),
    status: STATUS.pending,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    executedAt: null,
    result: null
  };
  await schreibe(record, idriveConfig(env), fetchImpl);
  return { ok: true, approval: record };
}

/** Liest einen Antrag und meldet Ablauf ehrlich mit. */
export async function getApproval(id, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const record = await leseRoh(String(id || ""), idriveConfig(env), fetchImpl);
  if (!record) return { ok: false, error: "approval_not_found" };
  return { ok: true, approval: { ...record, status: effectiveStatus(record, nowMs) } };
}

/**
 * Gibt einen Antrag frei. Der Antragsteller darf das NICHT — das ist der
 * ganze Sinn der Sache.
 */
export async function approveRequest(id, approver, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  return entscheide(id, approver, STATUS.approved, "", { env, fetchImpl, nowMs });
}

/** Lehnt einen Antrag ab. Auch das darf der Antragsteller nicht. */
export async function rejectRequest(id, approver, reason, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  return entscheide(id, approver, STATUS.rejected, reason, { env, fetchImpl, nowMs });
}

async function entscheide(id, approver, ziel, entscheidungsgrund, { env, fetchImpl, nowMs }) {
  const cfg = idriveConfig(env);
  const record = await leseRoh(String(id || ""), cfg, fetchImpl);
  if (!record) return { ok: false, error: "approval_not_found" };

  const person = String(approver || "").toLowerCase().trim();
  if (!person) return { ok: false, error: "approval_approver_required" };
  if (isExpired(record, nowMs)) return { ok: false, error: "approval_expired" };
  if (record.status !== STATUS.pending) return { ok: false, error: "approval_already_decided", status: record.status };
  if (person === record.requestedBy) return { ok: false, error: "approval_self_approval_forbidden" };

  const entschieden = {
    ...record,
    status: ziel,
    decidedBy: person.slice(0, 254),
    decidedAt: new Date(nowMs).toISOString(),
    decisionReason: String(entscheidungsgrund || "").trim().slice(0, 400) || null
  };
  await schreibe(entschieden, cfg, fetchImpl);
  return { ok: true, approval: entschieden };
}

/**
 * Markiert einen freigegebenen Antrag als ausgefuehrt. Genau einmal:
 * ein zweiter Aufruf wird abgewiesen.
 */
export async function markExecuted(id, result, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const cfg = idriveConfig(env);
  const record = await leseRoh(String(id || ""), cfg, fetchImpl);
  if (!record) return { ok: false, error: "approval_not_found" };
  if (record.status === STATUS.executed) return { ok: false, error: "approval_already_executed" };
  if (record.status !== STATUS.approved) return { ok: false, error: "approval_not_approved", status: record.status };

  const ausgefuehrt = {
    ...record,
    status: STATUS.executed,
    executedAt: new Date(nowMs).toISOString(),
    result: result && typeof result === "object" ? result : null
  };
  await schreibe(ausgefuehrt, cfg, fetchImpl);
  return { ok: true, approval: ausgefuehrt };
}

/** Alle Antraege, neueste zuerst. Abgelaufene sind als solche gekennzeichnet. */
export async function listApprovals({ env = process.env, fetchImpl = fetch, nowMs = Date.now(), limit = 50 } = {}) {
  const capped = Math.min(MAX_OFFEN, Math.max(1, Number(limit) || 50));
  const cfg = idriveConfig(env);
  if (!cfg) {
    const alle = [...memory.values()]
      .map((r) => ({ ...r, status: effectiveStatus(r, nowMs) }))
      .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
    return { ok: true, approvals: alle.slice(0, capped), total: alle.length };
  }

  const keys = [];
  let continuationToken = null;
  do {
    const { response, body } = await signedS3List({ ...cfg, prefix: `${PREFIX}/`, continuationToken, fetchImpl });
    if (!response.ok) return { ok: false, error: "approval_list_failed", approvals: [] };
    const page = parseS3ListPage(body);
    for (const key of page.keys) if (key.endsWith(".json")) keys.push(key);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken && keys.length < MAX_OFFEN);

  const geladen = await mapMitGrenze(keys.slice(0, MAX_OFFEN), async (key) => {
    const result = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
    if (!result.ok || !result.body) return null;
    const record = JSON.parse(result.body);
    return { ...record, status: effectiveStatus(record, nowMs) };
  });
  const approvals = geladen.filter(Boolean);
  approvals.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  return { ok: true, approvals: approvals.slice(0, capped), total: approvals.length };
}

export function __clearApprovalMemoryForTests() {
  memory.clear();
}
