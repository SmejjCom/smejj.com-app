// smejj.com — Absichtserkennung fuer die Live-Internet-Suche.
//
// Befund 2026-07-29 (Betreiber-Meldung, reproduziert): Die Frage
// "kannst du Schlagzeile ueber Berlin mir hier schreiben" loeste KEINE Websuche
// aus, die Pluralform "Schlagzeilen" dagegen schon. Ursache war eine Liste aus
// Vollformen: `schlagzeilen` stand drin, `schlagzeile` nicht. Zweiter Fehler in
// derselben Liste: Auslöser waren transliteriert notiert (`oeffnungszeiten`,
// `verspaetung`), echte Eingaben schreiben aber `Öffnungszeiten`/`Verspätung` —
// diese Auslöser konnten nie feuern.
//
// Konsequenz fuer dieses Modul (zwei Regeln, die die Fehlerklasse ausschliessen):
//   1. Der Text wird VOR dem Vergleich normalisiert (Kleinschreibung, Umlaute
//      und Akzente auf ASCII). Damit ist es egal, ob der Nutzer "Öffnungszeiten"
//      oder "Oeffnungszeiten" schreibt.
//   2. Verglichen wird gegen WORTSTAEMME mit Wortgrenze nur am Anfang. Damit
//      decken `schlagzeil`, `nachricht`, `oeffnungszeit` alle Beugungsformen ab
//      (Singular, Plural, Genitiv) — es gibt keine "vergessene Form" mehr.
// Kurze oder mehrdeutige Woerter stehen bewusst NICHT als Stamm, sondern als
// exakte Vollform (`EXAKTE_AKTUALITAET`), damit "neu" nicht in "Neuseeland" oder
// "neugierig" trifft.
//
// Die zweite Sicherung liegt nicht hier, sondern im Modell: es hat mit
// `web_suche` ein eigenes Werkzeug (control-server/src/llm/toolLoop.js) und kann
// selbst nachsuchen, wenn diese Vorpruefung eine Aktualitaetsfrage uebersieht.
// Dieses Modul darf also im Zweifel "nein" sagen, ohne dass der Nutzer eine
// "Ich habe keine Informationen"-Antwort bekommt.

/**
 * Normalisiert Text fuer den Musterabgleich: Kleinschreibung, deutsche Umlaute
 * auf ihre ASCII-Umschrift, restliche Akzente entfernt.
 * @param {string} text Rohe Nutzereingabe.
 * @returns {string} Normalisierter Text (nur noch ASCII-Buchstaben).
 */
export function normalizeForIntent(text) {
  return String(text || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Wortstaemme: Wortgrenze nur am Anfang, damit alle Beugungsformen greifen.
// Jeder Eintrag ist lang genug, dass er nicht versehentlich in ein anderes Wort
// hineintrifft. Kurze Woerter gehoeren in EXAKTE_AKTUALITAET.
const AKTUALITAET_STAEMME = [
  // Zeitbezug
  "aktuell", "heutig", "gestrig", "morgig", "momentan", "derzeit", "neuest",
  "juengst", "kuerzlich", "soeben", "inzwischen", "mittlerweile",
  // Nachrichten
  "nachricht", "schlagzeil", "meldung", "eilmeldung", "pressemitteilung",
  "berichterstattung", "geschehen", "ereignis", "headline", "breaking",
  // Wetter
  "wetter", "temperatur", "vorhersage", "niederschlag", "unwetter", "regenradar",
  "wettervorhersage", "forecast",
  // Geld und Maerkte
  "preis", "kosten", "kurse", "aktie", "boerse", "bitcoin", "kryptowaehrung",
  "wechselkurs", "inflation", "zinssatz", "spritpreis", "benzinpreis",
  "strompreis", "gaspreis",
  // Alltag und Termine
  "oeffnungszeit", "fahrplan", "verspaet", "ausfall", "stoerung", "streik",
  "baustelle", "verkehrslage", "termin", "veranstaltung", "programm",
  // Sport und Politik
  "spielstand", "ergebnis", "tabellenstand", "spieltag", "anstosszeit",
  "wahlergebnis", "umfragewert", "abstimmung",
  // Technik
  "changelog", "verfuegbar", "erschien", "veroeffentlich", "aktualisier"
];

// Kurze oder mehrdeutige Woerter: nur als exakte Vollform, sonst zu viele
// Fehltreffer ("neu" in "Neuseeland", "stand" in "Verstand").
const EXAKTE_AKTUALITAET = [
  "heute", "gestern", "morgen", "jetzt", "gerade", "aktuell", "live", "news",
  "neu", "neue", "neuen", "neuer", "neues", "letzte", "letzten", "letzter",
  "stand", "trend", "trends", "wahl", "wahlen", "umfrage", "umfragen",
  "version", "release", "tabelle", "lage", "situation", "kurs", "preise",
  "today", "latest", "current", "now", "recent", "weather", "price", "stock"
];

// Ausdrueckliche Recherche-Bitte: der Nutzer will Beleg, Quelle oder Suche.
const RECHERCHE_STAEMME = [
  "quelle", "beleg", "nachweis", "recherch", "nachschlag", "zusammenfass",
  "webseite", "website", "internet", "google", "wikipedia", "linkliste"
];

const EXAKTE_RECHERCHE = ["link", "links", "url", "web", "online", "source", "sources"];

// Reine Smalltalk-/Begruessungs-Eingaben brauchen keine Websuche.
const SMALLTALK_PATTERN = /^(hi|hallo|hey|servus|moin|hey smejj|danke|dankeschoen|merci|ok|okay|alles klar|tschuess|bye|ciao|gute nacht|guten morgen|guten tag)\b[\s!.?]*$/i;
// Klare Coding-Absicht wird separat behandelt und braucht keine Websuche.
const CODING_SKIP_PATTERN = /unified diff|\bpatch\b|\brefactor|\bdebug\b|\bstack ?trace\b/i;
// Deutsche Suchverben; bewusst als Vollform, weil englisch "such" ein anderes
// Wort ist ("such a function") und keine Suche ausloesen darf.
const SUCHVERB_PATTERN = /\bsuch(e|en|st|t|ne)\b|\bfinde\b|\bfind heraus\b|\bschau nach\b|\bsieh nach\b/i;
// Eine konkrete Adresse im Text soll immer live geholt werden.
const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s)]+/i;
// Jahres- oder Monatsbezug deutet auf eine Aktualitaetsfrage hin.
const DATE_PATTERN = /\b(19|20)\d{2}\b|\b(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i;
// Fragen nach dem aktuellen Zustand ohne eindeutiges Stichwort.
const ZUSTANDSFRAGE_PATTERN = /\bwas (gibt es|gibts|ist) (neues|los|passiert)\b|\bwie (steht|laeuft) es\b|\bwas passiert\b/i;

const MAX_LAENGE = 400;
const MIN_LAENGE = 3;

function stammTreffer(normalisiert, staemme) {
  return staemme.some((stamm) => new RegExp("\\b" + stamm).test(normalisiert));
}

function exakterTreffer(normalisiert, woerter) {
  return woerter.some((wort) => new RegExp("\\b" + wort + "\\b").test(normalisiert));
}

/**
 * Entscheidet, ob eine Eingabe eine Live-Internet-Suche braucht.
 * smejj.com sucht — wie fuehrende Assistenten — nur bei Aktualitaet, einer
 * konkreten Adresse oder einer ausdruecklichen Beleg-/Recherchebitte. Statisches
 * Allgemeinwissen beantwortet das Modell direkt: schneller und ohne Traffic.
 * @param {string} task Rohe Nutzereingabe.
 * @returns {boolean} true, wenn vor der Antwort gesucht werden soll.
 */
export function shouldSearchWeb(task) {
  const text = String(task || "").trim();
  if (text.length < MIN_LAENGE || text.length > MAX_LAENGE) return false;
  if (text.includes(String.fromCharCode(96, 96, 96))) return false;
  if (SMALLTALK_PATTERN.test(text)) return false;
  if (CODING_SKIP_PATTERN.test(text)) return false;
  if (URL_IN_TEXT_PATTERN.test(text)) return true;

  const normalisiert = normalizeForIntent(text);
  if (SUCHVERB_PATTERN.test(normalisiert)) return true;
  if (ZUSTANDSFRAGE_PATTERN.test(normalisiert)) return true;
  if (stammTreffer(normalisiert, RECHERCHE_STAEMME)) return true;
  if (exakterTreffer(normalisiert, EXAKTE_RECHERCHE)) return true;
  if (stammTreffer(normalisiert, AKTUALITAET_STAEMME)) return true;
  if (exakterTreffer(normalisiert, EXAKTE_AKTUALITAET)) return true;
  if (DATE_PATTERN.test(normalisiert)) return true;
  return false;
}
