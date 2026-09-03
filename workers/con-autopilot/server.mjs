// con-Autopilot — Dienst fuer Zeabur (Single Responsibility: Takt-Uhr + HTTP-Fenster).
// /health (Sonde), /api/con/status (JSON fuer Ampeln), /api/con/dashboard (HTML), /api/con/tick (manuell, mit Schluessel).
// Ohne CON_AUTOPILOT_ENABLED=YES tickt nichts (fail-closed), der Dienst antwortet nur auf /health.
import http from "node:http";
import { leseKonfig } from "./config.js";
import { e2Client } from "./e2.js";
import { saladClient } from "./salad.js";
import { tick, leseZustand } from "./kreislauf.js";
import { baueStatus, dashboardHtml } from "./dashboard.js";

const konfig = leseKonfig(process.env);
const log = (...a) => console.log(new Date().toISOString(), "[con]", ...a);
let e2 = null;
let salad = null;
try { e2 = konfig.e2.ok ? e2Client(konfig.e2) : null; } catch (e) { log("e2 aus:", e.message); }
try { salad = konfig.salad.ok ? saladClient(konfig.salad) : null; } catch (e) { log("salad aus:", e.message); }
let tickLaeuft = false;
let letzterTick = null;

async function einTakt(ausloeser) {
  if (tickLaeuft) return { uebersprungen: true };
  if (!konfig.aktiviert || !e2) return { uebersprungen: true, grund: !konfig.aktiviert ? "CON_AUTOPILOT_ENABLED fehlt" : "e2 fehlt" };
  tickLaeuft = true;
  try {
    const z = await tick({ konfig, e2, salad, log });
    letzterTick = { zeit: new Date().toISOString(), ausloeser, phase: z.phase };
    return z;
  } finally { tickLaeuft = false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const senden = (code, body, typ = "application/json") => { const b = typeof body === "string" ? body : JSON.stringify(body, null, 2); res.writeHead(code, { "content-type": typ + "; charset=utf-8", "content-length": Buffer.byteLength(b) }); res.end(b); };
  try {
    if (url.pathname === "/health") return senden(200, { ok: true, dienst: "con-autopilot", aktiviert: konfig.aktiviert, e2: Boolean(e2), salad: Boolean(salad), letzterTick });
    if (!e2) return senden(503, { ok: false, grund: "e2 nicht konfiguriert", fehlend: konfig.e2.fehlend });
    if (url.pathname === "/api/con/status") return senden(200, await baueStatus({ konfig, e2, salad }));
    if (url.pathname === "/api/con/dashboard" || url.pathname === "/") return senden(200, dashboardHtml(await baueStatus({ konfig, e2, salad })), "text/html");
    if (url.pathname === "/api/con/tick" && req.method === "POST") {
      if (!konfig.adminKey || req.headers["x-con-key"] !== konfig.adminKey) return senden(401, { ok: false, grund: "schluessel" });
      return senden(200, await einTakt("manuell"));
    }
    return senden(404, { ok: false });
  } catch (e) { log("HTTP-Fehler", e.message); return senden(500, { ok: false, fehler: String(e.message).slice(0, 200) }); }
});

server.listen(konfig.port, konfig.host, () => {
  log(`listening ${konfig.host}:${konfig.port} aktiviert=${konfig.aktiviert} takt=${konfig.taktMs / 1000}s`);
  if (konfig.aktiviert && e2) {
    setTimeout(() => einTakt("start").catch((e) => log("Takt-Fehler", e.message)), 5_000);
    setInterval(() => einTakt("uhr").catch((e) => log("Takt-Fehler", e.message)), konfig.taktMs);
  }
});
