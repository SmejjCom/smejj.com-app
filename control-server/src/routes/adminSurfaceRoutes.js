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
//   6. /api/admin/ops/... — Betriebszustand, rein lesend (Stufe 5).
//   7. /api/admin/sicherheit/... — Schluessel, Ereignisse, Admins (Stufe 6).
//   8. /api/admin/geld/... — Abos und Budgets, rein lesend (Stufe 7).
//   9. /api/admin (GET)  — lesende Aktionen (Stufe 2).
//
// Schreibend vor lesend ist Absicht: was die Schreibrouten nicht beanspruchen,
// faellt durch. Andersherum wuerde eine Leseroute eine Schreibanfrage schlucken.
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";
import { ARTEN, meldeEreignis } from "../admin/sicherheitsAlarm.js";
import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { privateJson } from "../http/respond.js";
import { handleComplianceRoute } from "./complianceRoutes.js";
import { handleAccountImpersonationRoute } from "./accountImpersonationRoutes.js";
import { handleAdminUiRoute } from "./adminUiRoutes.js";
import { handleAdminWriteRoute } from "./adminWriteRoutes.js";
import { handleAdminStage4Route } from "./adminStage4Routes.js";
import { handleAdminOpsRoute } from "./adminOpsRoutes.js";
import { handleAdminSicherheitRoute } from "./adminSicherheitRoutes.js";
import { handleAdminGeldRoute } from "./adminGeldRoutes.js";
import { handleAdminRoute } from "./adminRoutes.js";

/**
 * @param {object} ctx.readSession        Sitzung aus dem Request lesen (Bearer oder Cookie).
 * @param {Function} ctx.sessionStillValid Prueft, ob die Sitzung nicht widerrufen wurde.
 * @returns {Promise<boolean>} true, wenn die Anfrage hier beantwortet wurde.
 */
// Vortuer fuer /admin und /api/admin: EIN Budget pro Client-IP, geprueft bevor
// irgendeine Sitzung aufgeloest oder eine Datei angefasst wird. Die bestehenden
// Gates in den Einzelrouten zaehlen pro Admin-Konto und greifen erst NACH der
// Anmeldung — ein unangemeldeter Scanner lief bisher ungebremst gegen die Tuer.
// Grosszuegig bemessen (Konsole laedt beim Start einen Schwung Dateien und
// API-Antworten), aber hart genug, dass Abklopfen auf ~1,5 Anfragen/s faellt.
// /api/compliance (Transparenzpflicht) und /api/account/* (die betroffene
// Person selbst) bleiben bewusst davor.
const vortuerGate = createRateLimiter({ capacity: 90, refillPerSec: 1.5, maxKeys: 20_000 });

function vortuerAbweisen(res, pfad, retryAfterSec) {
  if (pfad.startsWith("/api/")) {
    res.setHeader("Retry-After", String(retryAfterSec));
    return privateJson(res, 429, { ok: false, error: "admin_vortuer_rate_limit", retryAfterSec });
  }
  res.writeHead(429, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Retry-After": String(retryAfterSec)
  });
  res.end("<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"><title>Zu viele Anfragen</title>" +
    `<body style="font-family:system-ui;margin:4rem auto;max-width:32rem"><h1>Zu viele Anfragen</h1>` +
    `<p>Bitte in ${retryAfterSec} Sekunden erneut versuchen.</p></body></html>`);
}

export async function handleAdminSurface(req, url, res, { readSession, sessionStillValid, env = process.env } = {}) {
  const pfad = url.pathname;

  if (pfad === "/admin" || pfad.startsWith("/admin/") || pfad === "/api/admin" || pfad.startsWith("/api/admin/")) {
    const kennung = clientKeyFromRequest(req);
    const limit = vortuerGate.take(kennung, 1);
    if (!limit.allowed) {
      // Antwort zuerst, Alarm danach: der Abweisende wartet nicht auf die
      // Sicherheitswache. Fehler im Alarm duerfen die Abwehr nie aufhalten.
      vortuerAbweisen(res, pfad, limit.retryAfterSec);
      meldeEreignis(ARTEN.vortuer, { kennung, pfad }, { env }).catch(() => {});
      return true;
    }
  }

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
    if (await handleAdminOpsRoute(req, url, res, { env })) return true;
    if (await handleAdminSicherheitRoute(req, url, res, { env })) return true;
    if (await handleAdminGeldRoute(req, url, res, { env })) return true;
    if (await handleAdminRoute(req, url, res, { env })) return true;
  }

  return false;
}
