// smejj.com — Routen fuer die Medien-Ablage des Chat-Verlaufs.
//
//   POST /api/chat-medien            → data:-URL ablegen, gibt eine Kennung
//   GET  /api/chat-medien?id=<id>    → das eigene Medium zurueckliefern
//
// Warum es sie gibt: siehe Kopf von chats/medienStore.js — Bilder und Videos
// haben bisher kein Neuladen ueberlebt. Ab jetzt liegt das Medium neben dem
// Chat statt in ihm; im Verlauf steht nur noch die kurze Adresse.
//
// Beide Wege verlangen eine gueltige Sitzung, und die Kontokennung kommt
// ausschliesslich aus dieser Sitzung: ein Aufrufer kann damit nur seine
// EIGENEN Medien lesen, auch wenn er eine fremde Kennung erraet.
import { kontoKennung, ladeMedium, speichereMedium, syncAktiv } from "../chats/medienStore.js";
import { createRateLimiter } from "../http/rateLimiter.js";

// Ein Medium je Antwort, ein paar Antworten je Minute — 120/Stunde ist reichlich
// und deckelt zugleich, was ein einzelnes Konto in den Eimer schieben kann.
const schreibGrenze = createRateLimiter({ capacity: 120, refillPerSec: 120 / 3600, maxKeys: 5_000 });

export function createChatMedienRoutes({ env = process.env, readSession, json, readJson, fetchImpl = fetch }) {
  async function handle(req, res, url) {
    if (url.pathname !== "/api/chat-medien") return false;

    if (!syncAktiv(env)) {
      json(res, 503, { ok: false, error: "chat_sync_deaktiviert" });
      return true;
    }

    const sitzung = readSession(req);
    const kontoId = kontoKennung(sitzung);
    if (!sitzung || !kontoId) {
      json(res, 401, { ok: false, error: "authentication_required" });
      return true;
    }

    if (req.method === "POST") {
      const limit = schreibGrenze.take(kontoId, 1);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSec));
        json(res, 429, { ok: false, error: "medien_rate_limit", retryAfterSec: limit.retryAfterSec });
        return true;
      }
      const rumpf = await readJson(req).catch(() => ({}));
      const ergebnis = await speichereMedium({ dataUrl: rumpf?.dataUrl, kontoId, env, fetchImpl });
      if (!ergebnis.ok) {
        // 400 fuer alles, was am Inhalt liegt (Typ, Groesse, kaputtes base64) —
        // 503 nur, wenn die Ablage selbst nicht mitspielt. Der Client kann so
        // unterscheiden zwischen "nimm ein anderes Medium" und "spaeter nochmal".
        const inhaltsfehler = ["kein_data_url", "typ_nicht_erlaubt", "base64_kaputt", "leer", "zu_gross"];
        json(res, inhaltsfehler.includes(ergebnis.error) ? 400 : 503, ergebnis);
        return true;
      }
      json(res, 200, ergebnis);
      return true;
    }

    if (req.method === "GET") {
      const ergebnis = await ladeMedium({ id: url.searchParams.get("id"), kontoId, env, fetchImpl });
      if (!ergebnis.ok) {
        json(res, ergebnis.error === "nicht_gefunden" || ergebnis.error === "kennung_ungueltig" ? 404 : 503, ergebnis);
        return true;
      }
      // Die Kennung IST der Inhalts-Hash — derselbe Schluessel liefert also nie
      // etwas anderes. Deshalb darf der Browser das Medium dauerhaft behalten;
      // das spart bei jedem Oeffnen des Verlaufs eine Uebertragung.
      res.writeHead(200, {
        "Content-Type": ergebnis.mime,
        "Content-Length": ergebnis.daten.length,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      });
      res.end(ergebnis.daten);
      return true;
    }

    json(res, 405, { ok: false, error: "methode_nicht_erlaubt" });
    return true;
  }

  return { handle };
}
