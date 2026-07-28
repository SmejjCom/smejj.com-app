// smejj.com — ein Einstiegspunkt fuer alles, was zum Adminbereich gehoert.
//
// Warum gebuendelt: src/server.js stiess an die 800-Zeilen-Regel. Statt dort
// fuenf Bloecke zu pflegen, steht die Reihenfolge jetzt an genau einer Stelle —
// und sie ist bedeutungstragend:
//
//   1. /api/compliance   — oeffentlich, ohne Anmeldung (Transparenzpflicht).
//   2. /api/account/...  — die betroffene Person handelt in ihrem eigenen Konto.
//   3. /admin            — die Oberflaeche, mit eigener lesbarer Fehlerseite.
//   4. /api/admin (POST) — schreibende Kontoaktionen (Stufe 3).
//   5. /api/admin/{moderation,gdpr,announcements,flags} — Stufe 4.
//   6. /api/admin (GET)  — lesende Aktionen (Stufe 2).
//
// Schreibend vor lesend ist Absicht: was die Schreibrouten nicht beanspruchen,
// faellt durch. Andersherum wuerde eine Leseroute eine Schreibanfrage schlucken.
import { handleComplianceRoute } from "./complianceRoutes.js";
import { handleAccountImpersonationRoute } from "./accountImpersonationRoutes.js";
import { handleAdminUiRoute } from "./adminUiRoutes.js";
import { handleAdminWriteRoute } from "./adminWriteRoutes.js";
import { handleAdminStage4Route } from "./adminStage4Routes.js";
import { handleAdminRoute } from "./adminRoutes.js";

/**
 * @param {object} ctx.readSession        Sitzung aus dem Request lesen (Bearer oder Cookie).
 * @param {Function} ctx.sessionStillValid Prueft, ob die Sitzung nicht widerrufen wurde.
 * @returns {Promise<boolean>} true, wenn die Anfrage hier beantwortet wurde.
 */
export async function handleAdminSurface(req, url, res, { readSession, sessionStillValid, env = process.env } = {}) {
  const pfad = url.pathname;

  if (pfad === "/api/compliance" || pfad.startsWith("/api/compliance/")) {
    if (handleComplianceRoute(req, url, res)) return true;
  }

  if (pfad.startsWith("/api/account/")) {
    if (await handleAccountImpersonationRoute(req, url, res, { env })) return true;
  }

  if (pfad === "/admin" || pfad.startsWith("/admin/")) {
    // Die Oberflaeche loest ihre Sitzung selbst auf, damit ein Mensch am
    // Browser eine lesbare Seite bekommt statt einer JSON-Fehlerzeile. Der
    // Widerruf wird trotzdem geprueft — eine beendete Sitzung oeffnet nichts.
    const nutzer = typeof readSession === "function" ? readSession(req) : null;
    if (nutzer && (!sessionStillValid || await sessionStillValid(nutzer, env))) req.authUser = nutzer;
    if (await handleAdminUiRoute(req, url, res, { env })) return true;
  }

  if (pfad === "/api/admin" || pfad.startsWith("/api/admin/")) {
    if (await handleAdminWriteRoute(req, url, res, { env })) return true;
    if (await handleAdminStage4Route(req, url, res, { env })) return true;
    if (await handleAdminRoute(req, url, res, { env })) return true;
  }

  return false;
}
