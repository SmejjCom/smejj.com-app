import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { CONTENT_TYPES, ROUTES, SECURITY_HEADERS } from "../shared/platform.js";
import { json } from "../../control-server/src/http/respond.js";

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
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType });
    createReadStream(safePath).pipe(res);
  }

  return {
    isPublicAsset(pathname) {
      if (pathname.startsWith("/icons/")) return true;
      return [ROUTES.favicon, ROUTES.appleTouchIcon, ROUTES.socialImage, ROUTES.manifest, ROUTES.serviceWorker, ROUTES.robots, ROUTES.llms, ROUTES.sitemap, ROUTES.status, ROUTES.hilfe, ROUTES.impressum, ROUTES.datenschutz, ROUTES.legalNoticeEn, ROUTES.privacyEn].includes(pathname);
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
