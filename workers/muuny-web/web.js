// muuny.com — die Anfrage-Behandlung, ohne Netz- und Prozessstart (testbar).
//
//   GET    /                      Chat-Seite (statisch)
//   GET    /datenschutz           Datenschutzhinweis — genau diese Bytes sind MUUNY_DATENSCHUTZ_SHA256
//   GET    /api/ich               angemeldet? eingewilligt? welche Datenschutz-Fassung?
//   POST   /api/code              {email} -> Code per E-Mail
//   POST   /api/anmelden          {email, code} -> Sitzungs-Cookie
//   POST   /api/abmelden
//   POST   /api/einwilligung      {trainingJa, pruefungJa, rechteJa} -> Autopilot /v1/einwilligung
//   DELETE /api/einwilligung      Widerruf
//   POST   /api/chat              {frage} -> muuny-laufzeit (Stream wird durchgereicht)
//   POST   /api/daumen            {frage, antwort, daumen} -> Autopilot /v1/lernpaar (nur "hoch")
//   GET    /v1/alias              durchgereicht vom Autopiloten
//
// Schutz: jede aendernde Anfrage braucht die Kopfzeile x-muuny: 1. Ein fremdes
// Formular oder Bild kann sie nicht setzen, und ein fremdes Skript scheitert am
// Browser (keine CORS-Freigabe). Zusammen mit SameSite=Lax reicht das gegen CSRF.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CodeSpeicher, Drossel, cookieLesen, cookieSetzen, normEmail, nutzerKennung, sitzungAusstellen, sitzungLesen } from "./anmeldung.js";

export const COOKIE = "muuny_s";
export const MAX_FRAGE = 4000;
export const MAX_ANTWORT = 12000;

const TYPEN = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };
const SEITEN = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/stil.css": "stil.css",
  "/datenschutz": "datenschutz.html", "/datenschutz.html": "datenschutz.html", "/robots.txt": "robots.txt", "/logo.svg": "logo.svg" };
const SICHERHEIT = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

export async function ladeSeiten(ordner) {
  const seiten = new Map();
  for (const datei of new Set(Object.values(SEITEN))) {
    const b = await readFile(path.join(ordner, datei)).catch(() => null);
    if (b) seiten.set(datei, { b, typ: TYPEN[path.extname(datei)] || "application/octet-stream", etag: `"${createHash("sha256").update(b).digest("hex").slice(0, 16)}"` });
  }
  const ds = seiten.get("datenschutz.html");
  return { seiten, datenschutzSha256: ds ? createHash("sha256").update(ds.b).digest("hex") : null };
}

/**
 * @param deps.seiten, deps.datenschutzSha256   aus ladeSeiten
 * @param deps.sitzungSchluessel, deps.pfeffer   Geheimnisse (je >= 32 Zeichen)
 * @param deps.versand      (email, code) => Promise  oder null (nicht eingerichtet)
 * @param deps.autopilot    {url, dienstSchluessel}
 * @param deps.laufzeit     {url, schluessel}
 * @param deps.erwarteteDatenschutzSha  was der Autopilot erwartet (MUUNY_DATENSCHUTZ_SHA256); muss passen
 */
export function baueWeb({ seiten, datenschutzSha256, sitzungSchluessel, pfeffer, versand = null, autopilot, laufzeit,
  erwarteteDatenschutzSha = "", fetchImpl = fetch, codes = new CodeSpeicher(), protokoll = console }) {
  if (!sitzungSchluessel || sitzungSchluessel.length < 32 || !pfeffer || pfeffer.length < 32) throw new Error("geheimnisse_fehlen");
  const chatDrossel = new Drossel({ max: 30, fensterMs: 3_600_000 });
  const laufendeChats = new Set();

  const json = (res, code, wert, kopf = {}) => {
    const b = JSON.stringify(wert);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SICHERHEIT, ...kopf });
    res.end(b);
  };
  const lese = (req, max = 32_000) => new Promise((fertig, schief) => {
    let t = "";
    req.on("data", (c) => { t += c; if (t.length > max) { schief(new Error("anfrage_zu_gross")); req.destroy(); } });
    req.on("end", () => { try { fertig(t ? JSON.parse(t) : {}); } catch { schief(new Error("kein_json")); } });
    req.on("error", schief);
  });
  const ipVon = (req) => String(req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "?").trim();
  const sitzung = (req) => sitzungLesen(cookieLesen(req.headers.cookie, COOKIE), sitzungSchluessel);
  const neueSitzung = (daten) => cookieSetzen(COOKIE, sitzungAusstellen(daten, sitzungSchluessel));
  const einwilligungMoeglich = () => Boolean(datenschutzSha256) && datenschutzSha256 === erwarteteDatenschutzSha;

  async function anAutopilot(pfad, methode, nutzer, koerper) {
    const r = await fetchImpl(`${autopilot.url.replace(/\/$/, "")}${pfad}`, {
      method: methode, signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "x-muuny-dienst": autopilot.dienstSchluessel, "x-muuny-nutzer": nutzer },
      body: koerper ? JSON.stringify(koerper) : undefined
    });
    return { status: r.status, daten: await r.json().catch(() => ({})) };
  }

  async function chat(req, res, s) {
    let k;
    try { k = await lese(req); } catch (f) { return json(res, 400, { ok: false, grund: f.message }); }
    const frage = String(k.frage || "").trim().slice(0, MAX_FRAGE);
    if (!frage) return json(res, 400, { ok: false, grund: "keine_frage" });
    if (laufendeChats.has(s.u)) return json(res, 429, { ok: false, grund: "eine_frage_nach_der_anderen" });
    if (!chatDrossel.erlaubt(s.u)) return json(res, 429, { ok: false, grund: "zu_viele_fragen" });
    laufendeChats.add(s.u);
    const abbruch = new AbortController();
    res.on("close", () => { if (!res.writableEnded) abbruch.abort(); });
    try {
      const r = await fetchImpl(`${laufzeit.url.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST", signal: abbruch.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${laufzeit.schluessel}` },
        body: JSON.stringify({ messages: [{ role: "user", content: frage }], stream: true, max_tokens: 512 })
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        return json(res, r.status === 503 ? 503 : 502, { ok: false, grund: d?.error?.message || `laufzeit_${r.status}` });
      }
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no",
        "x-muuny-modell": r.headers.get("x-muuny-modell") || "", "x-muuny-wissen": r.headers.get("x-muuny-wissen") || "0", ...SICHERHEIT });
      res.flushHeaders?.();
      const leser = r.body.getReader();
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (f) {
      if (!res.headersSent) json(res, 502, { ok: false, grund: "laufzeit_nicht_erreichbar" });
      else if (!res.writableEnded) res.end(`data: ${JSON.stringify({ error: { message: String(f?.message || "abbruch").slice(0, 80) } })}\n\ndata: [DONE]\n\n`);
    } finally {
      laufendeChats.delete(s.u);
    }
  }

  return async function behandle(req, res) {
    const url = new URL(req.url, "https://muuny.com");
    const p = url.pathname;

    if (req.method === "GET" && SEITEN[p]) {
      const s = seiten.get(SEITEN[p]);
      if (!s) return json(res, 404, { ok: false });
      if (req.headers["if-none-match"] === s.etag) { res.writeHead(304, { etag: s.etag }); return res.end(); }
      res.writeHead(200, { "content-type": s.typ, etag: s.etag, "cache-control": "no-cache", ...SICHERHEIT });
      return res.end(s.b);
    }
    if (p === "/health") return json(res, 200, { ok: true, dienst: "muuny-web", versand: Boolean(versand), einwilligung: einwilligungMoeglich() });
    if (p === "/v1/alias" && req.method === "GET") {
      try { const r = await fetchImpl(`${autopilot.url.replace(/\/$/, "")}/v1/alias`, { signal: AbortSignal.timeout(5000) }); return json(res, r.status, await r.json()); }
      catch { return json(res, 502, { ok: false }); }
    }
    if (!p.startsWith("/api/")) return json(res, 404, { ok: false, grund: "nicht_gefunden" });
    if (req.method !== "GET" && req.headers["x-muuny"] !== "1") return json(res, 403, { ok: false, grund: "kopfzeile_fehlt" });

    const s = sitzung(req);
    if (p === "/api/ich") {
      return json(res, 200, { angemeldet: Boolean(s), einwilligung: Boolean(s?.ew), datenschutzSha256, einwilligungMoeglich: einwilligungMoeglich(), versand: Boolean(versand) });
    }
    if (p === "/api/code" && req.method === "POST") {
      if (!versand) return json(res, 503, { ok: false, grund: "email_versand_nicht_eingerichtet" });
      let k; try { k = await lese(req, 2000); } catch (f) { return json(res, 400, { ok: false, grund: f.message }); }
      const email = normEmail(k.email);
      if (!email) return json(res, 400, { ok: false, grund: "email_ungueltig" });
      const c = codes.neu(email, ipVon(req));
      if (!c.ok) return json(res, 429, c);
      try { await versand(email, c.code); } catch (f) { protokoll.log?.("[web] Versand fehlgeschlagen", String(f?.message || f).slice(0, 60)); return json(res, 502, { ok: false, grund: "versand_fehlgeschlagen" }); }
      return json(res, 200, { ok: true });
    }
    if (p === "/api/anmelden" && req.method === "POST") {
      let k; try { k = await lese(req, 2000); } catch (f) { return json(res, 400, { ok: false, grund: f.message }); }
      const email = normEmail(k.email);
      if (!email) return json(res, 400, { ok: false, grund: "email_ungueltig" });
      const r = codes.pruefe(email, k.code);
      if (!r.ok) return json(res, 401, r);
      return json(res, 200, { ok: true }, { "set-cookie": neueSitzung({ u: nutzerKennung(email, pfeffer), ew: 0 }) });
    }
    if (p === "/api/abmelden" && req.method === "POST") {
      return json(res, 200, { ok: true }, { "set-cookie": cookieSetzen(COOKIE, "", { maxAlterS: 0 }) });
    }
    if (!s) return json(res, 401, { ok: false, grund: "anmeldung_fehlt" });

    if (p === "/api/einwilligung" && req.method === "POST") {
      if (!einwilligungMoeglich()) return json(res, 503, { ok: false, grund: "einwilligung_nicht_eingerichtet" });
      let k; try { k = await lese(req, 2000); } catch (f) { return json(res, 400, { ok: false, grund: f.message }); }
      // Nur ein echtes true zaehlt — "ja", 1 oder "true" sind KEIN ausdrueckliches Ja.
      const r = await anAutopilot("/v1/einwilligung", "POST", s.u, { datenschutzSha256, trainingJa: k.trainingJa === true,
        pruefungJa: k.pruefungJa === true, rechteJa: k.rechteJa === true }).catch(() => ({ status: 502, daten: { ok: false, grund: "autopilot_nicht_erreichbar" } }));
      if (r.daten?.ok === true) return json(res, 200, { ok: true }, { "set-cookie": neueSitzung({ u: s.u, ew: 1 }) });
      return json(res, r.status >= 400 ? r.status : 400, { ok: false, grund: r.daten?.grund || "einwilligung_abgelehnt" });
    }
    if (p === "/api/einwilligung" && req.method === "DELETE") {
      const r = await anAutopilot("/v1/einwilligung", "DELETE", s.u).catch(() => ({ status: 502, daten: { ok: false, grund: "autopilot_nicht_erreichbar" } }));
      if (r.daten?.ok === true) return json(res, 200, { ok: true }, { "set-cookie": neueSitzung({ u: s.u, ew: 0 }) });
      return json(res, 502, { ok: false, grund: r.daten?.grund || "widerruf_fehlgeschlagen" });
    }
    if (p === "/api/chat" && req.method === "POST") return chat(req, res, s);
    if (p === "/api/daumen" && req.method === "POST") {
      let k; try { k = await lese(req, 40_000); } catch (f) { return json(res, 400, { ok: false, grund: f.message }); }
      if (k.daumen !== "hoch") return json(res, 200, { erfasst: false, grund: "kein_daumen_hoch" });
      if (!s.ew) return json(res, 200, { erfasst: false, grund: "keine_einwilligung" });
      const r = await anAutopilot("/v1/lernpaar", "POST", s.u, { daumen: "hoch", frage: String(k.frage || "").slice(0, MAX_FRAGE),
        antwort: String(k.antwort || "").slice(0, MAX_ANTWORT) }).catch(() => ({ daten: { erfasst: false, grund: "autopilot_nicht_erreichbar" } }));
      return json(res, 200, { erfasst: r.daten?.erfasst === true, grund: r.daten?.grund || null });
    }
    return json(res, 404, { ok: false, grund: "nicht_gefunden" });
  };
}
