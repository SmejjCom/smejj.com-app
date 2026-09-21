// smejj ai radar — Quellenpruefung (Auftrag Punkt 2): WIE verlaesslich ist ein Fund?
//
// Rein, ohne Netz. Die Regel dahinter ist dieselbe wie beim Konkurrenz-Radar
// (Nr. 04): Eine Maschine kann belegen, WAS wo stand — nicht, ob es stimmt.
// Deshalb vergibt dieses Modul keine Wahrheit, sondern eine GUETE mit Grund,
// und markiert, was ausdruecklich unsicher ist (Geruecht, Werbung, unbelegt).
//
// Mit "Primaerquelle" ist hier gemeint: die Stelle, die die Sache selbst
// verkuendet oder dokumentiert (Hersteller-Blog, Release Notes, Amtsblatt,
// Paper-Server) — im Gegensatz zu einem Bericht ueber diese Stelle.

/** Hersteller- und Amtsseiten: was dort steht, ist die Sache selbst. */
const PRIMAER_HOSTS = [
  "openai.com", "anthropic.com", "deepmind.google", "blog.google", "ai.google.dev", "meta.com", "ai.meta.com",
  "microsoft.com", "azure.microsoft.com", "mistral.ai", "x.ai", "perplexity.ai", "moonshot.cn", "deepseek.com",
  "qwenlm.github.io", "alibabacloud.com", "huggingface.co", "arxiv.org", "github.com", "nodejs.org",
  "developer.apple.com", "developer.android.com", "support.google.com", "play.google.com", "apple.com",
  "europa.eu", "eur-lex.europa.eu", "bsi.bund.de", "nvd.nist.gov", "cve.org", "groq.com", "z.ai", "cloudflare.com"
];

/** Fachpresse: berichtet ueber die Sache, oft zuverlaessig, aber nicht die Quelle selbst. */
const PRESSE_HOSTS = [
  "techcrunch.com", "theverge.com", "arstechnica.com", "heise.de", "golem.de", "zdnet.com", "wired.com",
  "reuters.com", "bloomberg.com", "ft.com", "venturebeat.com", "infoworld.com", "theregister.com", "t3n.de"
];

/** Foren, Aggregatoren, Meinung: als Hinweis brauchbar, als Beleg nicht. */
const FORUM_HOSTS = ["reddit.com", "medium.com", "quora.com", "x.com", "twitter.com", "facebook.com", "linkedin.com", "youtube.com"];

export const GUETE = Object.freeze({ PRIMAER: "primaerquelle", PRESSE: "fachpresse", FORUM: "forum", UNBEKANNT: "unbekannt" });
export const MARKIERUNG = Object.freeze({
  GERUECHT: "geruecht",
  WERBUNG: "werbung",
  UNBELEGT: "unbelegt",
  DATUM_FEHLT: "datum_unbekannt"
});

const GERUECHT_WORT = /\b(rumou?r|geruecht|gerücht|leak|leaked|allegedly|reportedly|angeblich|soll (?:wohl )?(?:bald|demnaechst)|could soon|may soon|expected to launch)\b/i;
const WERBE_WORT = /\b(sponsored|advertisement|werbung|anzeige|jetzt kaufen|buy now|kostenlos testen|free trial|rabatt|discount code|affiliate)\b/i;
const BELEG_WORT = /\b(announced|released|launched|published|veroeffentlicht|veröffentlicht|angekuendigt|angekündigt|documentation|release notes|changelog|paper|study|report)\b/i;

/**
 * Ist das ueberhaupt ein lesbarer Satz — oder Navigations- und Ueberschriften-
 * Brei? (Gemessen am ersten echten Lauf, 21.09.2026: von drei gespeicherten
 * Erkenntnissen waren zwei Bruchstuecke wie "## Research ### Mapping global ..."
 * — formal ein Auszug, inhaltlich eine Menuezeile.)
 *
 * Geprueft wird dreierlei, alles ohne Sprachmodell:
 *   1. genug Woerter (mindestens 8)
 *   2. ein Satzzeichen, das einen Satz beendet
 *   3. nicht zu viele Gliederungszeichen (#, |, >, *, Aufzaehlungspunkte)
 */
export function istLesbarerSatz(text) {
  const roh = String(text || "").trim();
  if (roh.length < 60) return false;
  const woerter = roh.split(/\s+/).filter((w) => /[a-zA-ZäöüÄÖÜß]{2,}/.test(w));
  if (woerter.length < 8) return false;
  if (!/[.!?](\s|$)/.test(roh)) return false;
  const gliederung = (roh.match(/[#|>*·•]/g) || []).length;
  if (gliederung >= 4 || /#{2,}/.test(roh)) return false;
  // Ueberschriften-Ketten ohne Satzbau: viele Grossbuchstaben-Anfaenge, kein Punkt dazwischen.
  const satzEnden = (roh.match(/[.!?]/g) || []).length;
  const grossAnfaenge = woerter.filter((w) => /^[A-ZÄÖÜ]/.test(w)).length;
  if (satzEnden <= 1 && grossAnfaenge > woerter.length * 0.5) return false;
  return true;
}

/** Der Wirtsname einer Adresse, ohne www. Leer, wenn die Adresse unbrauchbar ist. */
export function hostVon(url) {
  try {
    const { hostname, protocol } = new URL(String(url));
    if (protocol !== "http:" && protocol !== "https:") return "";
    return hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function passt(host, liste) {
  return liste.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Guete allein aus der Adresse — mehr weiss man vor dem Lesen nicht. */
export function gueteVon(url) {
  const host = hostVon(url);
  if (!host) return GUETE.UNBEKANNT;
  if (passt(host, PRIMAER_HOSTS)) return GUETE.PRIMAER;
  if (passt(host, PRESSE_HOSTS)) return GUETE.PRESSE;
  if (passt(host, FORUM_HOSTS)) return GUETE.FORUM;
  return GUETE.UNBEKANNT;
}

/**
 * Das Veroeffentlichungsdatum, soweit es im Text oder in der Adresse steht.
 * Fehlt es, wird das ausdruecklich gesagt (null) — nie geraten und nie durch
 * das Abrufdatum ersetzt: "heute gefunden" heisst nicht "heute veroeffentlicht".
 */
export function veroeffentlichungsDatum({ url = "", snippet = "", title = "" } = {}) {
  const ausUrl = String(url).match(/\/(20\d{2})[/-](\d{1,2})(?:[/-](\d{1,2}))?/);
  if (ausUrl) {
    const [, jahr, monat, tag] = ausUrl;
    return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag || "01").padStart(2, "0")}`;
  }
  const text = `${title} ${snippet}`;
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const deutsch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (deutsch) return `${deutsch[3]}-${String(deutsch[2]).padStart(2, "0")}-${String(deutsch[1]).padStart(2, "0")}`;
  const englisch = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (englisch) {
    const monate = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const m = monate[englisch[1].toLowerCase().slice(0, 3)];
    return `${englisch[3]}-${String(m).padStart(2, "0")}-${String(englisch[2]).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Bewertet EINEN Fund. Ergebnis ist beschreibend, nicht wertend-final:
 * `tauglich` heisst nur "darf in die Pruefung", nicht "ist wahr".
 */
export function bewerteFund(fund, { jetzt = new Date().toISOString() } = {}) {
  const url = String(fund?.url || "").trim();
  const titel = String(fund?.title || "").replace(/\s+/g, " ").trim();
  const auszug = String(fund?.snippet || "").replace(/\s+/g, " ").trim();
  const host = hostVon(url);
  const guete = gueteVon(url);
  const text = `${titel} ${auszug}`;

  const markierungen = [];
  if (GERUECHT_WORT.test(text)) markierungen.push(MARKIERUNG.GERUECHT);
  if (WERBE_WORT.test(text)) markierungen.push(MARKIERUNG.WERBUNG);
  if (!BELEG_WORT.test(text) && guete !== GUETE.PRIMAER) markierungen.push(MARKIERUNG.UNBELEGT);

  const veroeffentlicht = veroeffentlichungsDatum({ url, snippet: auszug, title: titel });
  if (!veroeffentlicht) markierungen.push(MARKIERUNG.DATUM_FEHLT);

  const lesbar = istLesbarerSatz(auszug);
  const tauglich = Boolean(host) && auszug.length >= 40 && lesbar && !markierungen.includes(MARKIERUNG.WERBUNG);
  return {
    url,
    host,
    titel: titel.slice(0, 160),
    auszug: auszug.slice(0, 400),
    guete,
    markierungen,
    veroeffentlicht,          // null = unbekannt, ausdruecklich
    abgerufenAm: jetzt,
    tauglich,
    grund: tauglich ? null
      : (!host ? "keine_adresse"
        : (auszug.length < 40 ? "zu_kurz"
          : (!lesbar ? "kein_lesbarer_satz" : "werbung")))
  };
}

/** Sortierung fuer die Pruefung: Primaerquelle vor Presse vor Rest, Geruechte nach hinten. */
export function nachGuete(a, b) {
  const rang = { [GUETE.PRIMAER]: 0, [GUETE.PRESSE]: 1, [GUETE.UNBEKANNT]: 2, [GUETE.FORUM]: 3 };
  const geruecht = (x) => (x.markierungen?.includes(MARKIERUNG.GERUECHT) ? 1 : 0);
  return (geruecht(a) - geruecht(b)) || (rang[a.guete] - rang[b.guete]);
}
