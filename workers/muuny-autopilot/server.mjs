// muuny AI — Dienst fuer Zeabur (Single Responsibility: Takt-Uhr + HTTP-Fenster).
// /v1/alias (offen: worauf muuny-stable zeigt), /v1/betrieb (POST: Betriebsdaten),
// /health (Sonde), /api/muuny/status (JSON fuer Ampeln), /api/muuny/dashboard (HTML), /api/muuny/tick (manuell, mit Schluessel).
// Die alten /api/con/*-Pfade und der Kopf x-con-key antworten weiter: die Betreiber-Wache und
// die Lesezeichen im Portal zeigen noch dorthin, und ein Umzug darf keine Ampel blind machen.
// Ohne MUUNY_AUTOPILOT_ENABLED=YES tickt nichts (fail-closed), der Dienst antwortet nur auf /health.
import crypto from "node:crypto";
import http from "node:http";
import { leseKonfig } from "./config.js";
import { e2Client } from "./e2.js";
import { saladClient } from "./salad.js";
import { tick, leseZustand } from "./kreislauf.js";
import { baueStatus, dashboardHtml } from "./dashboard.js";
import { aliasStand, waehleVersion } from "./canary.js";
import { L } from "./lager.js";

const konfig = leseKonfig(process.env);
const log = (...a) => console.log(new Date().toISOString(), "[muuny]", ...a);
let e2 = null;
let salad = null;
try { e2 = konfig.e2.ok ? e2Client(konfig.e2) : null; } catch (e) { log("e2 aus:", e.message); }
try { salad = konfig.salad.ok ? saladClient(konfig.salad) : null; } catch (e) { log("salad aus:", e.message); }
let tickLaeuft = false;
let letzterTick = null;

async function einTakt(ausloeser) {
  if (tickLaeuft) return { uebersprungen: true };
  if (!konfig.aktiviert || !e2) return { uebersprungen: true, grund: !konfig.aktiviert ? "MUUNY_AUTOPILOT_ENABLED fehlt" : "e2 fehlt" };
  tickLaeuft = true;
  try {
    const z = await tick({ konfig, e2, salad, log });
    letzterTick = { zeit: new Date().toISOString(), ausloeser, phase: z.phase };
    return z;
  } finally { tickLaeuft = false; }
}

/** Zeitkonstanter Vergleich — ein einfaches === verraet ueber die Laufzeit Zeichen fuer Zeichen. */
function sicherGleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const senden = (code, body, typ = "application/json") => { const b = typeof body === "string" ? body : JSON.stringify(body, null, 2); res.writeHead(code, { "content-type": typ + "; charset=utf-8", "content-length": Buffer.byteLength(b) }); res.end(b); };
  try {
    if (url.pathname === "/health") return senden(200, { ok: true, dienst: "muuny-autopilot", aktiviert: konfig.aktiviert, e2: Boolean(e2), salad: Boolean(salad), letzterTick });
    // DER ALIAS. muuny.com fragt diese Adresse und NIE eine feste Versionsnummer.
    // Offen ohne Schluessel: die Anwendung muss ihn bei jeder Anfrage lesen koennen,
    // und er verraet nichts ausser dem Namen der Gewichte, die gerade bedienen.
    if (url.pathname === "/v1/alias" || url.pathname === "/v1/alias/muuny-stable") {
      if (!e2) return senden(503, { ok: false, grund: "e2 nicht konfiguriert" });
      const stand = await aliasStand(e2);
      const kennung = url.searchParams.get("kennung") || req.headers["x-anfrage-kennung"] || "";
      const wahl = waehleVersion(stand, kennung);
      return senden(200, { ok: true, ...stand, gewaehlt: wahl.version, rolle: wahl.rolle });
    }
    // Betriebsdaten einer ausgelieferten Version. OHNE diese Meldungen kann sich keine
    // Canary bewaehren: pruefeBefoerderung verlangt echte Antworten, keine Vermutungen.
    if (url.pathname === "/v1/betrieb" && req.method === "POST") {
      if (!e2) return senden(503, { ok: false, grund: "e2 nicht konfiguriert" });
      const roh = await new Promise((fertig, schief) => { let t = ""; req.on("data", (c) => { t += c; if (t.length > 100_000) req.destroy(); }); req.on("end", () => fertig(t)); req.on("error", schief); });
      let m; try { m = JSON.parse(roh || "{}"); } catch { return senden(400, { ok: false, grund: "kein_json" }); }
      const version = String(m.version || "").trim();
      if (!/^[a-z0-9.\-]{3,64}$/i.test(version)) return senden(400, { ok: false, grund: "version_fehlt_oder_unzulaessig" });
      const key = `${L.deployMetriken}/${version}.json`;
      const alt = (await e2.getJson(key, null)) || { version, antworten: 0, fehler: 0, sicherheitsvorfaelle: 0, abstuerze: 0, latenzSumme: 0, kostenSumme: 0 };
      alt.antworten += Math.max(0, Number(m.antworten) || 1);
      alt.fehler += Math.max(0, Number(m.fehler) || 0);
      alt.sicherheitsvorfaelle += Math.max(0, Number(m.sicherheitsvorfaelle) || 0);
      alt.abstuerze += Math.max(0, Number(m.abstuerze) || 0);
      alt.latenzSumme += Math.max(0, Number(m.latenzMs) || 0);
      alt.kostenSumme += Math.max(0, Number(m.kostenUsd) || 0);
      // Abgeleitete Werte mitschreiben: pruefeRollback und pruefeBefoerderung lesen sie,
      // und ein Verhaeltnis, das erst beim Lesen entsteht, wird irgendwann anders gerechnet.
      alt.fehlerrate = alt.antworten ? Math.round((alt.fehler / alt.antworten) * 10000) / 10000 : 0;
      alt.latenzMs = alt.antworten ? Math.round(alt.latenzSumme / alt.antworten) : 0;
      alt.kostenProAntwortUsd = alt.antworten ? Math.round((alt.kostenSumme / alt.antworten) * 1e6) / 1e6 : 0;
      alt.aktualisiert = new Date().toISOString();
      await e2.putJson(key, alt);
      return senden(200, { ok: true, version, antworten: alt.antworten, fehlerrate: alt.fehlerrate });
    }
    // Alles ausser /health zeigt Betriebsdaten (Versionen, Noten, Kosten, Job-Kennungen). Sobald ein
    // Verwaltungsschluessel gesetzt ist, ist es verschlossen: Kopf x-muuny-key (oder x-con-key) oder ?key=.
    // Ohne gesetzten Schluessel bleibt es offen, damit ein Dienst ohne Umgebung nicht stumm wirkt.
    const mitgebracht = req.headers["x-muuny-key"] || req.headers["x-con-key"] || url.searchParams.get("key") || "";
    if (konfig.adminKey && !sicherGleich(String(mitgebracht), konfig.adminKey)) {
      return senden(401, { ok: false, grund: "schluessel_fehlt_oder_falsch" });
    }
    if (!e2) return senden(503, { ok: false, grund: "e2 nicht konfiguriert", fehlend: konfig.e2.fehlend });
    const pfad = url.pathname.replace(/^\/api\/con\//, "/api/muuny/");
    if (pfad === "/api/muuny/status") return senden(200, await baueStatus({ konfig, e2, salad }));
    if (pfad === "/api/muuny/dashboard" || pfad === "/") return senden(200, dashboardHtml(await baueStatus({ konfig, e2, salad })), "text/html");
    if (pfad === "/api/muuny/tick" && req.method === "POST") {
      const schluessel = req.headers["x-muuny-key"] || req.headers["x-con-key"];
      if (!konfig.adminKey || schluessel !== konfig.adminKey) return senden(401, { ok: false, grund: "schluessel" });
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
