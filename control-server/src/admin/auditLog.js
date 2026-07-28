// smejj.com — Audit-Log des Adminbereichs (Single Responsibility: unveraenderliche Nachweise).
// Jede schreibende Admin-Aktion erzeugt genau einen Eintrag. Eintraege werden
// nur angefuegt, nie geaendert und nie geloescht — auch nicht vom Owner.
//
// Unveraenderlichkeit auf zwei Wegen:
//   1. Der PUT laeuft mit If-None-Match: * — ein bestehender Schluessel wird
//      niemals ueberschrieben, auch nicht versehentlich.
//   2. Jeder Eintrag traegt die Pruefsumme seines Vorgaengers. Eine Luecke oder
//      eine nachtraegliche Aenderung bricht die Kette sichtbar.
//
// Der Kopfzeiger (head.json) wird mit If-Match geschrieben. Schreiben zwei
// Vorgaenge gleichzeitig, verliert einer das Rennen und wiederholt mit dem
// neuen Vorgaenger — statt die Kette still zu gabeln.
import crypto from "node:crypto";
import { signedS3Get, signedS3List, signedS3Put, parseS3ListPage } from "../storage/s3Signer.js";

const PREFIX = "admin/audit";
const HEAD_KEY = `${PREFIX}/head.json`;
const GENESIS = "0".repeat(64);
const MAX_ATTEMPTS = 4;
const MAX_TEXT = 400;
const SECRET_KEYS = /^(password|passwordhash|token|tokenhash|apikey|secret|authorization|cookie|sessionid|sid)$/i;

// Nur ohne IDrive-Konfiguration (lokale Entwicklung, Tests).
const memoryEntries = [];
let memoryHead = { hash: GENESIS, key: "", count: 0 };

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

/** Deterministische Pruefsumme: gleiche Felder -> gleicher Hash, unabhaengig von der Reihenfolge. */
export function entryHash(entry) {
  const stable = JSON.stringify(entry, Object.keys(entry).filter((key) => key !== "hash").sort());
  return crypto.createHash("sha256").update(stable).digest("hex");
}

/** Kappt Texte und entfernt Felder, die niemals in einen Nachweis gehoeren. */
export function redact(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, MAX_TEXT);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[zu tief]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      result[key] = SECRET_KEYS.test(key) ? "[entfernt]" : redact(item, depth + 1);
    }
    return result;
  }
  return null;
}

function buildEntry({ actor, action, target, before, after, reason, ip }, prevHash, nowIso) {
  const entry = {
    version: 1,
    at: nowIso,
    actorEmail: String(actor?.email || "").slice(0, 254),
    actorRole: String(actor?.role || "").slice(0, 40),
    actorRoleSource: String(actor?.roleSource || "store").slice(0, 20),
    action: String(action || "").slice(0, 80),
    target: String(target || "").slice(0, 200),
    before: redact(before),
    after: redact(after),
    reason: String(reason || "").slice(0, MAX_TEXT),
    ip: String(ip || "").slice(0, 60),
    prevHash
  };
  entry.hash = entryHash(entry);
  return entry;
}

function objectKeyFor(nowIso) {
  const [date] = nowIso.split("T");
  const [year, month, day] = date.split("-");
  const stamp = nowIso.replace(/[:.]/g, "-");
  return `${PREFIX}/${year}/${month}/${day}/${stamp}-${crypto.randomBytes(4).toString("hex")}.json`;
}

/**
 * Haengt einen Eintrag an. Der Grund ist Pflicht — ohne Grund keine Aktion.
 * @returns {Promise<{ok: boolean, key?: string, hash?: string, error?: string}>}
 */
export async function appendAuditEntry(input, { env = process.env, nowIso = new Date().toISOString() } = {}) {
  if (!input?.actor?.email) return { ok: false, error: "audit_actor_required" };
  if (!String(input?.action || "").trim()) return { ok: false, error: "audit_action_required" };
  if (!String(input?.reason || "").trim()) return { ok: false, error: "audit_reason_required" };

  const cfg = idriveConfig(env);
  if (!cfg) {
    const entry = buildEntry(input, memoryHead.hash, nowIso);
    const key = objectKeyFor(nowIso);
    memoryEntries.push({ key, entry });
    memoryHead = { hash: entry.hash, key, count: memoryHead.count + 1 };
    return { ok: true, key, hash: entry.hash };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const head = await readHead(cfg);
    const entry = buildEntry(input, head.value.hash, nowIso);
    const key = objectKeyFor(nowIso);

    const written = await signedS3Put({
      ...cfg,
      key,
      body: JSON.stringify(entry, null, 2),
      contentType: "application/json; charset=utf-8",
      ifNoneMatch: "*" // niemals ueberschreiben
    });
    if (!written.ok) continue; // Schluesselkollision: neuer Zufallsanteil im naechsten Versuch

    const headWrite = await signedS3Put({
      ...cfg,
      key: HEAD_KEY,
      body: JSON.stringify({ hash: entry.hash, key, at: nowIso, count: head.value.count + 1 }, null, 2),
      contentType: "application/json; charset=utf-8",
      ...(head.etag ? { ifMatch: head.etag } : {})
    });
    if (headWrite.ok) return { ok: true, key, hash: entry.hash };
    // 412: jemand anderes war schneller — mit dessen Hash erneut anfuegen.
  }
  return { ok: false, error: "audit_head_contention" };
}

async function readHead(cfg) {
  try {
    const result = await signedS3Get({ ...cfg, key: HEAD_KEY, allowNotFound: true });
    if (!result.ok || !result.body) return { value: { hash: GENESIS, key: "", count: 0 }, etag: "" };
    const parsed = JSON.parse(result.body);
    return {
      value: {
        hash: /^[a-f0-9]{64}$/.test(String(parsed.hash || "")) ? parsed.hash : GENESIS,
        key: String(parsed.key || ""),
        count: Number(parsed.count) || 0
      },
      etag: result.etag || ""
    };
  } catch {
    return { value: { hash: GENESIS, key: "", count: 0 }, etag: "" };
  }
}

/** Liest die juengsten Eintraege. Bewusst gedeckelt — das Log waechst unbegrenzt. */
export async function readAuditPage({ limit = 50, env = process.env } = {}) {
  const capped = Math.min(200, Math.max(1, Number(limit) || 50));
  const cfg = idriveConfig(env);
  if (!cfg) {
    const entries = memoryEntries.slice(-capped).reverse().map((item) => item.entry);
    return { ok: true, entries, total: memoryEntries.length };
  }

  const keys = [];
  let continuationToken = null;
  do {
    const { response, body } = await signedS3List({ ...cfg, prefix: `${PREFIX}/`, continuationToken });
    if (!response.ok) return { ok: false, error: "audit_list_failed", entries: [] };
    const page = parseS3ListPage(body);
    for (const key of page.keys) if (key !== HEAD_KEY) keys.push(key);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken);

  // Der Schluessel beginnt mit dem Zeitstempel — lexikografisch sortieren reicht.
  keys.sort().reverse();
  const entries = [];
  for (const key of keys.slice(0, capped)) {
    try {
      const result = await signedS3Get({ ...cfg, key, allowNotFound: true });
      if (result.ok && result.body) entries.push(JSON.parse(result.body));
    } catch { /* einzelner unlesbarer Eintrag darf die Seite nicht kippen */ }
  }
  return { ok: true, entries, total: keys.length };
}

/**
 * Prueft eine Kette (juengster Eintrag zuerst, so wie readAuditPage liefert).
 * @returns {{ok: boolean, brokenAt: number|null, reason: string}}
 */
export function verifyAuditChain(entries) {
  const list = Array.isArray(entries) ? [...entries].reverse() : []; // aeltester zuerst
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index];
    if (entryHash(entry) !== entry.hash) {
      return { ok: false, brokenAt: list.length - 1 - index, reason: "entry_hash_mismatch" };
    }
    const previous = list[index - 1];
    if (previous && entry.prevHash !== previous.hash) {
      return { ok: false, brokenAt: list.length - 1 - index, reason: "chain_link_mismatch" };
    }
  }
  return { ok: true, brokenAt: null, reason: "" };
}

export function __clearAuditMemoryForTests() {
  memoryEntries.length = 0;
  memoryHead = { hash: GENESIS, key: "", count: 0 };
}
