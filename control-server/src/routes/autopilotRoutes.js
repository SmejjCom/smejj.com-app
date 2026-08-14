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
import { timingSafeEqual } from "node:crypto";

import { json, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { heartbeatAnnehmen, persistiereHerzschlag } from "../admin/opsAutopiloten.js";
import { erfasseBewertung } from "../evolution/aiEvolutionEngine.js";

const PFAD = "/api/autopilot/heartbeat";
// Zweiter Eingang derselben Art (2026-08-14): Die Brücke ist ein eigener
// Dienst und misst ihre Chat-Antworten und Bilder SELBST. Hierher meldet sie
// nur das Urteil — Note, Fehlerklassen, kurze Belege. Der Antworttext des
// Nutzers verlässt die Brücke nicht.
const PFAD_AKTION = "/api/evolution/aktion";
// 7 Autopiloten, keiner schlaegt oefter als stuendlich — 30 pro Minute je
// Absender ist grosszuegig fuer Nachzuegler und eng genug gegen Unfug.
const gate = createRateLimiter({ capacity: 30, refillPerSec: 0.5, maxKeys: 1_000 });

/**
 * Der Melde-Schluessel der Evolution-Schicht. Fail-closed: ohne gesetzten
 * Schluessel nimmt der Eingang GAR NICHTS an (503). Ein offener Melde-Eingang
 * waere eine Einladung, die Qualitaetszahlen von aussen zu faerben.
 */
export function pruefeEvolutionToken(req, env = process.env) {
  const erwartet = String(env.SMEJJ_EVOLUTION_TOKEN || "").trim();
  if (erwartet.length < 16) return { ok: false, status: 503, error: "evolution_token_not_configured" };
  const gegeben = String(req?.headers?.["x-smejj-evolution-token"] || "").trim();
  const a = Buffer.from(gegeben);
  const b = Buffer.from(erwartet);
  const gleich = a.length === b.length && timingSafeEqual(a, b);
  return gleich ? { ok: true } : { ok: false, status: 401, error: "evolution_token_invalid" };
}

/** Nimmt EIN fertiges Urteil entgegen und verbucht es in der Evolution-Schicht. */
export async function handleEvolutionAktion(req, res, { env = process.env } = {}) {
  const tor = pruefeEvolutionToken(req, env);
  if (!tor.ok) { json(res, tor.status, { ok: false, error: tor.error }); return true; }

  let body;
  try {
    body = await readJson(req);
  } catch {
    json(res, 400, { ok: false, error: "evolution_body_invalid" });
    return true;
  }

  const art = String(body?.art || "").slice(0, 30);
  if (!art) { json(res, 400, { ok: false, error: "evolution_art_fehlt" }); return true; }

  // Die Funde werden hier BESCHNITTEN, nicht blind uebernommen: ein Melder
  // koennte sonst beliebig lange Texte in die Aufgabenliste schreiben.
  const funde = (Array.isArray(body?.funde) ? body.funde : []).slice(0, 10).map((f) => ({
    klasse: String(f?.klasse || "unbekannt").slice(0, 40),
    beleg: String(f?.beleg || "").slice(0, 160)
  }));
  const punkte = Number(body?.punkte);

  const ergebnis = erfasseBewertung(
    { art, gemessen: body?.gemessen !== false, punkte: Number.isFinite(punkte) ? punkte : null, funde },
    { dauerMs: Number(body?.dauerMs) || 0, quelle: String(body?.quelle || "bruecke").slice(0, 60), betrifft: String(body?.betrifft || art).slice(0, 60) }
  );
  // 202 statt 200: angenommen und verbucht — der Melder wartet auf nichts.
  json(res, 202, { ok: true, aufgaben: ergebnis.aufgaben.length, unterdrueckt: ergebnis.unterdrueckt });
  return true;
}

export async function handleAutopilotHeartbeat(req, url, res, { env = process.env } = {}) {
  if (url.pathname === PFAD_AKTION) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "evolution_method_not_allowed", hinweis: "Meldungen kommen per POST." });
      return true;
    }
    const absender = String(req.socket?.remoteAddress || "unbekannt");
    const limit = gate.take(absender, 1);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      json(res, 429, { ok: false, error: "evolution_rate_limit", retryAfterSec: limit.retryAfterSec });
      return true;
    }
    return handleEvolutionAktion(req, res, { env });
  }
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
    // Nachlieferung aus der Warteschlange: Original-Zeitpunkt des Laufs.
    // Validierung (Fenster, Format) liegt in heartbeatAnnehmen, nicht hier.
    am: body?.am,
    env
  });
  if (!antwort.ok) {
    json(res, antwort.status, { ok: false, error: antwort.error });
    return true;
  }
  json(res, 200, { ok: true, id: antwort.id, gespeichertAm: antwort.gespeichert.am });
  // Stufe 3: dauerhaft ablegen — NACH der Antwort und ohne sie aufzuhalten.
  // Ein Ablage-Fehler kostet Neustart-Festigkeit, nie die Quittung.
  persistiereHerzschlag(antwort.id, { env }).catch(() => {});
  return true;
}
