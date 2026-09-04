// smejj.com — Annahme-Route des Besucher-Pulses (Autopilot Nr. 81).
//
// POST /api/puls nimmt EINE Strichliste je Browser-Sitzung entgegen: welche
// Seite, welche Sprache, von welchem Host verwiesen. Kein Cookie, keine
// Kennung, keine IP, kein Pfad mit Parametern — die Route wirft alles weg,
// was mehr wäre als eine Strichliste (siehe besucherPulsAutopilot.js).
//
// OFFEN MIT ABSICHT (anders als /api/fehler): Der Puls kommt von der
// Landeseite, also von Menschen, die per Definition noch KEIN Konto haben.
// Eine Sitzungspflicht würde genau die Zahl unmessbar machen, um die es geht.
// Der Preis ist Müll-Risiko; dagegen steht die Bremse unten und die Tatsache,
// dass hier nichts gespeichert wird, was ein Angreifer vergiften könnte:
// der Eingang erhöht nur Zahlen im Arbeitsspeicher.
import { json, readJson } from "../http/respond.js";
import { createRateLimiter, clientKeyFromRequest } from "../http/rateLimiter.js";
import { nimmPulsAn } from "../autopilots/besucherPulsAutopilot.js";

export const PULS_PFAD = "/api/puls";

// Ein Mensch öffnet die Landeseite ein paar Mal je Minute, nicht hundertmal.
// 5 je Minute und Absender reichen; darüber wird still verworfen (204), damit
// ein Fluter kein Fehlerbild und keine Antwortlast erzeugt.
const bremse = createRateLimiter({ capacity: 5, refillPerSec: 0.08, maxKeys: 20_000 });

/** @returns {Promise<boolean>} true = Anfrage wurde hier beantwortet. */
export async function handlePulsRoute(req, res, url) {
  if (url.pathname !== PULS_PFAD) return false;
  if (req.method !== "POST") { json(res, 405, { ok: false, error: "nur_post" }); return true; }
  if (!bremse.take(clientKeyFromRequest(req)).allowed) {
    // Absichtlich 204 statt 429: der Client soll nichts wiederholen und nichts
    // anzeigen — ein Zählwert weniger ist folgenlos.
    res.writeHead(204).end();
    return true;
  }
  let body = null;
  try { body = await readJson(req); } catch { body = null; }
  nimmPulsAn({
    seite: body?.seite,
    sprache: body?.sprache,
    // Der Verweis kommt aus dem Body (document.referrer), nicht aus dem
    // Referer-Kopf: der traegt bei uns die eigene Seite samt Pfad.
    verweis: body?.verweis
  });
  // Leere Antwort: der Puls ist eine Meldung, keine Frage.
  res.writeHead(204).end();
  return true;
}
