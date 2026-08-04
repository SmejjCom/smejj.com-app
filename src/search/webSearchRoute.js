// smejj.com — HTTP-Seite der Live-Internet-Suche.
//
// Ausgelagert aus src/server.js am 2026-08-04: die Datei stand exakt auf der
// 800-Zeilen-Grenze (AI_Guidelines.md). Es ist ohnehin eine eigene Aufgabe —
// `webSearch.js` sucht, dieses Modul beantwortet damit HTTP-Anfragen und baut
// den Prompt-Block fuer den Agenten. Verhalten unveraendert uebernommen.
//
// Free-only und fail-closed: Fehler ergeben eine leere Ergebnisliste, niemals
// Kosten und niemals einen Abbruch.

import { json } from "../../control-server/src/http/respond.js";
import { createRateLimiter } from "../shared/rateLimiter.js";
import {
  buildSearchQuery,
  buildWebContextBlock,
  detectSearchRegion,
  normalizeRegion,
  searchWebDetailed
} from "./webSearch.js";

/** Rate-Limit fuer die offene Websuche: 20 Anfragen / 60 s pro IP (free-safe, in-memory). */
const webSearchRateLimiter = createRateLimiter({ windowMs: 60000, max: 20 });

function clientIpFrom(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

/**
 * GET /api/search/web?q=...&region=us&raw=1
 *
 * Zwei optionale Parameter seit 2026-08-04: `region` waehlt den Markt
 * ausdruecklich, `raw=1` schaltet die Stichwort-Kuerzung ab. Ohne beides
 * verhaelt sich der Endpunkt wie bisher — nur mit erkanntem statt fest
 * verdrahtetem Markt.
 */
export async function handleWebSearch(req, url, res) {
  const gate = webSearchRateLimiter.check(clientIpFrom(req));
  if (!gate.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
    res.setHeader("Access-Control-Expose-Headers", "Retry-After");
    return json(res, 429, { error: "Zu viele Suchanfragen. Bitte kurz warten." });
  }
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return json(res, 400, { error: "Missing q" });
  const region = normalizeRegion(url.searchParams.get("region") || "");
  const raw = url.searchParams.get("raw") === "1";
  const suchbegriff = raw ? query : buildSearchQuery(query);
  const befund = await searchWebDetailed(suchbegriff, { limit: 8, region: region || detectSearchRegion(query) });
  return json(res, 200, {
    ok: true,
    query,
    searchQuery: suchbegriff,
    region: befund.region,
    // Ohne diese drei Felder ist eine gesperrte Suchmaschine von einer Frage
    // ohne Treffer nicht zu unterscheiden — beides sah bisher gleich aus.
    source: befund.source,
    cached: befund.cached,
    attempts: befund.attempts,
    count: befund.results.length,
    results: befund.results
  });
}

/**
 * Baut den Live-Internet-Block fuer den Agenten-Prompt.
 *
 * Befund 2026-08-04: Hier ging der ROHE Fragesatz als Suchbegriff hinaus. Live
 * nachgemessen liefert "ich suche eine buroe: ... Kannst du mir finden" null
 * Treffer — die Suche war nicht gescheitert, sie war nie gestellt worden.
 * Jetzt: Stichworte statt Satz, und der Markt aus dem Ortsbezug der Frage.
 *
 * Ohne Seiten-Exzerpte (`withPages: 0`), denn die kosteten bis zu 2x6 s;
 * Titel und Kurztexte reichen dem Modell fuer die Antwort.
 *
 * @param {string} task Rohe Nutzerfrage.
 * @returns {Promise<string>} Prompt-Block oder "" (dann laeuft alles ohne Web-Kontext weiter).
 */
export function buildAgentWebContext(task) {
  return buildWebContextBlock(buildSearchQuery(task), {
    maxResults: 5,
    withPages: 0,
    region: detectSearchRegion(task)
  });
}
