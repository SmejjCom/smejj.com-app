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
import { mapMitGrenze } from "../shared/parallelFetch.js";

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

/**
 * Das Ziel einer Aktion, so dass man es SPAETER noch lesen kann.
 *
 * BEFUND 2026-08-15 (A-bis-Z-Pruefung, im Live-Audit-Log gesehen): hier stand
 * `String(target || "")`. Zwei Aufrufer in adminAutopilotAktionen.js uebergeben
 * ein Objekt (`{ type: "autopilot", id }`) — daraus machte String() die
 * Zeichenkette "[object Object]". In der Spalte "Ziel" stand also bei jeder
 * Autopiloten-Aktion, WAS getan wurde, aber nicht WORAN.
 *
 * Das wiegt hier schwerer als anderswo: das Audit-Log ist anfuegend und
 * unveraenderlich. Ein verlorenes Ziel ist dauerhaft verloren — die bereits
 * geschriebenen Eintraege bleiben deshalb, wie sie sind (ein geschoenter
 * Nachweis waere schlimmer als ein sichtbar defekter).
 *
 * Die Pruefung sitzt bewusst HIER und nicht bei den zwei Aufrufern: so kann
 * kein kuenftiger Aufrufer denselben Fehler noch einmal machen.
 */
export function zielAlsText(ziel) {
  if (ziel === null || ziel === undefined) return "";
  if (typeof ziel === "string") return ziel.slice(0, 200);
  if (typeof ziel !== "object") return String(ziel).slice(0, 200);
  // Aus { type: "autopilot", id: "brueckenwaechter" } wird
  // "autopilot:brueckenwaechter" — lesbar, kurz, eindeutig.
  const paare = Object.entries(ziel)
    .filter(([, wert]) => wert !== null && wert !== undefined && typeof wert !== "object")
    .map(([, wert]) => String(wert));
  return (paare.length ? paare.join(":") : JSON.stringify(ziel)).slice(0, 200);
}

function buildEntry({ actor, action, target, before, after, reason, ip }, prevHash, nowIso) {
  const entry = {
    version: 1,
    at: nowIso,
    actorEmail: String(actor?.email || "").slice(0, 254),
    actorRole: String(actor?.role || "").slice(0, 40),
    actorRoleSource: String(actor?.roleSource || "store").slice(0, 20),
    action: String(action || "").slice(0, 80),
    target: zielAlsText(target),
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

/**
 * Liest die juengsten Eintraege.
 *
 * Das Log waechst unbegrenzt, deshalb wird NICHT das ganze Prefix gelistet.
 * Gescannt werden die Monats-Prefixe des laufenden und des vorigen Monats —
 * zwei parallele LIST-Aufrufe statt eines Durchlaufs ueber alles. Nur wenn
 * darin gar nichts liegt (Log aelter als der Zeitraum), wird einmalig
 * vollstaendig gelistet. Das Ergebnis nennt seinen eigenen Umfang in "window".
 */
export async function readAuditPage({
  limit = 50, env = process.env, nowMs = Date.now(), fetchImpl = fetch, from = "", to = ""
} = {}) {
  const capped = Math.min(200, Math.max(1, Number(limit) || 50));
  const cfg = idriveConfig(env);
  if (!cfg) {
    const gefiltert = memoryEntries.filter((item) => inRange(item.entry.at, from, to));
    const entries = gefiltert.slice(-capped).reverse().map((item) => item.entry);
    return { ok: true, entries, total: gefiltert.length, window: from || to ? "range" : "memory" };
  }

  const spanne = monthSpan({ from, to, nowMs });
  const scanned = await Promise.all(spanne.prefixes.map((prefix) => listKeys(cfg, prefix, fetchImpl)));
  const gescheitert = scanned.find((result) => !result.ok);
  // Der Grund wandert mit: "es liess sich nicht lesen" allein sagt niemandem,
  // ob der Speicher gedrosselt hat, die Verbindung abriss oder der Zugang fehlt.
  if (gescheitert) return { ok: false, error: "audit_list_failed", grund: gescheitert.grund, entries: [] };
  let keys = scanned.flatMap((result) => result.keys);
  let window = spanne.label;

  // Nur ohne ausdruecklichen Zeitraum darf vollstaendig gelistet werden. Wer
  // einen Zeitraum nennt, bekommt genau diesen — sonst waere eine leere
  // Antwort plötzlich eine Antwort ueber das gesamte Log.
  if (keys.length === 0 && !from && !to) {
    const all = await listKeys(cfg, `${PREFIX}/`, fetchImpl);
    if (!all.ok) return { ok: false, error: "audit_list_failed", grund: all.grund, entries: [] };
    keys = all.keys;
    window = "all";
  }
  if (from || to) keys = keys.filter((key) => inRange(keyTimestamp(key), from, to));

  // Der Schluessel traegt den Zeitstempel — lexikografisch sortieren reicht.
  keys.sort().reverse();
  // Begrenzt nebenlaeufig statt nacheinander: bei 50 Eintraegen waeren das sonst
  // 50 Rundreisen hintereinander (live gemessen: 11 Eintraege = 1115 ms).
  const geladen = await mapMitGrenze(keys.slice(0, capped), async (key) => {
    const result = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
    return result.ok && result.body ? JSON.parse(result.body) : null;
  });
  const entries = geladen.filter(Boolean);
  return { ok: true, entries, total: keys.length, window };
}

/**
 * Welche Monats-Prefixe muessen gescannt werden?
 * Ohne Zeitraum: laufender und voriger Monat. Mit Zeitraum: genau die Monate
 * dazwischen, hart gedeckelt — sonst koennte eine Anfrage mit from=1970 das
 * ganze Log Monat fuer Monat abklappern.
 */
export function monthSpan({ from = "", to = "", nowMs = Date.now(), maxMonths = 24 } = {}) {
  const ende = to ? new Date(`${String(to).slice(0, 10)}T23:59:59.999Z`) : new Date(nowMs);
  const start = from ? new Date(`${String(from).slice(0, 10)}T00:00:00.000Z`) : null;
  if (Number.isNaN(ende.getTime()) || (start && Number.isNaN(start.getTime()))) {
    return { prefixes: [], label: "invalid", truncated: false };
  }

  const prefixes = [];
  const cursor = new Date(Date.UTC(ende.getUTCFullYear(), ende.getUTCMonth(), 1));
  const grenze = start ? Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1) : null;
  while (prefixes.length < maxMonths) {
    prefixes.push(`${PREFIX}/${cursor.getUTCFullYear()}/${String(cursor.getUTCMonth() + 1).padStart(2, "0")}/`);
    if (grenze === null) { if (prefixes.length >= 2) break; } else if (cursor.getTime() <= grenze) break;
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  const truncated = grenze !== null && prefixes.length >= maxMonths && cursor.getTime() > grenze;
  return {
    prefixes,
    label: from || to ? `${prefixes.length}m` : "2m",
    truncated
  };
}

/** Liegt ein Zeitstempel im Zeitraum? Leere Grenzen sind offen. */
function inRange(iso, from, to) {
  const stamp = String(iso || "");
  if (!stamp) return false;
  if (from && stamp.slice(0, 10) < String(from).slice(0, 10)) return false;
  if (to && stamp.slice(0, 10) > String(to).slice(0, 10)) return false;
  return true;
}

/** Aus admin/audit/2026/07/28/2026-07-28T09-26-27-724Z-ab12.json wird das Datum. */
function keyTimestamp(key) {
  const match = String(key).match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

// Ein einzelner Schluckauf beim Speicher hat frueher die GANZE Seite gekippt:
// eine nicht-ok-Antwort, und readAuditPage meldete audit_list_failed, woraus
// die Route 503 machte. Gemessen am 2026-08-07: 1 Fehlschlag in 8 Abrufen auf
// einem lange laufenden Container, 0 in 60 auf einem frischen. Lesen ist
// gefahrlos wiederholbar — also wird es wiederholt, statt dem Betreiber einen
// Fehler zu zeigen, den der naechste Versuch nicht mehr haette.
const LIST_VERSUCHE = 3;
const LIST_PAUSE_MS = 150;

async function listKeys(cfg, prefix, fetchImpl = fetch, warteFn = warte) {
  let letzterFehler = "";
  for (let versuch = 1; versuch <= LIST_VERSUCHE; versuch += 1) {
    const ergebnis = await listKeysEinmal(cfg, prefix, fetchImpl);
    if (ergebnis.ok) return ergebnis;
    letzterFehler = ergebnis.grund;
    // Nach dem letzten Versuch nicht mehr warten — das verzoegert nur die Antwort.
    if (versuch < LIST_VERSUCHE) await warteFn(LIST_PAUSE_MS * versuch);
  }
  return { ok: false, keys: [], grund: letzterFehler };
}

/** Ein Durchlauf ueber alle Fortsetzungsseiten. Wirft nicht, sondern meldet. */
async function listKeysEinmal(cfg, prefix, fetchImpl) {
  const keys = [];
  let continuationToken = null;
  do {
    let response, body;
    try {
      ({ response, body } = await signedS3List({ ...cfg, prefix, continuationToken, fetchImpl }));
    } catch (fehler) {
      // Ein Netzfehler (abgerissene Verbindung, Zeitablauf) ist genau der Fall,
      // fuer den die Wiederholung da ist — er darf nicht als Ausnahme nach oben
      // durchschlagen, sonst greift sie gar nicht.
      return { ok: false, keys: [], grund: String(fehler?.message || fehler).slice(0, 120) };
    }
    if (!response.ok) return { ok: false, keys: [], grund: `s3_status_${response.status}` };
    const page = parseS3ListPage(body);
    for (const key of page.keys) if (key !== HEAD_KEY) keys.push(key);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken);
  return { ok: true, keys, grund: "" };
}

function warte(ms) {
  return new Promise((fertig) => setTimeout(fertig, ms));
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
