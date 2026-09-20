// smejj.com control-server — die Proxy-Seite des eingebauten Browsers als EIGENES Dokument.
//
// BEFUND 2026-09-20 (Live-Test in Chrome, smejj.com v907): Jede Seite im Proxy-Modus sah aus
// wie 1995 — github.com als nackte Linkliste (38 Stylesheets ohne Wirkung), die Suchtreffer
// von DuckDuckGo in Times New Roman mit kaputten Bildsymbolen. Und ihre Bedienung war tot:
// Klick auf einen Link, Scroll-Merken, Suche in der Seite, Rechtsklick — nichts kam beim
// Panel an (gemessen: keine einzige Nachricht aus dem Rahmen).
//
// URSACHE: Das Panel bettete das umgeschriebene HTML als `srcdoc` ein. Ein srcdoc-Rahmen ERBT
// die Sicherheitsregel des Einbetters — bei uns `style-src 'self'`, `img-src 'self'` und
// `script-src 'self'`. Fremde Stylesheets, fremde Bilder und das eingefuegte Navigationsskript
// (inline) wurden deshalb still blockiert. Dieselbe Falle wie am 2026-08-19 bei der Live-Buehne.
//
// LOESUNG: Die Seite kommt als eigenes Dokument von hier. Ein eigenes Dokument hat seine EIGENE
// Regel, und die ist genau zugeschnitten:
//   - Stil, Bilder, Schriften, Medien: vom Original (der Browser des Nutzers laedt sie direkt —
//     dieser Server traegt dafuer KEINE Last und wird kein Bild-Proxy);
//   - Skripte: ausschliesslich unser Navigationsskript (Nonce). Die Skripte der Seite sind
//     ohnehin entfernt; die Regel sperrt zusaetzlich alles, was durchrutschen koennte;
//   - sandbox OHNE allow-same-origin: das Dokument laeuft in fremder, leerer Herkunft und
//     kommt an kein Cookie und keinen Speicher von api.smejj.com;
//   - frame-ancestors nur unsere Seiten, und geliefert wird NUR in einen Rahmen
//     (Sec-Fetch-Dest: iframe). Als eigene Registerkarte aufgerufen gibt es 403 — sonst stuende
//     fremder Inhalt unter unserem Namen im Adressfeld (Phishing-Vorlage).
import crypto from "node:crypto";
import { brotliCompressSync, gzipSync, constants as zlibKonstanten } from "node:zlib";
import { waehleKodierung } from "../http/respond.js";
import { allowedOriginsFromEnv } from "../http/cors.js";
import { createRateLimiter, clientKeyFromRequest } from "../http/rateLimiter.js";
import { isAllowedBrowserCaller, ladeBrowserSeite, parseBrowserTarget, rewriteBrowserHtml } from "./browserProxyRoutes.js";

const defaultLimiter = createRateLimiter({ capacity: 30, refillPerSec: 0.75 });

function text(res, status, inhalt, kopf = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...kopf
  });
  res.end(inhalt);
}

/** Die Sicherheitsregel des ausgelieferten Dokuments — eigene Funktion, damit sie pruefbar ist. */
export function seitenRegel({ nonce, erlaubteEinbetter }) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src * 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src * data:",
    "media-src * blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri *",
    `frame-ancestors ${erlaubteEinbetter.join(" ") || "'none'"}`,
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
  ].join("; ");
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (wert) => String(wert ?? "").replace(/[&<>"']/g, (z) => ESC[z]);

function groesseLesbar(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

/**
 * DATEIEN STATT LEERER FLAECHE (Live-Test 20.09., v909): PDF, ZIP, Bild und Textdatei landeten als
 * abgeschotteter Direkt-Rahmen im Panel — Bild: Sperrsymbol, alles andere: weiss. Kein Hinweis,
 * kein Download. Chrome zeigt Bilder und Texte an, oeffnet PDFs und laedt den Rest herunter.
 * - Bild: wird direkt vom Original in DIESES Dokument geladen (img-src * — keine Serverlast).
 * - Text: steht lesbar im Dokument (der Server hat ihn ohnehin gelesen, gedeckelt).
 * - Alles andere: eine Karte mit EINEM Knopf. Er oeffnet die Adresse in einer neuen Registerkarte
 *   (der Rahmen erlaubt Popups, die der Sandbox entkommen) — dort zeigt der Browser des Nutzers
 *   das PDF an oder laedt die Datei herunter, mit seiner eigenen Sicherheitspruefung.
 * Bewusst OHNE unser Navigationsskript: es finge den Klick auf den Knopf ab und fuehrte im Kreis.
 */
export function dateiAnsicht(seite) {
  const adresse = seite.finalUrl;
  const name = seite.dateiname || (() => { try { return decodeURIComponent(new URL(adresse).pathname.split("/").filter(Boolean).pop() || new URL(adresse).hostname); } catch { return adresse; } })();
  const art = String(seite.contentType || "").split(";")[0] || "unbekannt";
  const kopf = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title><style>
    html,body{margin:0;min-height:100%;background:#101113;color:#f6f3ee;font:17px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
    .bild{display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box;background:#0b0c0e}
    .bild img{max-width:100%;max-height:calc(100vh - 32px);height:auto;background:repeating-conic-gradient(#2a2c30 0% 25%,#1d1f22 0% 50%) 0 0/20px 20px}
    pre{margin:0;padding:18px 20px;white-space:pre-wrap;word-break:break-word;font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
    .karte{max-width:560px;margin:12vh auto 0;padding:0 24px}
    h1{margin:0 0 6px;font-size:24px;word-break:break-word}
    p{margin:0 0 22px;color:rgba(246,243,238,.72)}
    a.knopf{display:inline-block;padding:14px 22px;border:1px solid rgba(159,231,212,.55);border-radius:8px;background:rgba(159,231,212,.14);color:#f6f3ee;font-weight:700;font-size:18px;text-decoration:none}
    a.knopf:hover,a.knopf:focus-visible{background:rgba(159,231,212,.26);outline:none}
    small{display:block;margin-top:18px;color:rgba(246,243,238,.55);font-size:14.5px;word-break:break-all}
  </style></head><body>`;
  if (art.startsWith("image/")) return `${kopf}<div class="bild"><img src="${esc(adresse)}" alt="${esc(name)}"></div></body></html>`;
  if (seite.text !== null && seite.text !== undefined) return `${kopf}<pre>${esc(seite.text)}</pre></body></html>`;
  const istPdf = art === "application/pdf" || /\.pdf$/i.test(name);
  return `${kopf}<div class="karte"><h1>${esc(name)}</h1><p>${esc(istPdf ? "PDF-Dokument" : `Datei (${art})`)}${seite.groesse ? ` · ${esc(groesseLesbar(seite.groesse))}` : ""}</p>
    <a class="knopf" href="${esc(adresse)}" target="_blank" rel="noopener noreferrer">${istPdf ? "PDF öffnen" : "Herunterladen"}</a>
    <small>${esc(adresse)}</small></div></body></html>`;
}

export async function handleBrowserPage(url, res, { fetchImpl = fetch, req = null, limiter = defaultLimiter, env = process.env } = {}) {
  if (req && !isAllowedBrowserCaller(req, env)) return text(res, 403, "Origin nicht erlaubt.");
  // Nur in einen Rahmen. Browser setzen diese Kopfzeile selbst; ein Skript kann sie nicht faelschen.
  const ziel = String(req?.headers?.["sec-fetch-dest"] || "").toLowerCase();
  if (req && ziel && ziel !== "iframe") return text(res, 403, "Diese Adresse liefert nur in den eingebauten Browser von smejj.com.");
  if (req && limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) return text(res, 429, "Zu viele Anfragen. Bitte kurz warten.", { "Retry-After": String(verdict.retryAfterSec) });
  }
  const parsed = parseBrowserTarget(url.searchParams.get("url"));
  if (!parsed.ok) return text(res, 400, String(parsed.error));
  const seite = await ladeBrowserSeite(parsed, { fetchImpl });
  if (!seite.ok) return text(res, seite.code, String(seite.error));
  const nonce = crypto.randomBytes(16).toString("base64");
  const html = seite.html === null ? dateiAnsicht(seite) : rewriteBrowserHtml(seite.html, seite.finalUrl, { nonce });
  // KOMPRIMIEREN (Live-Messung 20.09., v908): github.com = 305 KB HTML. Das erste Byte kam nach
  // 1 s, die UEBERTRAGUNG brauchte ueber die langsame Leitung des Betreibers 15-30 s — so lange
  // blieb der Rahmen weiss. HTML schrumpft mit Brotli auf rund ein Siebtel. Stufe 5 wie in
  // respond.js: wenige Millisekunden Rechenzeit, fast so klein wie Stufe 11.
  const kodierung = waehleKodierung(req?.headers?.["accept-encoding"]);
  const roh = Buffer.from(html, "utf8");
  const rumpf = kodierung === "br"
    ? brotliCompressSync(roh, { params: { [zlibKonstanten.BROTLI_PARAM_QUALITY]: 5, [zlibKonstanten.BROTLI_PARAM_SIZE_HINT]: roh.length } })
    : kodierung === "gzip" ? gzipSync(roh, { level: 6 }) : roh;
  res.writeHead(200, {
    ...(kodierung ? { "Content-Encoding": kodierung } : {}),
    "Content-Length": rumpf.length,
    Vary: "Accept-Encoding",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": seitenRegel({ nonce, erlaubteEinbetter: allowedOriginsFromEnv(env) }),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // Bewusst KEIN X-Frame-Options: DENY/SAMEORIGIN wuerde genau den Rahmen verbieten, fuer den
    // diese Antwort gebaut ist. Wer einbetten darf, regelt frame-ancestors oben.
    "Cross-Origin-Resource-Policy": "cross-origin"
  });
  res.end(rumpf);
}
