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
  if (seite.html === null) return text(res, 415, "Kein HTML-Dokument.");

  const nonce = crypto.randomBytes(16).toString("base64");
  const html = rewriteBrowserHtml(seite.html, seite.finalUrl, { nonce });
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
