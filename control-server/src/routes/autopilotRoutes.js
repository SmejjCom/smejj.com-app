// smejj.com — Herzschlag-Empfang der Autopiloten (Totmannschalter-Eingang).
//
// Absichtlich OHNE Nutzersitzung: die Absender sind Maschinen (cron auf dem
// Mac, Cloud-Routine, Zeabur-Dienst), keine Menschen mit Browser. Die
// Berechtigung ist der Schluessel je Autopilot (SMEJJ_AUTOPILOT_KEYS) — und
// der kann im schlimmsten Fall nur eines: falsche Herzschlaege senden. Steuern
// laesst sich damit nichts, lesen auch nichts.
//
// Die Pruefung der Schluessel lebt in opsAutopiloten.js, nicht hier: die Route
// kennt nur HTTP. So bleibt die Logik ohne Server testbar (Merkregel aus dem
// Maus-Engine-Umbau: Engine-Logik immer ohne Browser testbar bauen).
import { json, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { heartbeatAnnehmen } from "../admin/opsAutopiloten.js";

const PFAD = "/api/autopilot/heartbeat";
// 7 Autopiloten, keiner schlaegt oefter als stuendlich — 30 pro Minute je
// Absender ist grosszuegig fuer Nachzuegler und eng genug gegen Unfug.
const gate = createRateLimiter({ capacity: 30, refillPerSec: 0.5, maxKeys: 1_000 });

export async function handleAutopilotHeartbeat(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PFAD) return false;

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "autopilot_method_not_allowed", hinweis: "Herzschlaege kommen per POST." });
    return true;
  }

  const absender = String(req.socket?.remoteAddress || "unbekannt");
  const limit = gate.take(absender, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    json(res, 429, { ok: false, error: "autopilot_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    json(res, 400, { ok: false, error: "autopilot_body_invalid" });
    return true;
  }

  const antwort = heartbeatAnnehmen({
    id: body?.id,
    key: body?.key,
    status: body?.status,
    meldung: body?.meldung,
    dauerMs: body?.dauerMs,
    env
  });
  if (!antwort.ok) {
    json(res, antwort.status, { ok: false, error: antwort.error });
    return true;
  }
  json(res, 200, { ok: true, id: antwort.id, gespeichertAm: antwort.gespeichert.am });
  return true;
}
