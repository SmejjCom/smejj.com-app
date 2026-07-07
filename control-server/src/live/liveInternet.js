import { SECURITY_HEADERS } from "../../../src/shared/platform.js";

const LIVE_PATTERNS = /\b(aktuell|heute|jetzt|live|internet|quelle|quellen|news|nachrichten|wetter|preis|preise|kurs|oeffnungszeit|oeffnungszeiten|öffnungszeit|öffnungszeiten|webseite|website|url|zusammenfass)\b/i;
const WEATHER_PATTERNS = /\b(wetter|temperatur|regen|wind|vorhersage)\b/i;
const SEARCH_PATTERNS = /\b(news|nachrichten|preis|preise|kurs|oeffnungszeit|oeffnungszeiten|öffnungszeit|öffnungszeiten|aktuell|heute|jetzt|live)\b/i;
const MAX_PAGE_BYTES = 240_000;

export function detectLiveInternetIntent(task = "") {
  const text = String(task || "").trim();
  if (!text) return { live: false, kind: "none" };
  if (isCodingTask(text)) return { live: false, kind: "coding" };
  const url = extractFirstUrl(text);
  if (url) return { live: true, kind: "page", url };
  if (WEATHER_PATTERNS.test(text)) return { live: true, kind: "weather", location: extractWeatherLocation(text) };
  if (SEARCH_PATTERNS.test(text) || LIVE_PATTERNS.test(text)) return { live: true, kind: "search", query: cleanQuery(text) };
  return { live: false, kind: "none" };
}

export async function streamLiveInternetAnswer(res, task, { fetchImpl = fetch, now = new Date() } = {}) {
  const intent = detectLiveInternetIntent(task);
  if (!intent.live) return false;
  const result = await answerLiveIntent(intent, task, { fetchImpl, now }).catch((error) => ({
    ok: false,
    answer: failClosed(String(error?.message || error), now)
  }));
  writeSseText(res, result.answer);
  return true;
}

export async function answerLiveIntent(intent, task, { fetchImpl = fetch, now = new Date() } = {}) {
  if (intent.kind === "weather") return weatherAnswer(intent.location, { fetchImpl, now });
  if (intent.kind === "page") return pageAnswer(intent.url, task, { fetchImpl, now });
  if (intent.kind === "search") return searchAnswer(intent.query, { fetchImpl, now });
  return { ok: false, answer: failClosed("Keine passende Live-Quelle erkannt.", now) };
}

async function weatherAnswer(location, { fetchImpl, now }) {
  const place = String(location || "Berlin").trim();
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=de&format=json`;
  const geo = await fetchJson(geoUrl, fetchImpl);
  const hit = geo.results?.[0];
  if (!hit) return { ok: false, answer: failClosed(`Kein Ort fuer "${place}" gefunden.`, now) };
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(hit.latitude));
  weatherUrl.searchParams.set("longitude", String(hit.longitude));
  weatherUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  weatherUrl.searchParams.set("timezone", "auto");
  const data = await fetchJson(weatherUrl.toString(), fetchImpl);
  const current = data.current || {};
  const daily = data.daily || {};
  const answer = [
    `Aktuelles Wetter fuer ${hit.name}${hit.country ? `, ${hit.country}` : ""}: ${weatherLabel(current.weather_code)}.`,
    `Temperatur: ${fmt(current.temperature_2m)} °C, gefuehlt ${fmt(current.apparent_temperature)} °C.`,
    `Wind: ${fmt(current.wind_speed_10m)} km/h, Niederschlag jetzt: ${fmt(current.precipitation)} mm.`,
    daily.temperature_2m_max?.[0] !== undefined ? `Heute: ${fmt(daily.temperature_2m_min?.[0])} bis ${fmt(daily.temperature_2m_max?.[0])} °C, Regenwahrscheinlichkeit max. ${fmt(daily.precipitation_probability_max?.[0])} %.` : "",
    "",
    `Quelle: Open-Meteo (${weatherUrl.origin}). Stand: ${current.time || iso(now)}.`
  ].filter(Boolean).join("\n");
  return { ok: true, answer };
}

async function pageAnswer(url, task, { fetchImpl, now }) {
  const page = await fetchPage(url, fetchImpl);
  if (!page.ok) return { ok: false, answer: failClosed(page.error, now) };
  return { ok: true, answer: formatPageSummary(page, task, now) };
}

async function searchAnswer(query, { fetchImpl, now }) {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const page = await fetchPage(searchUrl, fetchImpl);
  if (!page.ok) return { ok: false, answer: failClosed(page.error, now) };
  const results = parseDuckDuckGoResults(page.html);
  if (results.length === 0) return { ok: false, answer: failClosed("Keine belastbare Live-Webquelle gefunden.", now) };
  const source = results[0];
  const fetched = await fetchPage(source.url, fetchImpl).catch(() => ({ ok: false }));
  if (fetched.ok) return { ok: true, answer: formatPageSummary({ ...fetched, title: fetched.title || source.title }, query, now) };
  return {
    ok: true,
    answer: [
      `Live-Webtreffer: ${source.title}`,
      source.snippet ? `Kurzinfo: ${source.snippet}` : "",
      "",
      `Quelle: ${source.url}`,
      `Stand: ${iso(now)}`
    ].filter(Boolean).join("\n")
  };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchWithTimeout(url, fetchImpl);
  if (!response.ok) throw new Error(`Live-Quelle antwortet mit HTTP ${response.status}.`);
  return response.json();
}

async function fetchPage(url, fetchImpl) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return { ok: false, error: "Nur http/https-Webseiten sind erlaubt." };
  const response = await fetchWithTimeout(safeUrl, fetchImpl, { headers: { "User-Agent": "smejj.com live internet connector" } });
  if (!response.ok) return { ok: false, error: `Webseite antwortet mit HTTP ${response.status}.` };
  const contentType = String(response.headers?.get?.("content-type") || "");
  if (!/(text\/html|text\/plain|application\/xhtml\+xml|application\/json)/i.test(contentType)) {
    return { ok: false, error: "Quelle ist keine lesbare Text-/HTML-Seite." };
  }
  const html = await readBodyLimited(response, MAX_PAGE_BYTES);
  const text = extractReadableText(html);
  if (!text) return { ok: false, error: "Quelle konnte nicht lesbar extrahiert werden." };
  return { ok: true, url: safeUrl, html, text, title: extractTitle(html) };
}

async function fetchWithTimeout(url, fetchImpl, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyLimited(response, limit) {
  if (!response.body?.getReader) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
  }
  return new TextDecoder().decode(concatChunks(chunks, Math.min(size, limit))).slice(0, limit);
}

function concatChunks(chunks, size) {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk.slice(0, Math.max(0, size - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= size) break;
  }
  return out;
}

function formatPageSummary(page, task, now) {
  const summary = summarizeText(page.text, task);
  return [
    page.title ? `Webseite: ${page.title}` : "Webseite gelesen.",
    summary,
    "",
    `Quelle: ${page.url}`,
    `Stand: ${iso(now)}`
  ].join("\n");
}

function summarizeText(text, task) {
  const terms = cleanQuery(task).toLowerCase().split(/\s+/).filter((part) => part.length > 3).slice(0, 8);
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 40);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    score: terms.reduce((sum, term) => sum + (sentence.toLowerCase().includes(term) ? 2 : 0), 0) - index * 0.01
  })).sort((a, b) => b.score - a.score).slice(0, 3).map((item) => trimSentence(item.sentence));
  const picked = scored.length ? scored : sentences.slice(0, 3).map(trimSentence);
  return picked.map((sentence) => `- ${sentence}`).join("\n").slice(0, 900);
}

function trimSentence(sentence) {
  return sentence.length <= 260 ? sentence : `${sentence.slice(0, 257).trim()}...`;
}

function parseDuckDuckGoResults(html) {
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.map((match) => ({
    url: decodeDuckUrl(stripTags(match[1])),
    title: cleanupText(stripTags(match[2])),
    snippet: cleanupText(stripTags(match[3]))
  })).filter((item) => item.url?.startsWith("http")).slice(0, 5);
}

function decodeDuckUrl(value) {
  try {
    const url = new URL(decodeHtml(value), "https://duckduckgo.com");
    return url.searchParams.get("uddg") || url.href;
  } catch {
    return decodeHtml(value);
  }
}

function extractReadableText(html) {
  return cleanupText(stripTags(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " "))).slice(0, 8000);
}

function extractTitle(html) {
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return cleanupText(stripTags(title)).slice(0, 120);
}

function stripTags(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function cleanupText(value) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function extractFirstUrl(text) {
  return String(text).match(/https?:\/\/[^\s)]+/i)?.[0] || "";
}

function extractWeatherLocation(text) {
  const match = String(text).match(/\b(?:wetter|temperatur|vorhersage)\s+(?:in|fuer|für)?\s*([^?.,!]+)/i);
  return cleanupText(match?.[1] || "Berlin").replace(/\b(heute|jetzt|aktuell)\b/gi, "").trim() || "Berlin";
}

function cleanQuery(text) {
  return cleanupText(String(text).replace(/https?:\/\/[^\s)]+/gi, ""));
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isCodingTask(text) {
  return /\b(code|coding|funktion|function|klasse|class|javascript|typescript|python|bug|patch|diff|repo|datei|test)\b/i.test(text) && !LIVE_PATTERNS.test(text);
}

function fmt(value) {
  return value === undefined || value === null ? "n/a" : String(Math.round(Number(value) * 10) / 10);
}

function iso(now) {
  return new Date(now).toISOString();
}

function weatherLabel(code) {
  const labels = { 0: "klar", 1: "ueberwiegend klar", 2: "teilweise bewoelkt", 3: "bewoelkt", 45: "neblig", 48: "Reifnebel", 51: "leichter Nieselregen", 61: "leichter Regen", 63: "Regen", 65: "starker Regen", 71: "leichter Schnee", 80: "Regenschauer", 95: "Gewitter" };
  return labels[Number(code)] || `Wettercode ${code ?? "unbekannt"}`;
}

function failClosed(reason, now) {
  return [
    "Ich konnte keine belastbaren Live-Internetdaten abrufen.",
    `Grund: ${reason}`,
    "Ich erfinde keine aktuellen Informationen. Bitte versuche es erneut oder gib eine konkrete URL/Quelle an.",
    "",
    `Stand: ${iso(now)}`
  ].join("\n");
}

function writeSseText(res, text) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "x-smejj-live-internet": "true"
  });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}
