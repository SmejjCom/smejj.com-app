// muuny ai radar — Abrufen, hoeflich und begrenzt.
//
//  * nur https, nie interne Adressen — auch nicht nach einer Umleitung
//  * robots.txt wird beachtet; ist sie nicht lesbar (5xx), wird der Host in diesem
//    Lauf gemieden. Fehlt sie (404), gilt das Uebliche: erlaubt.
//  * hoechstens eine Anfrage alle 2 s je Host, keine Cookies, keine Anmeldung
//  * Groessengrenze je Abruf; wer mehr schickt, wird abgeschnitten und verworfen
//  * bedingte Abrufe (ETag / If-Modified-Since): ein unveraenderter Feed kostet
//    keine Bytes und erzeugt keine doppelten Funde
//  * Wiederholung nur bei Netz- und 5xx-Fehlern, hoechstens zweimal, mit Pause
//
// Der Inhalt ist NICHT vertrauenswuerdig. Dieses Modul holt nur Bytes; was darin
// steht, wird nie ausgefuehrt, nie als Anweisung gelesen (siehe parser.js).

export const USER_AGENT = "muuny-ai-radar/1.0 (+https://muuny.com; oeffentliche Feeds, robots.txt wird beachtet)";

const INTERN = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1\]?$|\[?fc|\[?fd)/i;

export function istErlaubteAdresse(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === "https:" && !INTERN.test(u.hostname) && !u.hostname.endsWith(".internal") && !u.username && !u.password;
}

/** robots.txt: Disallow-Praefixe fuer "*" und fuer unseren Namen. */
export function robotsRegeln(text) {
  const regeln = [];
  let gilt = false;
  let gruppeHatteRegel = false;
  for (const roh of String(text || "").split(/\r?\n/)) {
    const zeile = roh.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(zeile);
    if (!m) continue;
    const [, feld, wert] = m;
    const f = feld.toLowerCase();
    if (f === "user-agent") {
      // Eine neue Gruppe beginnt nach der ersten Regel der alten.
      if (gruppeHatteRegel) { gilt = false; gruppeHatteRegel = false; }
      const ua = wert.toLowerCase();
      if (ua === "*" || ua.includes("muuny")) gilt = true;
    } else if (f === "disallow" || f === "allow") {
      gruppeHatteRegel = true;
      if (gilt && wert) regeln.push({ erlaubt: f === "allow", praefix: wert });
    }
  }
  return regeln;
}

/** robots.txt-Muster: `*` steht fuer beliebig viel, `$` fuer das Ende (wie bei Google und Bing). */
function robotsMuster(praefix) {
  const ende = praefix.endsWith("$");
  const kern = (ende ? praefix.slice(0, -1) : praefix).split("*").map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${kern}${ende ? "$" : ""}`);
}

export function robotsErlaubt(regeln, pfad) {
  // Die laengste passende Regel gewinnt; bei Gleichstand gewinnt Allow.
  // Bis 21.09. wurde alles ab dem ersten `*` abgeschnitten — aus heise.de
  // "Disallow: /*/bilderstrecke/" wurde "Disallow: /" und der ganze Host galt als verboten.
  let beste = null;
  for (const r of regeln) {
    if (!robotsMuster(r.praefix).test(pfad)) continue;
    const laenge = r.praefix.length;
    if (!beste || laenge > beste.laenge || (laenge === beste.laenge && r.erlaubt)) beste = { laenge, erlaubt: r.erlaubt };
  }
  return beste ? beste.erlaubt : true;
}

export function baueAbrufer({ fetchImpl = fetch, jetzt = () => Date.now(), warte = (ms) => new Promise((r) => setTimeout(r, ms)),
  zeitMs = 15_000, abstandMs = 2000, wiederholungen = 2, pauseMs = 1000 } = {}) {
  const robotsCache = new Map(); // host -> {regeln, bis} oder {gesperrt, bis}
  const letzterAbruf = new Map(); // host -> ms
  const zaehler = { anfragen: 0, bytes: 0 };

  async function hoeflich(host) {
    const zuletzt = letzterAbruf.get(host) || 0;
    const warten = zuletzt + abstandMs - jetzt();
    if (warten > 0) await warte(warten);
    letzterAbruf.set(host, jetzt());
  }

  async function einmal(url, kopf, maxBytes) {
    const start = jetzt();
    const host = new URL(url).hostname;
    await hoeflich(host);
    zaehler.anfragen += 1;
    const antwort = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml, */*;q=0.5", ...kopf },
      redirect: "follow", signal: AbortSignal.timeout(zeitMs) });
    // Eine Umleitung darf nicht nach innen fuehren.
    if (antwort.url && !istErlaubteAdresse(antwort.url)) return { ok: false, status: 0, grund: "umleitung_verboten", ms: jetzt() - start };
    if (antwort.status === 304) return { ok: true, unveraendert: true, status: 304, bytes: 0, ms: jetzt() - start };
    // Begrenzt lesen: nie mehr als maxBytes in den Speicher.
    const teile = [];
    let n = 0;
    if (antwort.body?.getReader) {
      const leser = antwort.body.getReader();
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        n += value.length;
        if (n > maxBytes) { try { await leser.cancel(); } catch { /* egal */ } zaehler.bytes += n; return { ok: false, status: antwort.status, grund: "zu_gross", bytes: n, ms: jetzt() - start }; }
        teile.push(value);
      }
    } else {
      const t = Buffer.from(await antwort.arrayBuffer());
      n = t.length;
      if (n > maxBytes) { zaehler.bytes += n; return { ok: false, status: antwort.status, grund: "zu_gross", bytes: n, ms: jetzt() - start }; }
      teile.push(t);
    }
    zaehler.bytes += n;
    const text = Buffer.concat(teile.map((t) => Buffer.from(t))).toString("utf8");
    return { ok: antwort.ok, status: antwort.status, text, bytes: n, ms: jetzt() - start,
      etag: antwort.headers?.get?.("etag") || null, lastModified: antwort.headers?.get?.("last-modified") || null,
      grund: antwort.ok ? null : `http_${antwort.status}` };
  }

  async function robots(url) {
    const u = new URL(url);
    const c = robotsCache.get(u.host);
    if (c && c.bis > jetzt()) return c;
    let eintrag;
    try {
      const r = await einmal(`${u.protocol}//${u.host}/robots.txt`, {}, 512 * 1024);
      if (r.status === 404 || r.status === 410) eintrag = { regeln: [] };
      else if (r.ok) eintrag = { regeln: robotsRegeln(r.text) };
      else eintrag = { gesperrt: `robots_unklar_http_${r.status}` };
    } catch (f) {
      eintrag = { gesperrt: `robots_nicht_erreichbar:${String(f?.name || f?.message || f).slice(0, 40)}` };
    }
    eintrag.bis = jetzt() + 24 * 3600_000;
    robotsCache.set(u.host, eintrag);
    return eintrag;
  }

  /**
   * @returns {{ok, status, text?, unveraendert?, bytes, ms, etag?, lastModified?, grund, versuche}}
   */
  async function hole(url, { etag = null, lastModified = null, maxBytes = 3 * 1024 * 1024 } = {}) {
    if (!istErlaubteAdresse(url)) return { ok: false, status: 0, grund: "adresse_verboten", bytes: 0, ms: 0, versuche: 0 };
    const r = await robots(url);
    if (r.gesperrt) return { ok: false, status: 0, grund: r.gesperrt, bytes: 0, ms: 0, versuche: 0 };
    const pfad = new URL(url).pathname + new URL(url).search;
    if (!robotsErlaubt(r.regeln, pfad)) return { ok: false, status: 0, grund: "robots_verbietet", bytes: 0, ms: 0, versuche: 0 };
    const kopf = {};
    if (etag) kopf["if-none-match"] = etag;
    if (lastModified) kopf["if-modified-since"] = lastModified;
    let letzter = null;
    for (let versuch = 1; versuch <= 1 + wiederholungen; versuch += 1) {
      try {
        const e = await einmal(url, kopf, maxBytes);
        e.versuche = versuch;
        // 4xx wird nicht wiederholt: das wird beim zweiten Mal nicht anders.
        if (e.ok || (e.status >= 400 && e.status < 500) || e.grund === "zu_gross" || e.grund === "umleitung_verboten") return e;
        letzter = e;
      } catch (f) {
        letzter = { ok: false, status: 0, grund: `netz:${String(f?.name || f?.message || f).slice(0, 60)}`, bytes: 0, ms: 0, versuche: versuch };
      }
      if (versuch <= wiederholungen) await warte(pauseMs * versuch);
    }
    return letzter;
  }

  return { hole, zaehler };
}
