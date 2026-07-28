// smejj.com — Nutzer-Index des Adminbereichs (Single Responsibility: Auflistbarkeit).
//
// Warum es diese Datei gibt: Konten liegen als einzelne Objekte unter
// auth/email-users/{sha256(email)}.json. Aus einem Hash laesst sich keine Liste
// bilden — "zeige alle Nutzer, sortiert nach Registrierung" ist ohne Index
// schlicht nicht moeglich. Der Index ist eine abgeleitete Projektion: er darf
// jederzeit verworfen und neu gebaut werden, er ist niemals die Wahrheit.
//
// Bewusste Entscheidung: der Anmeldepfad bleibt unberuehrt. putUser() schreibt
// den Index NICHT mit — ein Indexfehler darf niemals eine Anmeldung verhindern.
// Der Index wird stattdessen angestossen neu gebaut (Adminbereich oder Zeitplan)
// und traegt sein Alter sichtbar mit sich.
import { userRole, userStatus } from "../auth/emailUserStore.js";
import { parseS3ListPage, signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";

const USER_PREFIX = "auth/email-users/";
const INDEX_KEY = "admin/index/users.json";
const MAX_ENTRIES = 50_000;

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

/**
 * Reduziert einen Kontodatensatz auf das, was der Adminbereich sehen darf.
 * Enthaelt bewusst KEINEN Passwort-Hash, KEINE Token-Hashes und KEINE Sitzungs-IDs.
 */
export function indexEntryFrom(record) {
  const sessions = Array.isArray(record?.sessions) ? record.sessions : [];
  const now = Date.now();
  return {
    userId: String(record?.userId || ""),
    email: String(record?.email || ""),
    name: String(record?.name || "").slice(0, 120),
    method: String(record?.method || "email"),
    role: userRole(record),
    status: userStatus(record),
    emailVerified: Boolean(record?.emailVerifiedAt),
    createdAt: record?.createdAt || null,
    updatedAt: record?.updatedAt || null,
    activeSessions: sessions.filter((s) => !s?.revokedAt && new Date(s?.expiresAt || 0).getTime() > now).length,
    loginLockedUntil: record?.loginGuard?.lockedUntil || null
  };
}

/**
 * Baut den Index vollstaendig neu. Kostet je Konto einen GET — deshalb
 * angestossen, nicht bei jeder Anfrage.
 */
export async function rebuildUserIndex({ env = process.env, fetchImpl = fetch, nowIso = new Date().toISOString() } = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "index_requires_object_storage" };

  const keys = [];
  let continuationToken = null;
  do {
    const { response, body } = await signedS3List({ ...cfg, prefix: USER_PREFIX, continuationToken, fetchImpl });
    if (!response.ok) return { ok: false, error: "index_list_failed" };
    const page = parseS3ListPage(body);
    for (const key of page.keys) if (key.endsWith(".json")) keys.push(key);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken && keys.length < MAX_ENTRIES);

  const entries = [];
  let unreadable = 0;
  for (const key of keys.slice(0, MAX_ENTRIES)) {
    try {
      const result = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
      if (!result.ok || !result.body) { unreadable += 1; continue; }
      const entry = indexEntryFrom(JSON.parse(result.body));
      if (entry.email) entries.push(entry);
      else unreadable += 1;
    } catch {
      unreadable += 1;
    }
  }

  entries.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const index = {
    version: 1,
    builtAt: nowIso,
    count: entries.length,
    // Ehrlich mitgefuehrt: wenn Objekte unlesbar waren, ist der Index unvollstaendig.
    unreadable,
    truncated: keys.length >= MAX_ENTRIES,
    entries
  };
  await signedS3Put({
    ...cfg,
    key: INDEX_KEY,
    body: JSON.stringify(index),
    contentType: "application/json; charset=utf-8",
    fetchImpl
  });
  return { ok: true, builtAt: nowIso, count: entries.length, unreadable, truncated: index.truncated };
}

/** Liest den Index. Liefert ok:false, solange nie gebaut wurde — kein stilles leeres Ergebnis. */
export async function readUserIndex({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "index_requires_object_storage" };
  try {
    const result = await signedS3Get({ ...cfg, key: INDEX_KEY, allowNotFound: true, fetchImpl });
    if (!result.ok || !result.body) return { ok: false, error: "index_not_built" };
    const parsed = JSON.parse(result.body);
    return {
      ok: true,
      builtAt: parsed.builtAt || null,
      ageSeconds: parsed.builtAt ? Math.max(0, Math.round((Date.now() - new Date(parsed.builtAt).getTime()) / 1000)) : null,
      count: Number(parsed.count) || 0,
      unreadable: Number(parsed.unreadable) || 0,
      truncated: parsed.truncated === true,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return { ok: false, error: "index_unreadable" };
  }
}

/** Filtern und Blaettern auf dem gelesenen Index — reine Funktion, keine I/O. */
export function selectFromIndex(entries, { query = "", role = "", status = "", offset = 0, limit = 50 } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  const filtered = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (role && entry.role !== role) return false;
    if (status && entry.status !== status) return false;
    if (!needle) return true;
    return String(entry.email || "").toLowerCase().includes(needle)
      || String(entry.name || "").toLowerCase().includes(needle)
      || String(entry.userId || "").toLowerCase().includes(needle);
  });
  const start = Math.max(0, Number(offset) || 0);
  const capped = Math.min(200, Math.max(1, Number(limit) || 50));
  return { total: filtered.length, offset: start, limit: capped, entries: filtered.slice(start, start + capped) };
}
