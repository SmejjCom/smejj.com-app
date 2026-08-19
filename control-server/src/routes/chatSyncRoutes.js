// smejj.com — Routen fuer den Verlauf-Sync (Stufe 3).
//
//   GET    /api/chats             → alle Chats des Kontos, MIT Nachrichten
//   GET    /api/chats?nurListe=1  → dieselbe Liste OHNE Nachrichten (klein)
//   GET    /api/chats?id=<id>     → genau ein Chat, vollstaendig
//   PUT    /api/chats           → einen Chat ablegen (juengerer Stand gewinnt)
//   DELETE /api/chats?id=<id>   → einen Chat serverseitig loeschen
//
// Alle drei verlangen eine gueltige Sitzung. Die Kontokennung stammt
// ausschliesslich aus dieser Sitzung — nie aus dem Rumpf der Anfrage.
import {
  chatKennungGueltig,
  kontoKennung,
  ladeChat,
  ladeChats,
  loescheChat,
  pruefeChat,
  speichereChat,
  syncAktiv
} from "../chats/chatSyncStore.js";

export function createChatSyncRoutes({ env = process.env, readSession, json, readJson, fetchImpl = fetch }) {
  async function handle(req, res, url) {
    if (url.pathname !== "/api/chats") return false;

    // Abgeschaltet = ehrlich abgeschaltet: 503 mit klarem Grund, kein stiller
    // Leerlauf, an dem der Client ewig weiterprobiert.
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

    if (req.method === "GET") {
      // Ein einzelner Chat, vollstaendig — der Weg, auf dem der Abgleich die
      // Nachrichten nachholt, NACHDEM er anhand der kleinen Liste entschieden
      // hat, dass dieser eine wirklich neuer ist.
      const einzelId = url.searchParams.get("id") || "";
      if (einzelId) {
        if (!chatKennungGueltig(einzelId)) {
          json(res, 400, { ok: false, error: "chat_id_ungueltig" });
          return true;
        }
        const einzeln = await ladeChat({ kontoId, chatId: einzelId, env, fetchImpl });
        json(res, einzeln.ok ? 200 : 503, einzeln);
        return true;
      }
      // GEMESSEN 2026-08-19: die volle Liste war 2,50 MB bei 88 Chats und ging
      // bei JEDEM Seitenaufruf ueber die Leitung. `nurListe=1` laesst die
      // Nachrichten weg. Opt-in, damit ein alter Client im Browser-Cache
      // weiterhin bekommt, womit er rechnet — sonst importierte er leere Chats
      // ueber seinen eigenen Verlauf.
      const nurListe = url.searchParams.get("nurListe") === "1";
      const ergebnis = await ladeChats({ kontoId, env, fetchImpl, nurListe });
      json(res, ergebnis.ok ? 200 : 503, ergebnis);
      return true;
    }

    if (req.method === "PUT") {
      const rumpf = await readJson(req);
      const geprueft = pruefeChat(rumpf?.chat);
      if (!geprueft.ok) {
        json(res, 400, { ok: false, error: geprueft.error });
        return true;
      }
      try {
        const ergebnis = await speichereChat({ kontoId, chat: geprueft.chat, env, fetchImpl });
        json(res, ergebnis.ok ? 200 : 503, ergebnis);
      } catch (error) {
        json(res, 503, { ok: false, error: String(error?.message || "schreiben_fehlgeschlagen").slice(0, 160) });
      }
      return true;
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!chatKennungGueltig(id)) {
        json(res, 400, { ok: false, error: "chat_id_ungueltig" });
        return true;
      }
      try {
        const ergebnis = await loescheChat({ kontoId, chatId: id, env, fetchImpl });
        json(res, ergebnis.ok ? 200 : 503, ergebnis);
      } catch (error) {
        json(res, 503, { ok: false, error: String(error?.message || "loeschen_fehlgeschlagen").slice(0, 160) });
      }
      return true;
    }

    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }

  return { handle };
}
