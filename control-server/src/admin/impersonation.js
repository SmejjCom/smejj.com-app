// smejj.com — Support-Impersonation (Single Responsibility: Sitzungen mit Einwilligung).
//
// Impersonation ist der schaerfste Eingriff im ganzen Adminbereich: jemand
// sieht das Konto einer anderen Person. Deshalb ist sie hier NICHT als
// Generalvollmacht gebaut, sondern als eng gefuehrter Vorgang:
//
//   1. EINWILLIGUNG STATT VOLLMACHT. Die betroffene Person gibt sie in IHRER
//      EIGENEN Sitzung — nicht der Support, nicht per E-Mail-Link, den man
//      abfangen koennte. Ohne Einwilligung passiert nichts.
//   2. MINDESTUMFANG. Der Antrag nennt vorher, was gesehen werden darf. Chat-
//      Inhalte sind ein eigener Umfang und nicht im Standard enthalten.
//   3. KURZ UND SICHTBAR. Hoechstens 30 Minuten, mit Ablauf im Datensatz, und
//      jederzeit von beiden Seiten beendbar.
//   4. BREAK-GLASS NUR MIT ALARM. Ohne Einwilligung geht es nur mit
//      schriftlicher Begruendung, verkuerzter Dauer und einem Eintrag, der als
//      Break-Glass erkennbar ist. Es ist kein stiller Weg vorbei an Punkt 1.
//
// Was hier NICHT passiert: es wird kein Sitzungs-Token der anderen Person
// erzeugt und keines gelesen. Der Datensatz ist eine Erlaubnis, kein Schluessel.
// Wer daraus eine echte Sitzung baut, muss das ausdruecklich und getrennt tun.
import crypto from "node:crypto";
import { parseS3ListPage, signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";

const PREFIX = "admin/impersonation";
const CONSENT_TTL_MS = 15 * 60 * 1000;   // so lange darf die Anfrage auf Antwort warten
const MAX_SESSION_MS = 30 * 60 * 1000;   // Obergrenze fuer die Sitzung selbst
const BREAK_GLASS_MS = 10 * 60 * 1000;   // ohne Einwilligung deutlich kuerzer

export const SCOPES = Object.freeze({
  settings: "settings",   // Einstellungen und Kontostamm
  billing: "billing",     // Abrechnung
  content: "content"      // Chat-Inhalte — bewusst getrennt, nie im Standard
});
export const DEFAULT_SCOPES = Object.freeze([SCOPES.settings, SCOPES.billing]);

export const IMP_STATUS = Object.freeze({
  awaitingConsent: "awaiting_consent",
  active: "active",
  denied: "denied",
  ended: "ended",
  expired: "expired"
});

const memory = new Map();

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

const objectKey = (id) => `${PREFIX}/${id}.json`;

export function newImpersonationId() {
  return `imp_${crypto.randomBytes(9).toString("base64url")}`;
}

export function normalizeScopes(werte) {
  const erlaubt = new Set(Object.values(SCOPES));
  const liste = (Array.isArray(werte) ? werte : DEFAULT_SCOPES)
    .map((s) => String(s || "").trim().toLowerCase())
    .filter((s) => erlaubt.has(s));
  return liste.length ? [...new Set(liste)] : [...DEFAULT_SCOPES];
}

/** Der nach aussen sichtbare Zustand — Ablauf wird gerechnet, nicht gespeichert. */
export function effectiveImpStatus(record, nowMs = Date.now()) {
  if (!record) return null;
  if (record.status === IMP_STATUS.awaitingConsent) {
    return new Date(record.consentExpiresAt || 0).getTime() <= nowMs ? IMP_STATUS.expired : IMP_STATUS.awaitingConsent;
  }
  if (record.status === IMP_STATUS.active) {
    return new Date(record.endsAt || 0).getTime() <= nowMs ? IMP_STATUS.expired : IMP_STATUS.active;
  }
  return record.status;
}

async function lese(id, cfg, fetchImpl) {
  if (!cfg) return memory.get(id) || null;
  try {
    const result = await signedS3Get({ ...cfg, key: objectKey(id), allowNotFound: true, fetchImpl });
    if (!result.ok || !result.body) return null;
    return JSON.parse(result.body);
  } catch { return null; }
}

async function schreibe(record, cfg, fetchImpl) {
  if (!cfg) { memory.set(record.id, record); return record; }
  await signedS3Put({
    ...cfg, key: objectKey(record.id),
    body: JSON.stringify(record, null, 2),
    contentType: "application/json; charset=utf-8", fetchImpl
  });
  return record;
}

/**
 * Beantragt Impersonation. Ohne Break-Glass wartet der Antrag auf die
 * Einwilligung der betroffenen Person.
 */
export async function requestImpersonation({
  subjectEmail, operator, scopes, reason, durationMs, breakGlass = false
}, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const subject = String(subjectEmail || "").toLowerCase().trim();
  const wer = String(operator?.email || "").toLowerCase().trim();
  if (!subject) return { ok: false, error: "impersonation_subject_required" };
  if (!wer) return { ok: false, error: "impersonation_operator_required" };
  if (subject === wer) return { ok: false, error: "impersonation_self_pointless" };
  if (String(reason || "").trim().length < 3) return { ok: false, error: "impersonation_reason_required" };
  // Break-Glass verlangt eine ausfuehrlichere Begruendung — wer ohne
  // Einwilligung hineingeht, muss mehr sagen als "Support".
  if (breakGlass && String(reason).trim().length < 20) {
    return { ok: false, error: "impersonation_break_glass_reason_too_short" };
  }

  const gewuenscht = Math.min(
    Number(durationMs) > 0 ? Number(durationMs) : MAX_SESSION_MS,
    breakGlass ? BREAK_GLASS_MS : MAX_SESSION_MS
  );
  const nowIso = new Date(nowMs).toISOString();
  const record = {
    version: 1,
    id: newImpersonationId(),
    subjectEmail: subject.slice(0, 254),
    operatorEmail: wer.slice(0, 254),
    operatorRole: String(operator?.role || "").slice(0, 40),
    scopes: normalizeScopes(scopes),
    reason: String(reason).trim().slice(0, 400),
    breakGlass: Boolean(breakGlass),
    durationMs: gewuenscht,
    requestedAt: nowIso,
    consentExpiresAt: new Date(nowMs + CONSENT_TTL_MS).toISOString(),
    status: breakGlass ? IMP_STATUS.active : IMP_STATUS.awaitingConsent,
    consentGivenAt: null,
    startedAt: breakGlass ? nowIso : null,
    endsAt: breakGlass ? new Date(nowMs + gewuenscht).toISOString() : null,
    endedAt: null,
    endedBy: null,
    // Break-Glass ist ein Alarm, kein Verfahren. Der Vermerk gehoert in den
    // Datensatz, damit er in jeder Liste sofort auffaellt.
    alarm: breakGlass ? "break_glass_ohne_einwilligung" : null
  };
  await schreibe(record, idriveConfig(env), fetchImpl);
  return { ok: true, impersonation: record };
}

/**
 * Die betroffene Person willigt ein — in ihrer eigenen Sitzung.
 * Niemand sonst kann das, auch der Owner nicht.
 */
export async function grantConsent(id, subjectEmail, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  return entscheideEinwilligung(id, subjectEmail, true, { env, fetchImpl, nowMs });
}

/** Die betroffene Person lehnt ab. */
export async function denyConsent(id, subjectEmail, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  return entscheideEinwilligung(id, subjectEmail, false, { env, fetchImpl, nowMs });
}

async function entscheideEinwilligung(id, subjectEmail, zustimmung, { env, fetchImpl, nowMs }) {
  const cfg = idriveConfig(env);
  const record = await lese(String(id || ""), cfg, fetchImpl);
  if (!record) return { ok: false, error: "impersonation_not_found" };

  const wer = String(subjectEmail || "").toLowerCase().trim();
  // Der Kern der Sache: nur die betroffene Person selbst.
  if (wer !== record.subjectEmail) return { ok: false, error: "impersonation_consent_wrong_person" };
  if (effectiveImpStatus(record, nowMs) === IMP_STATUS.expired) return { ok: false, error: "impersonation_expired" };
  if (record.status !== IMP_STATUS.awaitingConsent) {
    return { ok: false, error: "impersonation_not_awaiting_consent", status: record.status };
  }

  const nowIso = new Date(nowMs).toISOString();
  const aktualisiert = zustimmung
    ? {
      ...record,
      status: IMP_STATUS.active,
      consentGivenAt: nowIso,
      startedAt: nowIso,
      endsAt: new Date(nowMs + record.durationMs).toISOString()
    }
    : { ...record, status: IMP_STATUS.denied, endedAt: nowIso, endedBy: "subject" };
  await schreibe(aktualisiert, cfg, fetchImpl);
  return { ok: true, impersonation: aktualisiert };
}

/**
 * Beendet eine laufende Sitzung. Beide Seiten duerfen das jederzeit —
 * die betroffene Person ebenso wie der Support.
 */
export async function endImpersonation(id, wer, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const cfg = idriveConfig(env);
  const record = await lese(String(id || ""), cfg, fetchImpl);
  if (!record) return { ok: false, error: "impersonation_not_found" };

  const person = String(wer || "").toLowerCase().trim();
  const istBeteiligt = person === record.subjectEmail || person === record.operatorEmail;
  if (!istBeteiligt) return { ok: false, error: "impersonation_end_not_allowed" };
  if (![IMP_STATUS.active, IMP_STATUS.awaitingConsent].includes(record.status)) {
    return { ok: false, error: "impersonation_not_running", status: record.status };
  }

  const beendet = {
    ...record,
    status: IMP_STATUS.ended,
    endedAt: new Date(nowMs).toISOString(),
    endedBy: person === record.subjectEmail ? "subject" : "operator"
  };
  await schreibe(beendet, cfg, fetchImpl);
  return { ok: true, impersonation: beendet };
}

/** Darf dieser Vorgang gerade auf diesen Umfang zugreifen? Fail-closed. */
export function isScopeAllowed(record, scope, nowMs = Date.now()) {
  if (effectiveImpStatus(record, nowMs) !== IMP_STATUS.active) return false;
  return (record.scopes || []).includes(String(scope || "").trim().toLowerCase());
}

/** Vorgaenge auflisten, neueste zuerst. Fuer die Konsole und fuer das eigene Konto. */
export async function listImpersonations({
  env = process.env, fetchImpl = fetch, nowMs = Date.now(), subjectEmail = "", limit = 50
} = {}) {
  const capped = Math.min(200, Math.max(1, Number(limit) || 50));
  const filter = String(subjectEmail || "").toLowerCase().trim();
  const cfg = idriveConfig(env);

  let alle = [];
  if (!cfg) {
    alle = [...memory.values()];
  } else {
    const keys = [];
    let continuationToken = null;
    do {
      const { response, body } = await signedS3List({ ...cfg, prefix: `${PREFIX}/`, continuationToken, fetchImpl });
      if (!response.ok) return { ok: false, error: "impersonation_list_failed", impersonations: [] };
      const page = parseS3ListPage(body);
      for (const key of page.keys) if (key.endsWith(".json")) keys.push(key);
      continuationToken = page.isTruncated ? page.nextContinuationToken : null;
    } while (continuationToken && keys.length < 200);
    for (const key of keys.slice(0, 200)) {
      try {
        const result = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
        if (result.ok && result.body) alle.push(JSON.parse(result.body));
      } catch { /* ein unlesbarer Vorgang darf die Liste nicht kippen */ }
    }
  }

  const sichtbar = alle
    .filter((r) => !filter || r.subjectEmail === filter)
    .map((r) => ({ ...r, status: effectiveImpStatus(r, nowMs) }))
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  return { ok: true, impersonations: sichtbar.slice(0, capped), total: sichtbar.length };
}

export async function getImpersonation(id, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const record = await lese(String(id || ""), idriveConfig(env), fetchImpl);
  if (!record) return { ok: false, error: "impersonation_not_found" };
  return { ok: true, impersonation: { ...record, status: effectiveImpStatus(record, nowMs) } };
}

export function __clearImpersonationMemoryForTests() {
  memory.clear();
}
