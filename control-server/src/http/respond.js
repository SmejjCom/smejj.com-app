// smejj.com control-server — HTTP-Antwort- und Body-Helfer (Single Responsibility: Request/Response-I/O).
import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { SECURITY_LIMITS } from "../../../src/shared/securityPolicy.js";
import { brotliCompressSync, gzipSync, constants as zlibKonstanten } from "node:zlib";

// KOMPRIMIERUNG (A-bis-Z-Livetest 15.09.2026, Befund M1): JSON ging bisher
// unkomprimiert raus. /api/admin/ops/autopiloten wog 592 KB — am Handy ueber
// 30 s Ladezeit. JSON schrumpft mit Brotli/Gzip auf rund ein Zehntel.
// Unter 1 KB lohnt es nicht (Kopfzeilen + Rechenzeit > Ersparnis).
const KOMPRIMIEREN_AB_BYTES = 1024;

/** Welche Kodierung der Aufrufer annimmt — br vor gzip, q=0 heisst "nein". */
export function waehleKodierung(acceptEncoding) {
  const angebote = new Map();
  for (const teil of String(acceptEncoding || "").toLowerCase().split(",")) {
    const [name, ...parameter] = teil.trim().split(";");
    if (!name) continue;
    const q = parameter.map((p) => p.trim()).find((p) => p.startsWith("q="));
    angebote.set(name.trim(), q ? Number(q.slice(2)) : 1);
  }
  const erlaubt = (name) => (angebote.has(name) ? angebote.get(name) > 0 : (angebote.get("*") || 0) > 0);
  if (erlaubt("br")) return "br";
  if (erlaubt("gzip")) return "gzip";
  return null;
}

/** Vary zusammenfuehren statt ueberschreiben — CORS setzt vorher schon "Origin". */
function varyMit(res, eintrag) {
  const vorher = typeof res.getHeader === "function" ? res.getHeader("Vary") : undefined;
  const liste = String(vorher || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!liste.some((s) => s.toLowerCase() === eintrag.toLowerCase())) liste.push(eintrag);
  return liste.join(", ");
}

export function json(res, status, payload) {
  const kopf = { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" };
  const text = JSON.stringify(payload, null, 2);
  // res.req setzt Node selbst (http.ServerResponse); Attrappen ohne req bleiben unkomprimiert.
  const kodierung = Buffer.byteLength(text) >= KOMPRIMIEREN_AB_BYTES ? waehleKodierung(res.req?.headers?.["accept-encoding"]) : null;
  if (!kodierung) {
    if (Buffer.byteLength(text) >= KOMPRIMIEREN_AB_BYTES) kopf.Vary = varyMit(res, "Accept-Encoding");
    res.writeHead(status, kopf);
    res.end(text);
    return;
  }
  // Brotli-Stufe 5 statt 11: 592 KB in wenigen Millisekunden, fast gleich klein.
  const rumpf = kodierung === "br"
    ? brotliCompressSync(text, { params: { [zlibKonstanten.BROTLI_PARAM_QUALITY]: 5, [zlibKonstanten.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(text) } })
    : gzipSync(text, { level: 6 });
  kopf["Content-Encoding"] = kodierung;
  kopf["Content-Length"] = rumpf.length;
  kopf.Vary = varyMit(res, "Accept-Encoding");
  res.writeHead(status, kopf);
  res.end(rumpf);
}

export function privateJson(res, status, payload) {
  if (typeof res.setHeader === "function") res.setHeader("Cache-Control", "private, no-store");
  return json(res, status, payload);
}

/**
 * Ein Fehler, der seinen HTTP-Status selbst mitbringt.
 *
 * WARUM ES DAS GIBT (gemessen 2026-08-23): Der Body-Leser warf bisher ein
 * nacktes `new Error("Request too large")`. Der oberste Handler in
 * src/server.js macht aus jedem Fehler ohne Status ein 500 — also bekam der
 * Client fuer eine Absage, die ER verursacht hat, einen SERVERFEHLER.
 *
 * Das ist nicht nur unsauber, es hat echten Schaden angerichtet: das Frontend
 * behandelte (voellig richtig) nur 4xx als "der Server nimmt diesen Chat
 * nicht". Sechs zu grosse Chats des Betreibers fielen deshalb durch jede
 * Pruefung — sie wurden weder gerettet noch gemeldet, wochenlang. Ein 500
 * heisst "unser Fehler, versuch es spaeter"; genau das hat die App getan.
 *
 * 413 sagt die Wahrheit: die Anfrage ist zu gross, und daran aendert kein
 * Wiederholen etwas.
 */
export function httpFehler(status, code, nachricht) {
  const fehler = new Error(nachricht || code);
  fehler.status = status;
  fehler.code = code;
  return fehler;
}

/** Die Absage des Body-Lesers — eine Stelle, damit beide Leser sie teilen. */
export function zuGrossFehler() {
  return httpFehler(413, "request_zu_gross", "Request too large");
}

/**
 * Beantwortet einen Fehler mit dem Status, den er mitbringt — und nur ohne
 * eigenen Status mit 500. Fail-safe: was hier hereinkommt, ist bereits ein
 * Fehlerfall, also darf diese Funktion selbst keinen neuen ausloesen.
 */
export function fehlerAntwort(res, error, req = null) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  const nutzlast = { error: error?.message || "Internal error" };
  if (error?.code) nutzlast.code = error.code;
  json(res, status, nutzlast);
  // ABBRECHEN, NICHT NUR ANTWORTEN — live gemessen 2026-08-23:
  //
  // Der Body-Leser lehnt ab, sobald die Grenze faellt. Der Client weiss davon
  // nichts und sendet weiter; HTTP/1.1 laesst die Antwort erst durch, wenn der
  // Request zu Ende ist. Ein 1,2-MB-Upload lief deshalb 60 Sekunden ins Leere
  // und endete im Zeitablauf statt in einer Absage — schlimmer als ein
  // falscher Statuscode, denn der Nutzer sieht gar nichts mehr.
  //
  // Bei 413 wird die Leitung darum aktiv geschlossen. Das ist nicht nur
  // hoeflicher, es ist eine Lastfrage: ein Server, der abgelehnte Uploads
  // trotzdem vollstaendig entgegennimmt, verschenkt genau die Bandbreite,
  // die er sich gerade sparen wollte.
  if (status === 413 && req && typeof req.destroy === "function") {
    try { req.destroy(); } catch { /* schon zu */ }
  }
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > SECURITY_LIMITS.maxJsonBodyBytes) reject(zuGrossFehler());
    });
    req.on("end", () => resolve(raw));
  });
}

export async function readJson(req) {
  const raw = await readRawBody(req);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Invalid JSON");
  }
}
