// smejj.com — Annahme-Route des Fehler-Fängers (Autopilot Nr. 50).
//
// POST /api/fehler nimmt JavaScript-Fehler aus dem Browser angemeldeter
// Nutzer entgegen. Die Route kennt nur HTTP; Ringpuffer, PII-Maskierung und
// Gruppierung wohnen im Autopiloten (fehlerFaengerAutopilot.js) — dieselbe
// Trennung wie beim Herzschlag-Eingang.
//
// SITZUNGSPFLICHT MIT ABSICHT: /api/fehler steht NICHT in der
// Erlaubnisliste (controlAccessPolicy.js) — nur angemeldete Browser melden.
// Ein offener Fehler-Eingang wäre ein Einfallstor für Müll und gezieltes
// Fluten; der Preis ist, dass die Anmeldeseite selbst nicht melden kann.
// Bewusste Entscheidung, hier dokumentiert.
import { json, readJson } from "../http/respond.js";
import { createRateLimiter, clientKeyFromRequest } from "../http/rateLimiter.js";
import { nimmFehlerAn, markiereClientVerdrahtet } from "../autopilots/fehlerFaengerAutopilot.js";

export const FEHLER_PFAD = "/api/fehler";

// Ein kaputter Browser in einer Schleife kann hunderte Meldungen je Minute
// senden — 10 pro Minute je Absender reichen für jede ehrliche Fehlerlage.
const bremse = createRateLimiter({ capacity: 10, refillPerSec: 0.17, maxKeys: 5_000 });

/** @returns {Promise<boolean>} true = Anfrage wurde hier beantwortet. */
export async function handleFehlerRoute(req, res, url) {
  if (url.pathname !== FEHLER_PFAD || req.method !== "POST") return false;
  if (!bremse.take(clientKeyFromRequest(req)).allowed) {
    json(res, 429, { ok: false, error: "zu_viele_meldungen" });
    return true;
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    json(res, 400, { ok: false, error: "fehler_body_invalid" });
    return true;
  }
  if (String(body?.art || "") === "start") {
    // Der Client-Haken meldet sich beim Seitenstart einmal an — so kann die
    // Ampel "keine Fehler" von "niemand kann melden" unterscheiden.
    markiereClientVerdrahtet();
    json(res, 200, { ok: true });
    return true;
  }
  const ergebnis = nimmFehlerAn({
    nachricht: body?.nachricht,
    quelle: body?.quelle,
    zeile: body?.zeile,
    stapel: body?.stapel,
    seite: body?.seite,
    agent: String(req.headers["user-agent"] || "")
  });
  json(res, ergebnis.ok ? 200 : 400, ergebnis);
  return true;
}
