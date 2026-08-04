// smejj.com — Live-Internet-Suche, fail-closed und in dieser Reihenfolge:
//   1. Quelle mit Schluessel (BYOK, src/search/searchKeyProvider.js) — nur wenn
//      der Betreiber einen Schluessel hinterlegt hat. Gratiskontingent, kein
//      Zahlungsmittel hinterlegt, zusaetzlich ein Monatsdeckel im Code.
//   2. SearXNG, falls ein eigener Endpunkt gesetzt ist (frei, kein Schluessel).
//   3. DuckDuckGo HTML, DuckDuckGo Lite, Bing HTML — frei, ohne Schluessel.
//
// Stufe 3 ist seit dem 2026-08-04 aus dem Rechenzentrum praktisch tot
// (DuckDuckGo HTTP 202 Sperrseite, Bing absichtliche Taeuschtreffer) und bleibt
// nur als Rueckfall stehen. Ohne Schluessel verhaelt sich alles wie vorher —
// Stufe 1 macht dann keinen einzigen Netzaufruf.
//
// Sicherheit unveraendert: nur https, keine privaten Ziele (SSRF-Schutz), harte
// Timeouts, begrenzte Antwortgroessen. Fehler ergeben leere Resultate, nie Abbruch.
// Ergebnisse werden kurz gecacht (TTL), damit identische Anfragen die Suchmaschinen
// nicht wiederholt treffen (Schutz vor Blocking, schnellere Antworten).
import { createTtlCache } from "./searchCache.js";
// Lokal gebraucht fuer resultsLookRelevant. Ein blosser Re-Export (unten)
// stellt den Namen in dieser Datei NICHT bereit — deshalb zusaetzlich importiert.
import { normalizeForIntent } from "./searchIntent.js";
// WO gesucht wird, ist eine eigene Entscheidung und liegt in einem eigenen Modul.
import { DEFAULT_REGION, detectSearchRegion, normalizeRegion, regionSearchParams } from "./searchRegion.js";
// Quelle mit Schluessel (BYOK). Eigenes Modul: sie hat eine andere Kostenlage
// und ein eigenes Budget-Gate — das gehoert nicht in die Scraping-Logik.
import { keyProviderConfigured, keyProviderUsage, searchWithKey } from "./searchKeyProvider.js";

const SEARCH_CACHE_TTL_MS = 600000;
const searchResultCache = createTtlCache({ ttlMs: SEARCH_CACHE_TTL_MS, maxEntries: 500 });

// Nur fuer Tests: Cache leeren, damit Faelle deterministisch bleiben.
export function clearSearchCache() {
  searchResultCache.clear();
}

// SearXNG (optional, konfigurierbar): bevorzugte JSON-Quelle, wenn ein eigener
// SearXNG-Endpunkt gesetzt ist (open-source, kostenlos, kein Key). Standard ist AUS
// (leerer String) -> Verhalten identisch zu vorher (DuckDuckGo/Bing). Fail-safe:
// leeres/fehlerhaftes Ergebnis faellt automatisch auf die HTML-Suche zurueck.
const SEARXNG_URL = String((globalThis.process && globalThis.process.env && globalThis.process.env.SMEJJ_SEARXNG_URL) || "").trim().replace(/\/+$/, "");

const SEARCH_TIMEOUT_MS = 8000;
const PAGE_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 600000;
const MAX_EXCERPT_CHARS = 2200;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 smejj-live-search";
// Rueckfall-Sprachkopf, wenn eine Anfrage ohne Region hereinkommt (Seitenabruf).
const DEFAULT_ACCEPT_LANGUAGE = regionSearchParams(DEFAULT_REGION).accept;

const PRIVATE_HOST_PATTERN = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1)/i;

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, String.fromCharCode(34))
    .replace(/&#x27;/g, String.fromCharCode(39))
    .replace(/&#39;/g, String.fromCharCode(39))
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

// Werbe-/Redirect-Links der Suchmaschinen (keine echten Treffer) aussortieren.
const AD_URL_PATTERN = /(duckduckgo\.com\/y\.js|\/aclick|bing\.com\/aclk|duckduckgo\.com\/l\/|ad_provider=|ad_domain=)/i;

export function isAdOrRedirectUrl(target) {
  return AD_URL_PATTERN.test(String(target || ""));
}

export function isSafePublicUrl(target) {
  let parsed;
  try { parsed = new URL(target); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) return false;
  if (isAdOrRedirectUrl(target)) return false;
  return true;
}

async function fetchText(target, timeoutMs, acceptLanguage = DEFAULT_ACCEPT_LANGUAGE) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        // Frueher fest "de,en;q=0.8". Genau dieser Kopf hat die Suche nach einem
        // Buero im Silicon Valley auf deutsche Immobilienportale gelenkt.
        "Accept-Language": acceptLanguage,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      }
    });
    if (!response.ok) return "";
    const type = String(response.headers.get("content-type") || "");
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return "";
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) return (await response.text()).slice(0, MAX_BODY_BYTES);
    const chunks = [];
    let received = 0;
    while (received < MAX_BODY_BYTES) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
      received += part.value.length;
    }
    try { await reader.cancel(); } catch { /* Stream bereits beendet */ }
    let merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(merged.slice(0, MAX_BODY_BYTES));
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function resolveDuckDuckGoLink(href) {
  const raw = decodeEntities(String(href || ""));
  if (raw.includes("duckduckgo.com/l/")) {
    const match = raw.match(/[?&]uddg=([^&]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch { return ""; }
  }
  if (raw.startsWith("http")) return raw;
  return "";
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  const linkPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets = [];
  let match;
  while ((match = snippetPattern.exec(html)) !== null) snippets.push(stripTags(match[1]));
  let index = 0;
  while ((match = linkPattern.exec(html)) !== null) {
    const url = resolveDuckDuckGoLink(match[1]);
    const title = stripTags(match[2]);
    if (url && title && isSafePublicUrl(url)) {
      results.push({ title, url, snippet: snippets[index] || "" });
    }
    index += 1;
  }
  return results;
}

function parseDuckDuckGoLite(html) {
  const results = [];
  const pattern = /<a[^>]+href="([^"]+)"[^>]*class=.result-link.[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = resolveDuckDuckGoLink(match[1]);
    const title = stripTags(match[2]);
    if (url && title && isSafePublicUrl(url)) results.push({ title, url, snippet: "" });
  }
  return results;
}

// Bing verpackt organische Treffer in /ck/a-Redirects (u=a1<base64url>).
// Wir dekodieren auf die echte Ziel-URL; ohne dekodierbare URL wird der Treffer verworfen.
export function resolveBingLink(href) {
  const raw = decodeEntities(String(href || ""));
  if (/bing\.[a-z.]+\/ck\/a/i.test(raw)) {
    const match = raw.match(/[?&]u=a1([^&"]+)/);
    if (!match) return "";
    try {
      const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const decoded = Buffer.from(padded, "base64").toString("utf8");
      return decoded.startsWith("http") ? decoded : "";
    } catch { return ""; }
  }
  if (raw.startsWith("http")) return raw;
  return "";
}

export function parseBingHtml(html) {
  const results = [];
  const pattern = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<li class="b_algo"|<\/ol>|$)/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = resolveBingLink(match[1]);
    const title = stripTags(match[2]);
    const caption = match[3].match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = caption ? stripTags(caption[1]) : "";
    if (title && isSafePublicUrl(url)) results.push({ title, url, snippet });
  }
  return results;
}

// SearXNG-JSON-Antwort in unser Ergebnisformat wandeln (rein, testbar).
// Wendet denselben SSRF-/Ad-Filter an wie die HTML-Quellen (isSafePublicUrl).
export function parseSearxngResults(data, limit = 8) {
  const rows = Array.isArray(data && data.results) ? data.results : [];
  const out = [];
  for (const row of rows) {
    const url = String((row && row.url) || "");
    const title = stripTags(String((row && row.title) || ""));
    if (url && title && isSafePublicUrl(url)) {
      out.push({ title, url, snippet: stripTags(String((row && row.content) || "")) });
    }
    if (out.length >= limit) break;
  }
  return out;
}

// Konfigurierten SearXNG-Endpunkt abfragen (JSON). Trusted Operator-Config:
// die Basis-URL darf http/https sein; Ergebnis-URLs bleiben SSRF-gefiltert.
async function searxngJson(query, limit, params) {
  if (!SEARXNG_URL) return [];
  let base;
  try {
    base = new URL(SEARXNG_URL);
    if (base.protocol !== "https:" && base.protocol !== "http:") return [];
  } catch {
    return [];
  }
  const target = SEARXNG_URL + "/search?format=json&language=" + encodeURIComponent(params.lang)
    + "&safesearch=1&q=" + encodeURIComponent(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return parseSearxngResults(data, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Wortarten ohne Aussagekraft — sie duerfen einen Treffer nicht rechtfertigen.
const STOPWOERTER = new Set([
  "was", "wer", "wie", "wo", "wann", "warum", "welche", "welcher", "welches",
  "sind", "ist", "war", "waren", "gibt", "hat", "habe", "haben", "kann", "kannst",
  "die", "der", "das", "den", "dem", "des", "ein", "eine", "einen", "einem",
  "und", "oder", "aber", "auch", "nicht", "mir", "mich", "dir", "sich", "aus",
  "von", "vom", "fuer", "mit", "bei", "auf", "ueber", "unter", "nach", "zum",
  "zur", "bitte", "danke", "hier", "there", "what", "which", "where", "when",
  "the", "and", "for", "with", "about", "from", "you", "are", "can", "please"
]);

// Traegt das Ergebnis ueberhaupt etwas zur Frage bei?
//
// Befund 2026-07-29: Als DuckDuckGo und Bing die Server-IP sperrten, lieferte
// der HTML-Fallback keine leere Liste, sondern **themenfremde** Treffer — auf
// "Schlagzeilen Berlin" kamen Musical-Seiten aus Madrid, auf "Verspaetung
// S-Bahn" Reddit-Threads ueber Anime. Weil `results.length > 0` galt, wurden
// sie akzeptiert, zwischengespeichert und dem Modell als "Live-Internet-
// Kontext" vorgelegt. Eine gesperrte Suchmaschine sah damit aus wie eine
// erfolgreiche Recherche.
//
// Regel: Mindestens ein aussagekraeftiges Wort der Anfrage (ab 4 Zeichen, kein
// Stoppwort) muss in Titel, Adresse oder Auszug eines Treffers vorkommen. Sonst
// gilt die Quelle als gescheitert und die naechste wird versucht. Fail-closed:
// lieber kein Kontext als falscher Kontext — ohne Kontext sagt das Modell
// ehrlich, dass es nichts gefunden hat, statt Fremdes zu verwerten.
// Nachschaerfung 2026-08-04 (live nachgemessen): Ein einziges gemeinsames Wort
// reichte als Beleg. Auf "office condo for sale San Jose CA" lieferte die Suche
// acht Treffer — alle microsoft.com/office.com auf Spanisch. Sie kamen durch,
// weil "office" vorkam. Deshalb gilt jetzt: ab drei pruefbaren Begriffen muessen
// ZWEI davon in DEMSELBEN Treffer stehen. Bei ein bis zwei Begriffen bleibt es
// bei einem Treffer — sonst wuerde "Zoo Berlin" faelschlich verworfen.
/**
 * Behaelt nur die Treffer, die wirklich zur Anfrage gehoeren.
 *
 * Befund 2026-08-04 (live, zweiter Durchlauf): Auf "commercial office for sale
 * Santa Clara" lieferte Bing acht Treffer — darunter LoopNet und Crexi (richtig),
 * aber auch "COMMERCIAL Definition & Meaning – Merriam-Webster", das Cambridge
 * Dictionary und eine TV-Werbeseite. Alle acht gingen ans Modell.
 *
 * Ursache war NICHT der Schwellwert, sondern die Bauart: `resultsLookRelevant`
 * war ein Tor fuer die GANZE Liste (`results.some`). Ein einziger guter Treffer
 * machte die Liste gueltig — und der Muell fuhr als blinder Passagier mit.
 * Jeder Treffer wird jetzt einzeln geprueft.
 *
 * @param {string} query Suchbegriff.
 * @param {Array} results Rohe Trefferliste.
 * @returns {Array} nur die passenden Treffer, Reihenfolge unveraendert.
 */
export function relevanteTreffer(query, results) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const begriffe = normalizeForIntent(query)
    .split(/[^a-z0-9]+/)
    .filter((wort) => wort.length >= 4 && !STOPWOERTER.has(wort));
  // Ohne pruefbare Begriffe (z. B. reine Zahlen) nicht filtern — sonst wuerden
  // gueltige Suchen faelschlich verworfen.
  if (begriffe.length === 0) return results.slice();
  const noetig = begriffe.length >= 3 ? 2 : 1;
  return results.filter((eintrag) => {
    const heuhaufen = normalizeForIntent(
      String(eintrag?.title || "") + " " + String(eintrag?.url || "") + " " + String(eintrag?.snippet || "")
    );
    let getroffen = 0;
    for (const wort of begriffe) {
      if (heuhaufen.includes(wort)) getroffen += 1;
      if (getroffen >= noetig) return true;
    }
    return false;
  });
}

/**
 * Traegt die Liste ueberhaupt etwas zur Anfrage bei? Das Tor bleibt unveraendert:
 * ein einziger passender Treffer genuegt, damit die Quelle als brauchbar gilt.
 * Was danach weitergereicht wird, entscheidet `relevanteTreffer` je Eintrag.
 */
export function resultsLookRelevant(query, results) {
  if (!Array.isArray(results) || results.length === 0) return false;
  return relevanteTreffer(query, results).length > 0;
}

/**
 * Sucht live im Internet.
 *
 * Der Markt (`region`) ist seit 2026-08-04 ein ECHTER Parameter und wird an alle
 * drei kostenlosen Quellen durchgereicht — vorher stand "de" fest im Code, und
 * zwar dreifach: `kl=de-de`, `setlang=de` und im `Accept-Language`-Kopf. Wird
 * keine Region uebergeben, wird sie aus dem Fragetext erkannt; erkennt auch das
 * nichts, bleibt es beim bisherigen Standard (kein Rueckschritt).
 *
 * Zweite Aenderung am selben Tag: `lite.duckduckgo.com` bekam ueberhaupt keinen
 * Regionsparameter. Ohne ihn antwortet DuckDuckGo nach der IP des Servers — der
 * Salad-Container steht nicht in Deutschland, und genau dort kamen spanische
 * Microsoft-Seiten als Immobilientreffer heraus.
 *
 * @param {string} query Suchbegriff (kurz halten, siehe buildSearchQuery).
 * @param {{limit?:number, region?:string}} [options]
 * @returns {Promise<Array<{title:string,url:string,snippet:string}>>}
 */
export async function searchWeb(query, options) {
  return (await searchWebDetailed(query, options)).results;
}

/**
 * Wie `searchWeb`, liefert zusaetzlich aber den Zustand jeder Quelle.
 *
 * Warum das noetig wurde (Messung 2026-08-04): Live lieferten vier von sechs
 * Standardfragen null Treffer — ohne dass irgendwo sichtbar gewesen waere,
 * WARUM. DuckDuckGo antwortet auf Anfragen aus dem Rechenzentrum mit HTTP 202
 * und einer Sperrseite (kein Fehler, kein leeres Ergebnis: eine Seite ohne
 * Treffer), Bing antwortet mit HTTP 200 und themenfremden Zufallstreffern.
 * Beide Faelle sahen von aussen aus wie "nichts gefunden". Der Zustand jeder
 * Quelle gehoert deshalb ins Ergebnis, nicht in eine Vermutung.
 *
 * @param {string} query Suchbegriff.
 * @param {{limit?:number, region?:string}} [options]
 * @returns {Promise<{results:Array, region:string, source:string, cached:boolean, attempts:Array}>}
 */
export async function searchWebDetailed(query, options) {
  const settings = options || {};
  const limit = Math.min(Math.max(Number(settings.limit) || 5, 1), 10);
  const trimmed = String(query || "").trim().slice(0, 300);
  if (!trimmed) return { results: [], region: DEFAULT_REGION, source: "", cached: false, attempts: [] };
  const params = regionSearchParams(normalizeRegion(settings.region) || detectSearchRegion(trimmed));
  // Der Markt gehoert in den Cache-Schluessel: dieselbe Frage liefert je nach
  // Region andere Treffer, und ein gemeinsamer Eintrag wuerde sie vermischen.
  const cacheKey = trimmed.toLowerCase() + "|" + limit + "|" + params.region;
  const cached = searchResultCache.get(cacheKey);
  if (cached) return { results: cached.slice(), region: params.region, source: "cache", cached: true, attempts: [] };
  const attempts = [];
  // ERSTE Stufe: Quelle mit Schluessel (BYOK), falls konfiguriert. Sie steht
  // vorn, weil die kostenlosen Quellen dem Rechenzentrum seit 2026-08-04 nicht
  // mehr antworten (DuckDuckGo HTTP 202 Sperrseite, Bing Taeuschtreffer).
  // Ohne Schluessel passiert hier nichts — kein Netzaufruf, keine Kosten, und
  // der bisherige Weg laeuft unveraendert weiter.
  const mitSchluessel = await searchWithKey(trimmed, { limit, region: params.region });
  if (mitSchluessel.status !== "kein schluessel") {
    // Je Treffer filtern, nicht die Liste als Ganzes durchwinken: ein guter
    // Treffer darf keine themenfremden mitziehen (Befund 2026-08-04).
    const passend = relevanteTreffer(trimmed, mitSchluessel.results);
    const brauchbar = passend.length > 0;
    attempts.push({
      source: mitSchluessel.source,
      parsed: mitSchluessel.results.length,
      kept: passend.length,
      status: brauchbar ? "ok" : mitSchluessel.results.length ? "themenfremd" : mitSchluessel.status
    });
    if (brauchbar) {
      const begrenzt = passend.slice(0, limit);
      searchResultCache.set(cacheKey, begrenzt);
      return { results: begrenzt.slice(), region: params.region, source: mitSchluessel.source, cached: false, attempts };
    }
  }
  // Bevorzugt SearXNG (falls konfiguriert), sonst HTML-Suchmaschinen als Fallback.
  if (SEARXNG_URL) {
    const sx = await searxngJson(trimmed, limit, params);
    const passendSx = relevanteTreffer(trimmed, sx);
    const brauchbar = passendSx.length > 0;
    attempts.push({ source: "searxng", parsed: sx.length, kept: passendSx.length, status: brauchbar ? "ok" : sx.length ? "themenfremd" : "leer" });
    if (brauchbar) {
      const begrenztSx = passendSx.slice(0, limit);
      searchResultCache.set(cacheKey, begrenztSx);
      return { results: begrenztSx.slice(), region: params.region, source: "searxng", cached: false, attempts };
    }
  }
  for (const attempt of searchAttempts(trimmed, params)) {
    const html = await fetchText(attempt.url, SEARCH_TIMEOUT_MS, params.accept);
    if (!html) {
      attempts.push({ source: attempt.source, parsed: 0, status: "keine antwort" });
      continue;
    }
    if (looksBlocked(html)) {
      attempts.push({ source: attempt.source, parsed: 0, status: "gesperrt" });
      continue;
    }
    const results = attempt.parse(html);
    // Eine gesperrte Suchmaschine liefert Treffer, die nichts mit der Anfrage
    // zu tun haben. Solche Quellen gelten als gescheitert — es wird die naechste
    // versucht, nicht Muell gecacht.
    //
    // Je Treffer filtern, nicht die Liste als Ganzes durchwinken: Bing lieferte
    // am 2026-08-04 auf "commercial office for sale Santa Clara" LoopNet UND das
    // Merriam-Webster-Woerterbuch. Ein guter Treffer machte die Liste gueltig,
    // und der Muell fuhr als blinder Passagier zum Modell mit.
    const passendeTreffer = relevanteTreffer(trimmed, results);
    if (passendeTreffer.length > 0) {
      const limited = passendeTreffer.slice(0, limit);
      attempts.push({ source: attempt.source, parsed: results.length, kept: passendeTreffer.length, status: "ok" });
      searchResultCache.set(cacheKey, limited);
      return { results: limited.slice(), region: params.region, source: attempt.source, cached: false, attempts };
    }
    attempts.push({ source: attempt.source, parsed: results.length, kept: 0, status: results.length ? "themenfremd" : "leer" });
  }
  return { results: [], region: params.region, source: "", cached: false, attempts };
}

// Sperrseiten erkennen. DuckDuckGo antwortet aus Rechenzentren mit HTTP 202 und
// einer rund 14 KB grossen Hinweisseite — ohne diese Pruefung sieht eine Sperre
// aus wie ein Suchergebnis ohne Treffer, und niemand kann die Ursache sehen.
export function looksBlocked(html) {
  const text = String(html || "");
  if (text.length > 40_000) return false;
  return /anomaly|unusual traffic|are you a robot|captcha|access denied|blocked/i.test(text);
}

/**
 * Baut die Abfrage-Adressen der drei kostenlosen Quellen fuer einen Markt.
 * Ausgelagert und exportiert, damit die Regionsparameter ohne Netzwerkzugriff
 * pruefbar sind — ein fehlender Parameter faellt sonst erst live auf.
 * @param {string} query Suchbegriff.
 * @param {{ddg:string,cc:string,lang:string}} params Regionsparameter.
 */
export function searchAttempts(query, params) {
  const encoded = encodeURIComponent(query);
  return [
    { source: "duckduckgo-html", url: "https://html.duckduckgo.com/html/?q=" + encoded + "&kl=" + params.ddg, parse: parseDuckDuckGoHtml },
    { source: "duckduckgo-lite", url: "https://lite.duckduckgo.com/lite/?q=" + encoded + "&kl=" + params.ddg, parse: parseDuckDuckGoLite },
    {
      source: "bing",
      url: "https://www.bing.com/search?q=" + encoded + "&setlang=" + params.lang + "&cc=" + params.cc,
      parse: parseBingHtml
    }
  ];
}

// Prueft, ob ein Text ueberwiegend Fliesstext (Prosa) ist und nicht Roh-Markup,
// JSON- oder Menue-Fragmente. Verhindert, dass unlesbare Auszuege ins Modell gelangen.
export function looksLikeProse(text) {
  const value = String(text || "").trim();
  if (value.length < 40) return false;
  const markup = (value.match(/[{}\[\]|<>]|":"|"wt"/g) || []).length;
  const words = value.split(/\s+/).length;
  return markup / Math.max(words, 1) < 0.06;
}

export async function fetchPageExcerpt(target) {
  if (!isSafePublicUrl(target)) return "";
  const html = await fetchText(target, PAGE_TIMEOUT_MS);
  if (!html) return "";
  // Nur den Body, ohne Navigation/Kopf-/Fusszeilen/Seitenleisten/Formulare.
  const body = html
    .replace(/^[\s\S]*?<body[^>]*>/i, " ")
    .replace(/<\/body>[\s\S]*$/i, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
  // Reste von Wiki-/Template-Markup entfernen, dann Text extrahieren.
  const text = stripTags(body)
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT_CHARS);
  // Unlesbare (markuplastige) Auszuege verwerfen -> Modell nutzt dann Titel/Snippet.
  return looksLikeProse(text) ? text : "";
}

// Die Absichtserkennung (wann ueberhaupt gesucht wird) liegt in einem eigenen
// Modul: sie ist reine Textlogik, dieses Modul macht Netzwerk-I/O. Getrennt,
// weil die Absichtsregeln sich haeufig aendern und einzeln testbar bleiben
// muessen (Single Responsibility). Re-Export haelt bestehende Importe gueltig.
export { shouldSearchWeb, normalizeForIntent } from "./searchIntent.js";

// Dasselbe Prinzip fuer die Region und den Suchbegriff: eigene Module, hier nur
// weitergereicht, damit Aufrufer eine einzige Anlaufstelle behalten.
export { buildSearchQuery, detectSearchRegion, normalizeRegion, regionSearchParams, SEARCH_REGIONS } from "./searchRegion.js";
export { keyProviderConfigured, keyProviderUsage } from "./searchKeyProvider.js";

// Snippet aufraeumen: Pipe-/Menue-Ketten und Navigationsreste entschaerfen, kuerzen.
// So bekommt das Modell weniger Roh-Ticker-Text zum Wiedergeben (bessere Zusammenfassung).
export function cleanSnippet(text) {
  return String(text || "")
    .replace(/\s*[|›»·•]\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:\s-\s){2,}/g, " - ")
    .trim()
    .slice(0, 220);
}

export async function buildWebContextBlock(query, options) {
  try {
    const settings = options || {};
    const results = await searchWeb(query, { limit: settings.maxResults || 5, region: settings.region });
    if (results.length === 0) return "";
    const lines = results.map(function (result, index) {
      const head = (index + 1) + ". " + result.title;
      const src = "   " + result.url;
      const snippet = cleanSnippet(result.snippet);
      return snippet ? head + "\n" + src + "\n   " + snippet : head + "\n" + src;
    });
    const excerpts = [];
    const pageCount = Math.min(settings.withPages === undefined ? 2 : settings.withPages, results.length);
    for (let index = 0; index < pageCount; index += 1) {
      const excerpt = await fetchPageExcerpt(results[index].url);
      if (excerpt) excerpts.push("Auszug aus " + results[index].url + ":\n" + excerpt);
    }
    const header = "Live-Internet-Kontext (Websuche vom " + new Date().toISOString() + "):";
    return [header, lines.join("\n")].concat(excerpts).join("\n\n");
  } catch {
    return "";
  }
}
