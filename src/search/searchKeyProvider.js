// smejj.com — Suchquelle mit Schluessel (BYOK), fail-closed und mit Deckel.
//
// WARUM ES DIESE DATEI GIBT (Messung 2026-08-04, live aus dem Salad-Container):
// Die kostenlosen Quellen ohne Schluessel antworten dem Rechenzentrum nicht mehr.
//   - html/lite.duckduckgo.com -> HTTP 202 mit Sperrseite, JEDE Anfrage
//   - www.bing.com             -> HTTP 200 mit ABSICHTLICHEN Taeuschtreffern
//     (brasilianische Motorrad-Preistabellen auf "Schlagzeilen Berlin",
//      Tom-Hanks-Filmografie auf "Öffnungszeiten Zoo Berlin")
// Vier von sechs Standardfragen lieferten null Treffer. Mojeek, Marginalia,
// Brave-HTML und acht oeffentliche SearXNG-Instanzen wurden geprueft und fielen
// aus. Ohne Quelle mit Schluessel gibt es keine verlaessliche Websuche.
//
// ANBIETERWAHL (Betreiber-Freigabe 2026-08-04, Konditionen am selben Tag geprueft):
//   - Brave Search API: Gratiskontingent im Februar 2026 ABGESCHAFFT, Karte
//     pflicht, metered. Waere eine echte Kostenposition -> ausgeschieden.
//   - Google Custom Search: fuer Neukunden geschlossen, Abschaltung 2027-01-01
//     -> ausgeschieden.
//   - Tavily: 1000 Credits/Monat gratis, KEINE Karte noetig -> gewaehlt.
//
// KOSTENSCHUTZ, doppelt:
//   1. Der Betreiber hinterlegt bei Tavily KEINE Zahlungsart. Ohne Karte kann
//      dort nichts abgerechnet werden — das ist die eigentliche Garantie.
//   2. Dieses Modul zaehlt mit und macht bei SMEJJ_SEARCH_API_MONTHLY_MAX dicht
//      (Standard 900 von 1000). Der Zaehler liegt im Arbeitsspeicher und faellt
//      bei einem Neustart auf null zurueck — er ist die ZWEITE Linie, nicht die
//      erste. Genau deshalb ist Punkt 1 nicht verhandelbar.
//
// FAIL-CLOSED IN BEIDE RICHTUNGEN: Ohne Schluessel passiert hier gar nichts
// (kein Netzaufruf, keine Kosten), und der bisherige Weg laeuft unveraendert
// weiter. Ein Fehler des Anbieters liefert ein leeres Ergebnis, nie einen Abbruch.

import { regionSearchParams } from "./searchRegion.js";

const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_MONTHLY_MAX = 900;
const MAX_RESULTS = 20;

/**
 * Anbieter-Register. Ein weiterer Anbieter ist ein zusaetzlicher Eintrag —
 * `envKey` sagt, woher der Schluessel kommt, `suche` macht den Aufruf.
 * Reihenfolge = Vorrang.
 */
export const KEY_PROVIDERS = Object.freeze([
  Object.freeze({
    name: "tavily",
    envKey: "SMEJJ_SEARCH_TAVILY_API_KEY",
    // Erkennbares Praefix: ein versehentlich falsch eingefuegter Wert (etwa ein
    // Modell-Schluessel) faellt sofort auf, statt erst beim ersten 401.
    keyPattern: /^tvly-[A-Za-z0-9_-]{8,}$/,
    suche: tavilySuche
  })
]);

/**
 * Welcher Anbieter ist konfiguriert? Ohne gueltigen Schluessel: null.
 * @param {object} env Umgebung.
 * @returns {{name:string, apiKey:string}|null}
 */
export function configuredKeyProvider(env = process.env) {
  for (const anbieter of KEY_PROVIDERS) {
    const key = String(env[anbieter.envKey] || "").trim();
    if (key && anbieter.keyPattern.test(key)) return { name: anbieter.name, apiKey: key, anbieter };
  }
  return null;
}

/** Ist ueberhaupt eine Schluesselquelle scharf? Fuer Statusanzeigen. */
export function keyProviderConfigured(env = process.env) {
  return configuredKeyProvider(env) !== null;
}

// Verbrauchszaehler pro Kalendermonat. Wechselt der Monat, faengt er neu an.
const verbrauch = { monat: "", anzahl: 0 };

/** Nur fuer Tests: Zaehler zuruecksetzen. */
export function resetKeyProviderBudget() {
  verbrauch.monat = "";
  verbrauch.anzahl = 0;
}

/** Aktueller Verbrauchsstand — fuer /api/health und die Betriebsanzeige. */
export function keyProviderUsage(env = process.env) {
  return {
    monat: verbrauch.monat,
    verbraucht: verbrauch.anzahl,
    deckel: monatsDeckel(env),
    konfiguriert: keyProviderConfigured(env)
  };
}

function monatsDeckel(env) {
  const roh = Number(env.SMEJJ_SEARCH_API_MONTHLY_MAX);
  if (!Number.isFinite(roh) || roh < 0) return DEFAULT_MONTHLY_MAX;
  return Math.min(Math.floor(roh), 100_000);
}

function monatsSchluessel(jetzt) {
  return `${jetzt.getUTCFullYear()}-${String(jetzt.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Zaehlt eine Anfrage. Gibt false zurueck, wenn der Deckel erreicht ist.
function budgetNehmen(env, jetzt) {
  const monat = monatsSchluessel(jetzt);
  if (verbrauch.monat !== monat) {
    verbrauch.monat = monat;
    verbrauch.anzahl = 0;
  }
  if (verbrauch.anzahl >= monatsDeckel(env)) return false;
  verbrauch.anzahl += 1;
  return true;
}

/**
 * Sucht ueber die konfigurierte Schluesselquelle.
 *
 * @param {string} query Suchbegriff.
 * @param {{limit?:number, region?:string, env?:object, fetchImpl?:Function, now?:Date}} [options]
 * @returns {Promise<{results:Array, status:string, source:string}>}
 *   status: "ok" | "kein schluessel" | "budget erschoepft" | "leer" | "fehler"
 */
export async function searchWithKey(query, options = {}) {
  const env = options.env || process.env;
  const gewaehlt = configuredKeyProvider(env);
  // Ohne Schluessel passiert nichts: kein Netzaufruf, keine Kosten, kein Fehler.
  if (!gewaehlt) return { results: [], status: "kein schluessel", source: "" };

  const begriff = String(query || "").trim();
  if (!begriff) return { results: [], status: "leer", source: gewaehlt.name };

  if (!budgetNehmen(env, options.now || new Date())) {
    return { results: [], status: "budget erschoepft", source: gewaehlt.name };
  }

  try {
    const treffer = await gewaehlt.anbieter.suche(begriff, {
      apiKey: gewaehlt.apiKey,
      limit: Math.min(Math.max(Number(options.limit) || 8, 1), MAX_RESULTS),
      params: regionSearchParams(options.region),
      fetchImpl: options.fetchImpl || fetch
    });
    if (!Array.isArray(treffer) || treffer.length === 0) {
      return { results: [], status: "leer", source: gewaehlt.name };
    }
    return { results: treffer, status: "ok", source: gewaehlt.name };
  } catch (error) {
    // Fail-safe: Der Aufrufer faellt auf die kostenlosen Quellen zurueck.
    return { results: [], status: `fehler: ${String(error?.message || error).slice(0, 120)}`, source: gewaehlt.name };
  }
}

/**
 * Tavily: POST https://api.tavily.com/search, Bearer-Schluessel.
 * `country` erwartet den ausgeschriebenen Landesnamen in Kleinbuchstaben
 * ("united states"), NICHT das Kuerzel — ein Kuerzel wird still ignoriert.
 * `search_depth: "basic"` kostet 1 Credit, "advanced" kostet 2 — bewusst basic.
 */
async function tavilySuche(query, { apiKey, limit, params, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const rumpf = {
      query,
      max_results: limit,
      search_depth: "basic",
      topic: "general",
      include_answer: false,
      include_raw_content: false
    };
    if (params.country) rumpf.country = params.country;
    const antwort = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(rumpf)
    });
    if (!antwort.ok) {
      const text = await antwort.text().catch(() => "");
      throw new Error(`HTTP ${antwort.status} ${text.slice(0, 100)}`);
    }
    return normalisiereTavily(await antwort.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tavily-Antwort in unser Ergebnisformat wandeln (rein, testbar).
 * Nur https-Ziele; dieselbe Grundregel wie bei den kostenlosen Quellen.
 */
export function normalisiereTavily(data) {
  const zeilen = Array.isArray(data && data.results) ? data.results : [];
  const out = [];
  for (const zeile of zeilen) {
    const url = String((zeile && zeile.url) || "").trim();
    const title = String((zeile && zeile.title) || "").replace(/\s+/g, " ").trim();
    if (!url.startsWith("https://") || !title) continue;
    out.push({
      title,
      url,
      snippet: String((zeile && zeile.content) || "").replace(/\s+/g, " ").trim().slice(0, 400)
    });
  }
  return out;
}
