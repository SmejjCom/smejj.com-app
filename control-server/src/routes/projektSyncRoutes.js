// smejj.com — Routen fuer den Projekte-Sync (2026-08-13).
//
//   GET    /api/projekte           → alle Projekte des angemeldeten Kontos
//   PUT    /api/projekte           → ein Projekt ablegen (juengerer Stand gewinnt)
//   DELETE /api/projekte?id=<id>   → ein Projekt serverseitig loeschen (Grabstein)
//
// Woertlicher Spiegel von chatSyncRoutes.js: gleiches Flag (Projekte sind Teil
// des Verlauf-Syncs, kein eigener Ops-Schalter), Sitzung ist Pflicht, die
// Kontokennung stammt ausschliesslich aus der Sitzung — nie aus dem Rumpf.
import { chatKennungGueltig, kontoKennung, syncAktiv } from "../chats/chatSyncStore.js";
import { ladeProjekte, loescheProjekt, pruefeProjekt, speichereProjekt } from "../chats/projektSyncStore.js";

export function createProjektSyncRoutes({ env = process.env, readSession, json, readJson, fetchImpl = fetch }) {
  async function handle(req, res, url) {
    if (url.pathname !== "/api/projekte") return false;

    // Abgeschaltet = ehrlich abgeschaltet: 503 mit klarem Grund.
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
      const ergebnis = await ladeProjekte({ kontoId, env, fetchImpl });
      json(res, ergebnis.ok ? 200 : 503, ergebnis);
      return true;
    }

    if (req.method === "PUT") {
      const rumpf = await readJson(req);
      const geprueft = pruefeProjekt(rumpf?.projekt);
      if (!geprueft.ok) {
        json(res, 400, { ok: false, error: geprueft.error });
        return true;
      }
      try {
        const ergebnis = await speichereProjekt({ kontoId, projekt: geprueft.projekt, env, fetchImpl });
        json(res, ergebnis.ok ? 200 : 503, ergebnis);
      } catch (error) {
        json(res, 503, { ok: false, error: String(error?.message || "schreiben_fehlgeschlagen").slice(0, 160) });
      }
      return true;
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!chatKennungGueltig(id)) {
        json(res, 400, { ok: false, error: "projekt_id_ungueltig" });
        return true;
      }
      try {
        const ergebnis = await loescheProjekt({ kontoId, projektId: id, env, fetchImpl });
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
