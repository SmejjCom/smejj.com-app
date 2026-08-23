// smejj.com control-server — HTTP-Antwort- und Body-Helfer (Single Responsibility: Request/Response-I/O).
import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { SECURITY_LIMITS } from "../../../src/shared/securityPolicy.js";

export function json(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
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
export function fehlerAntwort(res, error) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  const nutzlast = { error: error?.message || "Internal error" };
  if (error?.code) nutzlast.code = error.code;
  json(res, status, nutzlast);
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
