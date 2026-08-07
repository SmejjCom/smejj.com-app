// smejj.com — Auslieferung der Admin-Oberflaeche unter /admin.
//
// Warum vom Control-Server und nicht von smejj.com:
//   - Kein DNS-Eintrag und kein Frontend-Deploy noetig.
//   - Kein Service-Worker, kein Precache, kein Cache-Bump.
//   - Kein Risiko fuer den Start-Lock: keine einzige Datei unter public/.
//   - Die Konsole ist eine Betreiber-Oberflaeche fuer eine Handvoll Menschen,
//     kein oeffentlicher Seitenaufruf. Static-First bleibt unberuehrt: faellt
//     der Control-Server aus, ist auch die Admin-API weg — die Konsole waere
//     ohnehin nutzlos.
//
// Gleiche Herkunft wie die API: das Sitzungs-Cookie gilt, ohne dass ein Token
// durch localStorage gereicht werden muesste.
//
// Fail-closed: ohne Adminrolle kommt keine Datei heraus, auch nicht das leere
// Geruest. Statt einer JSON-Fehlermeldung gibt es eine lesbare Seite — ein
// Mensch am Browser soll erfahren, warum, nicht raten muessen.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_TYPES, SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { resolveAdminActor } from "../admin/adminAuth.js";

const PREFIX = "/admin";
const UI_DIR = path.resolve(fileURLToPath(new URL("../../admin-ui/", import.meta.url)));

// Feste Liste statt Pfadaufloesung: was nicht hier steht, wird nicht
// ausgeliefert. Damit ist ein Ausbruch aus dem Verzeichnis nicht nur
// unwahrscheinlich, sondern unmoeglich.
const DATEIEN = Object.freeze({
  "": "index.html",
  "index.html": "index.html",
  "console.css": "console.css",
  "api.js": "api.js",
  "dialog.js": "dialog.js",
  "views.js": "views.js",
  "views-stage4.js": "views-stage4.js",
  "console-stage4.js": "console-stage4.js",
  "views-stage5.js": "views-stage5.js",
  "console-stage5.js": "console-stage5.js",
  "views-stage6.js": "views-stage6.js",
  "console-stage6.js": "console-stage6.js",
  "views-stage7.js": "views-stage7.js",
  "console-stage7.js": "console-stage7.js",
  "views-stage8.js": "views-stage8.js",
  "console-stage8.js": "console-stage8.js",
  "console.js": "console.js"
});

export async function handleAdminUiRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    antwortSeite(res, 405, "Nicht erlaubt", "Die Konsole liefert nur Seiten aus.");
    return true;
  }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  const datei = DATEIEN[rest];
  if (!datei) {
    antwortSeite(res, 404, "Nicht gefunden", "Diese Seite gehoert nicht zur Konsole.");
    return true;
  }

  // Das Stylesheet bleibt ungeschuetzt: es enthaelt keine Daten, wird aber von
  // der Fehlerseite gebraucht. Waere es gesperrt, bekaeme ein Abgewiesener eine
  // unformatierte Seite — die Erklaerung soll aber lesbar sein.
  if (datei !== "console.css") {
    // Hier werden DATEIEN ausgeliefert, keine Kontodaten. Eine noch nicht
    // bestaetigte Adresse darf die Konsole deshalb laden — jede Datenroute
    // dahinter weist sie weiterhin ab, und erst in der geladenen Konsole kann
    // sie sich ueberhaupt bestaetigen.
    const resolved = await resolveAdminActor(req.authUser, { env, erlaubeUnbestaetigt: true });
    if (!resolved.ok) {
      antwortSeite(res, resolved.status, ueberschriftFuer(resolved.error), erklaerungFuer(resolved.error));
      return true;
    }
  }

  const pfad = path.join(UI_DIR, datei);
  let inhalt;
  try {
    inhalt = fs.readFileSync(pfad);
  } catch {
    antwortSeite(res, 503, "Konsole unvollstaendig", `Die Datei ${datei} fehlt im Release-Artefakt.`);
    return true;
  }

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": CONTENT_TYPES[path.extname(datei)] || "application/octet-stream",
    // Betreiberdaten gehoeren in keinen Zwischenspeicher.
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });
  res.end(req.method === "HEAD" ? undefined : inhalt);
  return true;
}

function ueberschriftFuer(error) {
  if (error === "admin_authentication_required") return "Nicht angemeldet";
  if (error === "admin_role_required") return "Keine Berechtigung";
  if (error === "admin_account_not_active") return "Konto gesperrt";
  if (error === "admin_directory_unavailable") return "Verzeichnis nicht erreichbar";
  return "Kein Zugang";
}

function erklaerungFuer(error) {
  if (error === "admin_authentication_required") {
    return "Bitte zuerst auf smejj.com anmelden. Die Konsole nutzt dieselbe Sitzung.";
  }
  if (error === "admin_role_required") {
    return "Dieses Konto hat keine Verwaltungsrolle. Rollen werden in der Konsole vergeben; "
      + "der erste Zugang laeuft ueber SMEJJ_ADMIN_OWNER_EMAILS.";
  }
  if (error === "admin_account_not_active") {
    return "Das Konto ist gesperrt oder geloescht. Ein aktives Konto ist Voraussetzung.";
  }
  if (error === "admin_directory_unavailable") {
    return "Das Nutzerverzeichnis ist gerade nicht erreichbar. Aus Sicherheitsgruenden "
      + "wird der Zugang dann verweigert statt geraten.";
  }
  return "Kein Zugang zur Konsole.";
}

/** Lesbare Fehlerseite ohne Inline-Stil (die eigene CSP verbietet ihn). */
function antwortSeite(res, status, ueberschrift, text) {
  const seite = `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${escapeHtml(ueberschrift)} — smejj.com Operations Console</title>`
    + `<link rel="stylesheet" href="/admin/console.css"></head>`
    + `<body class="hinweisseite"><main class="hinweis glass">`
    + `<p class="hinweis-marke">smejj.com Operations Console</p>`
    + `<h1>${escapeHtml(ueberschrift)}</h1><p>${escapeHtml(text)}</p>`
    + `<p class="hinweis-code">HTTP ${status}</p>`
    + `</main></body></html>`;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });
  res.end(seite);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
