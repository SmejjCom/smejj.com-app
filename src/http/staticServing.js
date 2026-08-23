import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { CONTENT_TYPES, ROUTES, SECURITY_HEADERS } from "../shared/platform.js";
import { json } from "../../control-server/src/http/respond.js";

// Die Maus-Wiedergabe ist die EINZIGE Seite, die eingebettet werden soll: das
// rechte Panel der Startseite rahmt sie als iframe (public/maus-panel.js).
//
// Die allgemeinen Kopfzeilen verbieten das Einbetten vollstaendig
// ("frame-ancestors 'none'" plus "X-Frame-Options: DENY"), und das soll fuer
// jede andere Seite auch so bleiben — tests/security-abuse.test.mjs erzwingt
// es. Fuer diese eine Seite lautete die Folge aber: Chrome brach den iframe mit
// net::ERR_BLOCKED_BY_RESPONSE ab, das Panel blieb weiss (Befund 2026-08-17).
// Live faellt das nicht auf, weil GitHub Pages ueberhaupt keine Kopfzeilen
// setzt — wieder eine Abweichung, die eine lokale Messung luegen laesst.
//
// 'self' statt 'none' heisst NICHT "jeder darf": fremde Seiten bleiben
// ausgesperrt, nur die eigene Herkunft darf rahmen. Genau das tut die App.
export const EIGENE_EINBETTUNG_ERLAUBT = new Set([ROUTES.mausReplay]);

function kopfzeilenFuer(pathname) {
  if (!EIGENE_EINBETTUNG_ERLAUBT.has(pathname)) return SECURITY_HEADERS;
  return {
    ...SECURITY_HEADERS,
    "Content-Security-Policy": SECURITY_HEADERS["Content-Security-Policy"]
      .replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    "X-Frame-Options": "SAMEORIGIN"
  };
}

export function createStaticHandlers({ publicDir, storageSourceDir, aiSourceDir, sharedSourceDir }) {
  async function streamFromDir(res, baseDir, file, fallbackDir = null, defaultType = "application/octet-stream") {
    const safePath = path.resolve(baseDir, file);
    if (!safePath.startsWith(baseDir + path.sep) && safePath !== baseDir) return json(res, 403, { error: "Forbidden" });
    const exists = await stat(safePath).then((info) => info.isFile()).catch(() => false);
    if (!exists) {
      if (fallbackDir) return streamFromDir(res, fallbackDir, file, null, defaultType);
      return json(res, 404, { error: "Not found" });
    }
    const contentType = CONTENT_TYPES[path.extname(safePath)] || defaultType;
    res.writeHead(200, { ...kopfzeilenFuer(`/${file}`), "Content-Type": contentType });
    createReadStream(safePath).pipe(res);
  }

  return {
    isPublicAsset(pathname) {
      if (pathname.startsWith("/icons/")) return true;
      return [ROUTES.favicon, ROUTES.appleTouchIcon, ROUTES.socialImage, ROUTES.manifest, ROUTES.serviceWorker, ROUTES.robots, ROUTES.llms, ROUTES.sitemap, ROUTES.status, ROUTES.verlauf, ROUTES.verlaufMesswerte, ROUTES.hilfe, ROUTES.entwickler, ROUTES.mausReplay, ROUTES.indexHtml, ROUTES.willkommen, ROUTES.programmieren, ROUTES.agb, ROUTES.widerruf, ROUTES.impressum, ROUTES.datenschutz, ROUTES.legalNoticeEn, ROUTES.privacyEn].includes(pathname);
    },

    isAppRoute(pathname) {
      // QA-Welle 3, Befund W3-05: "/api/..." ist nie eine App-Route. Vorher
      // fing dieser SPA-Fallback auch unbekannte API-Pfade (kein Punkt im
      // Namen) und lieferte index.html mit HTTP 200 — ein Client, der nur den
      // Statuscode prueft, hielt jeden Tippfehler im Pfad fuer einen Erfolg.
      // Unbekannte API-Pfade fallen jetzt auf die 404-JSON-Antwort durch.
      if (pathname.startsWith("/api/")) return false;
      return !path.extname(pathname);
    },

    serveFile(res, file) {
      return streamFromDir(res, publicDir, file);
    },

    serveStorageModule(res, file) {
      return streamFromDir(res, storageSourceDir, file, path.join(publicDir, "storage"), "application/javascript; charset=utf-8");
    },

    serveAiModule(res, file) {
      return streamFromDir(res, aiSourceDir, file, path.join(publicDir, "ai"), "application/javascript; charset=utf-8");
    },

    serveSharedModule(res, file) {
      return streamFromDir(res, sharedSourceDir, file, path.join(publicDir, "shared"), "application/javascript; charset=utf-8");
    }
  };
}
