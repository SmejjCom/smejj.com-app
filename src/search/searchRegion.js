// smejj.com — WO und WONACH gesucht wird (Suchregion und Suchanfrage).
//
// Befund 2026-08-04 (Betreiber-Meldung, live nachgemessen): Auf die Frage nach
// einem Buero im Silicon Valley kamen ImmobilienScout24 und immobilo.de. Das war
// kein Modellfehler, sondern eine Zeile Code: `webSearch.js` haengte an JEDE
// Anfrage `kl=de-de` bzw. `setlang=de` und schickte fest
// `Accept-Language: de,en;q=0.8`. Die Sprache des Fragenden bestimmte damit den
// Markt — obwohl der Markt in der Frage stand.
//
// Zwei getrennte Aufgaben, darum ein eigenes Modul (Single Responsibility):
//   1. `detectSearchRegion` — welcher Markt ist gemeint?
//   2. `buildSearchQuery`   — was ist daran der Suchbegriff?
// Beides ist reine Textlogik ohne Netzwerk und damit einzeln pruefbar.
//
// WICHTIG zur Einordnung: Diese Erkennung ist die ZWEITE Sicherung, nicht die
// erste. Die erste ist das Modell selbst — `web_suche` nimmt seit 2026-08-04
// einen ausdruecklichen `region`-Parameter entgegen (control-server/src/llm/
// toolLoop.js). Nur das Modell kennt die Absicht wirklich; Wortlisten hier
// fangen den Fall ab, in dem die Vorpruefung ohne Modell sucht. Eine unbekannte
// Region faellt fail-safe auf den bisherigen Standard zurueck — nie auf einen
// Fehler.

import { normalizeForIntent } from "./searchIntent.js";

/** Bisheriges Verhalten bleibt der Standard: ohne Hinweis wird deutsch gesucht. */
export const DEFAULT_REGION = "de";

/**
 * Regionstabelle. Pro Markt die Parameter aller Quellen:
 * `ddg` = DuckDuckGo `kl`, `cc` = Bing `cc`, `lang` = Bing `setlang`/SearXNG,
 * `accept` = HTTP-Kopf `Accept-Language`, `country` = Tavily-Landesname.
 *
 * `country` ist bewusst der ausgeschriebene Name in Kleinbuchstaben: Tavily
 * erwartet "united states", NICHT "us" (Doku 2026-08-04 geprueft). Ein falsches
 * Format wird dort still ignoriert — der Markt waere dann wirkungslos, ohne dass
 * es auffaellt. `wt` (weltweit) traegt bewusst KEIN Land.
 */
export const SEARCH_REGIONS = Object.freeze({
  de: { ddg: "de-de", cc: "DE", lang: "de", accept: "de-DE,de;q=0.9,en;q=0.6", country: "germany" },
  at: { ddg: "at-de", cc: "AT", lang: "de", accept: "de-AT,de;q=0.9,en;q=0.6", country: "austria" },
  ch: { ddg: "ch-de", cc: "CH", lang: "de", accept: "de-CH,de;q=0.9,en;q=0.6", country: "switzerland" },
  us: { ddg: "us-en", cc: "US", lang: "en", accept: "en-US,en;q=0.9", country: "united states" },
  uk: { ddg: "uk-en", cc: "GB", lang: "en", accept: "en-GB,en;q=0.9", country: "united kingdom" },
  ca: { ddg: "ca-en", cc: "CA", lang: "en", accept: "en-CA,en;q=0.9", country: "canada" },
  au: { ddg: "au-en", cc: "AU", lang: "en", accept: "en-AU,en;q=0.9", country: "australia" },
  fr: { ddg: "fr-fr", cc: "FR", lang: "fr", accept: "fr-FR,fr;q=0.9,en;q=0.6", country: "france" },
  es: { ddg: "es-es", cc: "ES", lang: "es", accept: "es-ES,es;q=0.9,en;q=0.6", country: "spain" },
  it: { ddg: "it-it", cc: "IT", lang: "it", accept: "it-IT,it;q=0.9,en;q=0.6", country: "italy" },
  nl: { ddg: "nl-nl", cc: "NL", lang: "nl", accept: "nl-NL,nl;q=0.9,en;q=0.6", country: "netherlands" },
  pl: { ddg: "pl-pl", cc: "PL", lang: "pl", accept: "pl-PL,pl;q=0.9,en;q=0.6", country: "poland" },
  tr: { ddg: "tr-tr", cc: "TR", lang: "tr", accept: "tr-TR,tr;q=0.9,en;q=0.6", country: "turkey" },
  br: { ddg: "br-pt", cc: "BR", lang: "pt", accept: "pt-BR,pt;q=0.9,en;q=0.6", country: "brazil" },
  jp: { ddg: "jp-jp", cc: "JP", lang: "ja", accept: "ja-JP,ja;q=0.9,en;q=0.6", country: "japan" },
  in: { ddg: "in-en", cc: "IN", lang: "en", accept: "en-IN,en;q=0.9", country: "india" },
  // Weltweit ohne Landesfilter — fuer Fragen ohne Ortsbezug.
  wt: { ddg: "wt-wt", cc: "US", lang: "en", accept: "en-US,en;q=0.9", country: "" }
});

// Ortsmarker je Markt. Bewusst nur eindeutige Namen: ein mehrdeutiges Wort
// richtet hier mehr Schaden an als ein fehlender Eintrag, denn ein fehlender
// Eintrag faellt auf den bisherigen Standard zurueck (kein Rueckschritt),
// ein falscher Eintrag schickt die Suche in den falschen Markt.
const REGION_MARKER = Object.freeze({
  us: [
    "usa", "u s a", "vereinigte staaten", "united states", "amerika", "america",
    "amerikanisch", "amerikanische", "amerikanischen", "amerikanischer", "american",
    "silicon valley", "silikon valley", "bay area", "san jose", "san francisco",
    "santa clara", "palo alto", "mountain view", "sunnyvale", "cupertino",
    "menlo park", "redwood city", "los angeles", "san diego", "new york",
    "manhattan", "brooklyn", "chicago", "boston", "seattle", "miami", "austin",
    "dallas", "houston", "denver", "atlanta", "las vegas", "philadelphia",
    "kalifornien", "california", "texas", "florida", "nevada", "arizona"
  ],
  uk: [
    "grossbritannien", "great britain", "united kingdom", "england", "schottland",
    "scotland", "wales", "london", "manchester", "liverpool", "birmingham",
    "edinburgh", "glasgow"
  ],
  ca: ["kanada", "canada", "toronto", "vancouver", "montreal", "ottawa", "calgary"],
  au: ["australien", "australia", "sydney", "melbourne", "brisbane", "perth"],
  at: ["oesterreich", "austria", "wien", "salzburg", "graz", "innsbruck", "linz", "klagenfurt"],
  ch: ["schweiz", "switzerland", "zuerich", "genf", "geneva", "basel", "bern", "lausanne", "luzern"],
  fr: ["frankreich", "france", "paris", "lyon", "marseille", "bordeaux", "toulouse", "nizza", "nice"],
  es: ["spanien", "spain", "madrid", "barcelona", "valencia", "sevilla", "malaga", "mallorca"],
  it: ["italien", "italy", "rom", "roma", "mailand", "milano", "venedig", "florenz", "neapel", "turin", "toskana"],
  nl: ["niederlande", "netherlands", "holland", "amsterdam", "rotterdam", "den haag", "utrecht", "eindhoven"],
  pl: ["polen", "poland", "warschau", "warsaw", "krakau", "krakow", "danzig", "gdansk", "breslau"],
  tr: ["tuerkei", "turkey", "istanbul", "ankara", "antalya", "izmir", "bodrum"],
  br: ["brasilien", "brazil", "sao paulo", "rio de janeiro", "brasilia"],
  jp: ["japan", "tokio", "tokyo", "osaka", "kyoto", "yokohama"],
  in: ["indien", "india", "mumbai", "neu delhi", "new delhi", "bangalore", "bengaluru", "hyderabad"],
  de: [
    "deutschland", "germany", "berlin", "hamburg", "muenchen", "munich", "koeln",
    "cologne", "frankfurt", "stuttgart", "duesseldorf", "dortmund", "essen",
    "leipzig", "dresden", "hannover", "bremen", "nuernberg", "bayern", "sachsen",
    "hessen", "brandenburg", "thueringen", "saarland"
  ]
});

/**
 * Prueft und normalisiert eine Regionsangabe (z. B. aus dem Modell-Werkzeug).
 * @param {string} value Rohwert, etwa "US", "us-en", "USA".
 * @returns {string} gueltiger Regionsschluessel oder "" (unbekannt).
 */
export function normalizeRegion(value) {
  const roh = String(value || "").trim().toLowerCase();
  if (!roh) return "";
  if (SEARCH_REGIONS[roh]) return roh;
  // Auch "us-en"/"de-de" und Landesnamen wie "usa" akzeptieren: das Modell
  // schreibt nicht immer exakt den Schluessel.
  const kurz = roh.split(/[-_ ]/)[0];
  if (SEARCH_REGIONS[kurz]) return kurz;
  for (const [schluessel, marker] of Object.entries(REGION_MARKER)) {
    if (marker.includes(roh)) return schluessel;
  }
  if (roh === "gb") return "uk";
  if (roh === "worldwide" || roh === "weltweit" || roh === "global") return "wt";
  return "";
}

/**
 * Erkennt den gemeinten Markt aus dem Fragetext.
 *
 * Regel bei mehreren Treffern: Es gewinnt der Marker, der ZULETZT im Text steht.
 * "Flug von Berlin nach New York" nennt das Ziel hinten — und das Ziel ist der
 * Markt, in dem gesucht werden soll. Ohne Treffer bleibt es beim Standard, das
 * Verhalten ist dann exakt wie vor dieser Aenderung.
 *
 * @param {string} text Rohe Nutzereingabe.
 * @param {string} [standard] Rueckfallwert.
 * @returns {string} Regionsschluessel aus SEARCH_REGIONS.
 */
export function detectSearchRegion(text, standard = DEFAULT_REGION) {
  const normalisiert = normalizeForIntent(text);
  if (!normalisiert) return standard;
  let gewinner = "";
  let position = -1;
  for (const [schluessel, marker] of Object.entries(REGION_MARKER)) {
    for (const wort of marker) {
      // Wortgrenze auf beiden Seiten: "wien" darf nicht in "wiener schnitzel"
      // treffen und "rom" nicht in "roman".
      const treffer = normalisiert.search(new RegExp(`\\b${wort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
      if (treffer > position) {
        position = treffer;
        gewinner = schluessel;
      }
    }
  }
  return gewinner || standard;
}

/**
 * Liefert die Suchparameter eines Marktes. Unbekannte Region -> Standard.
 * @param {string} region Regionsschluessel.
 * @returns {{ddg:string,cc:string,lang:string,accept:string,region:string}}
 */
export function regionSearchParams(region) {
  const schluessel = normalizeRegion(region) || DEFAULT_REGION;
  return { ...SEARCH_REGIONS[schluessel], region: schluessel };
}

// Funktionswoerter und Bittformeln. Content-Woerter stehen hier NICHT drin:
// wird zu viel entfernt, verliert die Anfrage ihren Gegenstand. Deshalb ist die
// Liste kurz und enthaelt nur, was in keiner Suchmaschine etwas beitraegt.
const FUELLWOERTER = new Set([
  "ich", "du", "wir", "mir", "mich", "dir", "sich", "man", "es", "sie", "er",
  "bitte", "danke", "hallo", "hi", "hey", "mal", "doch", "denn", "eigentlich",
  "kannst", "kann", "koennen", "koenntest", "wuerdest", "wuerde", "moechte",
  "moechtest", "will", "willst", "soll", "sollst", "suche", "suchen", "such",
  "brauche", "benoetige", "finden", "finde", "zeig", "zeige", "sag", "sage",
  "gib", "gibt", "haette", "hatte", "hab", "habe", "haben", "hat", "ist", "sind",
  "war", "waren", "sein", "der", "die", "das", "den", "dem", "des", "ein",
  "eine", "einen", "einem", "eines", "einer", "und", "oder", "aber", "auch",
  "noch", "nur", "sehr", "gern", "gerne", "hier", "dort", "dass", "damit",
  "wie", "was", "wo", "wann", "warum", "wieso", "welche", "welcher", "welches",
  "in", "im", "am", "an", "auf", "aus", "bei", "von", "vom", "mit", "zum",
  "zur", "zu", "fuer", "ueber", "unter", "nach", "als", "so", "ne", "nen",
  "the", "a", "an", "please", "can", "could", "would", "you", "me", "my",
  "i", "we", "is", "are", "of", "to", "at", "and", "or"
]);

/** Suchanfragen bleiben kurz: lange Saetze verwaessern jede Suchmaschine. */
const MAX_WOERTER = 12;
const MAX_ZEICHEN = 160;

/**
 * Macht aus einem Satz eine Suchanfrage.
 *
 * Befund 2026-08-04: Die Vorpruefung reichte den ROHEN Satz als Suchbegriff
 * durch ("ich suche eine buroe: 1 oder 2 Zimmer ... Kannst du mir finden").
 * Live nachgemessen liefert dieser Satz 0 Treffer — die Suche war nicht
 * gescheitert, sie war nie gestellt worden.
 *
 * Fail-safe: bleibt nach dem Kuerzen nichts Verwertbares uebrig, kommt der
 * bereinigte Originaltext zurueck. Diese Funktion darf eine Suche verbessern,
 * niemals verhindern.
 *
 * @param {string} text Rohe Nutzereingabe.
 * @returns {string} Suchbegriff.
 */
export function buildSearchQuery(text) {
  const roh = String(text || "").replace(/\s+/g, " ").trim();
  if (!roh) return "";
  // Satzzeichen weg, Wortbestandteile (auch Umlaute, Ziffern, Bindestrich) behalten.
  const tokens = roh
    .replace(/https?:\/\/\S+/gi, " ")
    .split(/[^\p{L}\p{N}\-.]+/u)
    .map((wort) => wort.replace(/^[-.]+|[-.]+$/g, ""))
    .filter(Boolean);
  const behalten = tokens.filter((wort) => !FUELLWOERTER.has(normalizeForIntent(wort)));
  const gewaehlt = (behalten.length > 0 ? behalten : tokens).slice(0, MAX_WOERTER);
  const anfrage = gewaehlt.join(" ").slice(0, MAX_ZEICHEN).trim();
  return anfrage || roh.slice(0, MAX_ZEICHEN);
}
