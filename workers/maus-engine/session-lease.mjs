// smejj.com Maus-Engine — Sitzungs-Lease auf IDrive e2.
// Single Responsibility: festhalten, WER eine Maus-Sitzung gerade haelt und
// BIS WANN. Der Browser selbst lebt zwangslaeufig im Prozess (er laesst sich
// nicht auf einen Objektspeicher legen) — die *Wahrheit darueber*, ob eine
// Sitzung gueltig ist, liegt hier auf e2. Damit gilt die Zustandslos-Pflicht
// weiter: 1 Instanz und 50 Instanzen verhalten sich gleich, weil jede Instanz
// vor dem Anfassen einer Sitzung dasselbe Objekt liest.
//
// Fail-closed: Haelt eine FREMDE Instanz die Sitzung noch, wird der Zugriff
// abgelehnt — nie still ein zweiter Browser fuer dieselbe sessionId geoeffnet.
// Ein abgelaufener Lease gilt als frei; das ist der Selbstheilungs-Pfad, wenn
// eine Instanz ohne sauberes Ende verschwindet (Scale-to-zero, Neustart).
import { signedS3Request, assertSafeObjectKey } from "../glm-salad/s3.js";

export const LEASE_DEFAULT_TTL_MS = 600_000; // 10 Minuten Leerlauf, dann Abbau
export const LEASE_HARD_LIMIT_MS = 3_600_000; // 60 Minuten absolute Obergrenze

const SESSION_ID_RE = /^[a-z0-9][a-z0-9-]{7,63}$/;

// Sitzungs-Kennungen sind Teil eines e2-Schluessels: eng halten, nicht
// nachtraeglich "reparieren". Ein ungueltiger Wert wird abgelehnt, nicht
// zurechtgebogen — sonst zeigen zwei verschiedene Eingaben auf dasselbe Objekt.
export function isValidSessionId(sessionId) {
  return typeof sessionId === "string" && SESSION_ID_RE.test(sessionId);
}

export function leaseKey(sessionId) {
  if (!isValidSessionId(sessionId)) throw new Error(`session_id_ungueltig: ${String(sessionId).slice(0, 40)}`);
  return `capsules/maus-engine/sessions/${sessionId}/lease.json`;
}

export function buildLease({ sessionId, holder, capsuleRef = null, now, ttlMs = LEASE_DEFAULT_TTL_MS, createdAt = null }) {
  const start = createdAt || new Date(now).toISOString();
  return {
    schemaVersion: 1,
    sessionId,
    holder,
    capsuleRef,
    status: "aktiv",
    createdAt: start,
    renewedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    hardExpiresAt: new Date(Date.parse(start) + LEASE_HARD_LIMIT_MS).toISOString()
  };
}

function millis(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reine Deutung eines gelesenen Lease-Objekts. Kein Netz, kein Zeitgeber —
 * damit genau diese Entscheidung testbar ist (die Diagnose-Lehre aus
 * job_maus_kette_beweisen_20260729: ein Werkzeug ohne Tests ist selbst eine
 * Fehlerquelle).
 * @param {object|null} record gelesenes Lease-Objekt oder null
 * @param {{holder:string, now:number}} ctx eigene Instanz-Kennung und Jetzt-Zeit
 * @returns {{ok:boolean, grund:string}} ok:true = darf uebernehmen/weiterfuehren
 */
export function leaseVerdict(record, { holder, now }) {
  if (!record || typeof record !== "object") return { ok: true, grund: "frei" };
  if (record.status === "beendet") return { ok: true, grund: "beendet" };
  const hard = millis(record.hardExpiresAt);
  if (hard && now >= hard) return { ok: true, grund: "hartlimit_erreicht" };
  const expires = millis(record.expiresAt);
  if (!expires || now >= expires) return { ok: true, grund: "abgelaufen" };
  if (record.holder && record.holder === holder) return { ok: true, grund: "eigen" };
  return { ok: false, grund: "fremd_aktiv" };
}

// e2-gestuetzter Lease-Store. getObject/putObject sind injizierbar, damit die
// Tests ohne Netz und ohne Zugangsdaten laufen.
export function createLeaseStore({ config, getObject, putObject, clock = Date } = {}) {
  const disabled = !config && !getObject && !putObject;
  const put = putObject || ((key, body) => signedS3Request(config, "PUT", key, body, "application/json"));
  const get = getObject || ((key) => signedS3Request(config, "GET", key));

  async function read(sessionId) {
    if (disabled) return null;
    try {
      const key = leaseKey(sessionId);
      assertSafeObjectKey(key);
      return JSON.parse(await get(key));
    } catch {
      // Fehlendes oder unlesbares Objekt = kein Lease. Der Verdict-Pfad
      // behandelt das als "frei"; ein echtes Netzproblem faellt weiter unten
      // beim Schreiben auf.
      return null;
    }
  }

  async function write(record) {
    if (disabled) return false;
    const key = leaseKey(record.sessionId);
    assertSafeObjectKey(key);
    await put(key, JSON.stringify(record, null, 2));
    return true;
  }

  return {
    disabled,
    read,
    /**
     * Lease uebernehmen oder verlaengern. Fail-closed: haelt eine fremde
     * Instanz die Sitzung noch, wird NICHT geschrieben.
     */
    async claim({ sessionId, holder, capsuleRef = null, ttlMs = LEASE_DEFAULT_TTL_MS }) {
      const now = clock.now();
      const existing = await read(sessionId);
      const verdict = leaseVerdict(existing, { holder, now });
      if (!verdict.ok) {
        return { ok: false, grund: verdict.grund, holder: existing?.holder ?? null, expiresAt: existing?.expiresAt ?? null };
      }
      const createdAt = verdict.grund === "eigen" ? existing?.createdAt ?? null : null;
      const record = buildLease({ sessionId, holder, capsuleRef, now, ttlMs, createdAt });
      await write(record);
      return { ok: true, grund: verdict.grund, lease: record };
    },
    async renew({ sessionId, holder, capsuleRef = null, ttlMs = LEASE_DEFAULT_TTL_MS }) {
      return this.claim({ sessionId, holder, capsuleRef, ttlMs });
    },
    /**
     * Lease freigeben. Nur der eigene Halter darf beenden — sonst koennte eine
     * fremde Instanz eine laufende Sitzung unter den Fuessen wegziehen.
     */
    async release({ sessionId, holder }) {
      const existing = await read(sessionId);
      if (existing && existing.holder && existing.holder !== holder) {
        return { ok: false, grund: "fremd_aktiv" };
      }
      const record = {
        ...(existing || { schemaVersion: 1, sessionId, holder, createdAt: new Date(clock.now()).toISOString() }),
        holder,
        status: "beendet",
        beendetAm: new Date(clock.now()).toISOString()
      };
      await write(record);
      return { ok: true, grund: "beendet" };
    }
  };
}
