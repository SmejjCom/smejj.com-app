// smejj.com — Browser-Proxy fuer den integrierten Browser (Codex-Stil).
// GET /api/browser/fetch?url=... laedt eine oeffentliche Seite serverseitig,
// prueft ob sie direkt einbettbar ist (X-Frame-Options / frame-ancestors) und
// liefert sonst eine sichere, umgeschriebene HTML-Version fuer srcdoc-Iframes.
// Fail-closed: nur http(s), keine privaten Netze, harte Groessen-/Zeitlimits.
import { json } from "../http/respond.js";
import { holeFavicon } from "./faviconHolen.js";
import { allowedOriginsFromEnv } from "../http/cors.js";
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";

const MAX_HTML_BYTES = 2_500_000;
const FETCH_TIMEOUT_MS = 15_000;

// Standard: 20 Anfragen Burst, ~0,5/s Nachfuellung (≈30/min pro IP). Per Env
// uebersteuerbar, damit der Proxy kein offener Allzweck-Proxy wird.
const RATE_CAPACITY = clampInt(process.env.SMEJJ_BROWSER_RATE_CAPACITY, 20, 1, 200);
const RATE_REFILL_PER_SEC = clampFloat(process.env.SMEJJ_BROWSER_RATE_REFILL_PER_SEC, 0.5, 0.01, 50);
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

// Nur Anfragen vom eigenen Frontend zulassen (Origin/Referer). Fehlt beides,
// wird durchgelassen (native Health-Checks/serverseitige Aufrufe), aber
// eine FREMDE Origin wird hart abgelehnt — kein Cross-Site-Missbrauch.
export function isAllowedBrowserCaller(req, env = process.env) {
  const allowed = allowedOriginsFromEnv(env);
  const origin = String(req?.headers?.origin || "").replace(/\/$/, "");
  if (origin) return allowed.includes(origin);
  const referer = String(req?.headers?.referer || "");
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return true;
}
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 smejj.com-browser";

// Private/interne Ziele blockieren (SSRF-Guard). DNS-Aufloesung wird bewusst
// nicht abgewartet: IP-Literale und bekannte interne Hostnamen reichen fuer
// den Free-Stack, alles Weitere faengt das Netzwerk-Sandboxing des Hosts.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.(local|internal|lan|home|corp)$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i
];

export function parseBrowserTarget(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return { ok: false, error: "Parameter url fehlt." };
  let target;
  try {
    target = new URL(input);
  } catch {
    return { ok: false, error: "Ungueltige URL." };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ok: false, error: "Nur http(s)-URLs sind erlaubt." };
  }
  const host = target.hostname;
  if (!host || BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { ok: false, error: "Ziel-Host ist blockiert (privates Netz)." };
  }
  return { ok: true, url: target };
}

export async function handleBrowserFetch(url, res, { fetchImpl = fetch, req = null, limiter = defaultLimiter, env = process.env } = {}) {
  if (req && !isAllowedBrowserCaller(req, env)) {
    return json(res, 403, { ok: false, error: "Origin nicht erlaubt." });
  }
  if (req && limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }

  const parsed = parseBrowserTarget(url.searchParams.get("url"));
  if (!parsed.ok) return json(res, 400, { ok: false, error: parsed.error });

  let response;
  try {
    response = await fetchImpl(parsed.url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8"
      }
    });
  } catch (error) {
    return json(res, 502, { ok: false, error: `Seite nicht erreichbar: ${String(error?.message || error).slice(0, 200)}` });
  }

  const finalUrl = String(response.url || parsed.url.toString());
  const finalParsed = parseBrowserTarget(finalUrl);
  if (!finalParsed.ok) return json(res, 400, { ok: false, error: "Redirect auf blockierten Host gestoppt." });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const embeddable = isEmbeddable(response.headers);

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return json(res, 200, {
      ok: true,
      finalUrl,
      status: response.status,
      contentType,
      embeddable,
      html: null,
      title: finalUrl
    });
  }

  let html = "";
  try {
    html = await readCapped(response, MAX_HTML_BYTES);
  } catch (error) {
    return json(res, 502, { ok: false, error: `Seite konnte nicht gelesen werden: ${String(error?.message || error).slice(0, 200)}` });
  }

  // Favicon mitliefern (als data:, weil img-src fremde Adressen sperrt).
  // Ein fehlendes Icon ist KEIN Grund, die Seite nicht zu liefern — deshalb
  // faellt holeFavicon immer auf "" zurueck statt zu werfen, und die eigene
  // Zielpruefung der Route wird hineingereicht (kein zweiter, womoeglich
  // schwaecherer Schutz gegen private Netze).
  const favicon = await holeFavicon(html, finalUrl, { fetchImpl, pruefeZiel: parseBrowserTarget });

  return json(res, 200, {
    ok: true,
    finalUrl,
    status: response.status,
    contentType,
    embeddable,
    favicon,
    title: extractTitle(html) || finalUrl,
    html: rewriteBrowserHtml(html, finalUrl)
  });
}

function isEmbeddable(headers) {
  const xfo = String(headers.get("x-frame-options") || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
  const csp = String(headers.get("content-security-policy") || "").toLowerCase();
  if (csp.includes("frame-ancestors")) return false;
  return true;
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

export function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()).slice(0, 200) : "";
}

// Umschreiben fuer die srcdoc-Darstellung: Scripts/Inline-Handler raus,
// CSP-Metas raus, <base> rein (relative Ressourcen laden vom Original),
// eigenes Navigations-Script rein (Links/Formulare -> postMessage an die App).
export function rewriteBrowserHtml(html, baseUrl) {
  let out = String(html || "");
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<script\b[^>]*\/>/gi, "");
  out = out.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');

  const baseTag = `<base href="${escapeAttribute(baseUrl)}" target="_self">`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
  } else {
    out = `${baseTag}\n${out}`;
  }

  const navScript = buildNavigationScript();
  if (/<\/body\s*>/i.test(out)) {
    out = out.replace(/<\/body\s*>/i, `${navScript}\n</body>`);
  } else {
    out = `${out}\n${navScript}`;
  }
  return out;
}

function buildNavigationScript() {
  return [
    "<script>(function () {",
    '  function go(url) { parent.postMessage({ type: "smejj.browser.navigate", url: String(url) }, "*"); }',
    '  document.addEventListener("click", function (event) {',
    '    var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;',
    "    if (!anchor) return;",
    "    event.preventDefault();",
    "    event.stopPropagation();",
    "    try { go(new URL(anchor.getAttribute(\"href\"), document.baseURI).toString()); } catch (error) {}",
    "  }, true);",
    '  document.addEventListener("submit", function (event) {',
    "    var form = event.target;",
    "    event.preventDefault();",
    "    try {",
    '      var actionUrl = new URL(form.getAttribute("action") || document.baseURI, document.baseURI);',
    '      if ((form.method || "get").toLowerCase() !== "get") return;',
    "      actionUrl.search = new URLSearchParams(new FormData(form)).toString();",
    "      go(actionUrl.toString());",
    "    } catch (error) {}",
    "  }, true);",
    "  // Scrollposition pro Tab: gedrosselt melden und auf Wunsch wiederherstellen.",
    "  var scrollTimer = null;",
    "  function reportScroll() {",
    "    scrollTimer = null;",
    "    var doc = document.scrollingElement || document.documentElement;",
    "    if (!doc) return;",
    "    var max = Math.max(1, doc.scrollHeight - window.innerHeight);",
    '    parent.postMessage({ type: "smejj.browser.scrollState", top: doc.scrollTop, max: max }, "*");',
    "  }",
    '  window.addEventListener("scroll", function () {',
    "    if (scrollTimer) return;",
    "    scrollTimer = setTimeout(reportScroll, 150);",
    "  }, { passive: true });",
    // Suche in der Seite (Cmd+F). Sie MUSS hier drin laufen: der Rahmen ist
    // abgeschottet (sandbox ohne allow-same-origin), von aussen kommt niemand
    // an dieses Dokument. Die Leiste schickt den Suchtext herein, dieses
    // Skript sucht, hebt hervor und meldet die Trefferzahl zurueck.
    // Rechtsklick nach oben melden: der Klick landet im Dokument DIESES
    // Rahmens, unser Panel bekommt ihn sonst nie zu sehen. Die Koordinaten
    // sind fensterbezogen — der Empfaenger rechnet sie um.
    '  document.addEventListener("contextmenu", function (event) {',
    "    event.preventDefault();",
    '    parent.postMessage({ type: "smejj.browser.rechtsklick", x: event.clientX, y: event.clientY }, "*");',
    "  });",
    "  var trefferListe = [];",
    "  function suchAufraeumen() {",
    "    for (var i = 0; i < trefferListe.length; i++) {",
    "      var m = trefferListe[i];",
    "      if (m.parentNode) { m.parentNode.replaceChild(document.createTextNode(m.textContent), m); }",
    "    }",
    "    trefferListe = [];",
    "    document.body && document.body.normalize();",
    "  }",
    "  function suche(text, index) {",
    "    suchAufraeumen();",
    "    if (!text) { parent.postMessage({ type: \"smejj.browser.suchErgebnis\", anzahl: 0, index: 0 }, \"*\"); return; }",
    "    var suchText = String(text).toLowerCase();",
    "    var lauf = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {",
    "      acceptNode: function (n) {",
    "        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;",
    "        var eltern = n.parentNode && n.parentNode.nodeName;",
    "        if (eltern === \"SCRIPT\" || eltern === \"STYLE\" || eltern === \"NOSCRIPT\") return NodeFilter.FILTER_REJECT;",
    "        return n.nodeValue.toLowerCase().indexOf(suchText) === -1 ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;",
    "      }",
    "    });",
    // Erst SAMMELN, dann veraendern: wer waehrend des Laufs Knoten ersetzt,
    // zieht dem TreeWalker den Boden weg und findet nur jeden zweiten Treffer.
    "    var knoten = [];",
    "    var k;",
    "    while ((k = lauf.nextNode()) && knoten.length < 500) knoten.push(k);",
    "    for (var j = 0; j < knoten.length; j++) {",
    "      var n = knoten[j];",
    "      var wert = n.nodeValue;",
    "      var pos = wert.toLowerCase().indexOf(suchText);",
    "      while (pos !== -1 && trefferListe.length < 500) {",
    "        var rest = n.splitText(pos);",
    "        n = rest.splitText(suchText.length);",
    "        var mark = document.createElement(\"mark\");",
    "        mark.className = \"smejj-treffer\";",
    "        mark.style.cssText = \"background:#ffe066;color:#111\";",
    "        rest.parentNode.replaceChild(mark, rest);",
    "        mark.appendChild(rest);",
    "        trefferListe.push(mark);",
    "        wert = n.nodeValue;",
    "        pos = wert.toLowerCase().indexOf(suchText);",
    "      }",
    "    }",
    "    zeigeTreffer(index || 0);",
    "    parent.postMessage({ type: \"smejj.browser.suchErgebnis\", anzahl: trefferListe.length, index: index || 0 }, \"*\");",
    "  }",
    "  function zeigeTreffer(i) {",
    "    for (var x = 0; x < trefferListe.length; x++) {",
    "      trefferListe[x].style.background = x === i ? \"#ff9f1a\" : \"#ffe066\";",
    "    }",
    "    if (trefferListe[i] && trefferListe[i].scrollIntoView) {",
    "      trefferListe[i].scrollIntoView({ block: \"center\" });",
    "    }",
    "  }",
    '  window.addEventListener("message", function (event) {',
    "    var data = event.data || {};",
    '    if (data.type === "smejj.browser.suche") { suche(data.text, data.index); return; }',
    '    if (data.type === "smejj.browser.sucheAus") { suchAufraeumen(); return; }',
    '    if (data.type === "smejj.browser.sucheZeige") { zeigeTreffer(Number(data.index) || 0); return; }',
    '    if (data.type !== "smejj.browser.restoreScroll") return;',
    "    var doc = document.scrollingElement || document.documentElement;",
    "    if (!doc) return;",
    "    var ratio = Math.min(1, Math.max(0, Number(data.ratio) || 0));",
    "    doc.scrollTop = ratio * Math.max(0, doc.scrollHeight - window.innerHeight);",
    "  });",
    "})();</script>"
  ].join("\n");
}

function escapeAttribute(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
