// smejj.com — Fragevarianten: mehr Fragenformen je Fakt, mit Herkunftsnachweis.
//
// WARUM (gemessen am 2026-08-05):
// Der Projektkorpus hat 2.097 Zeilen, aber nur 699 FAKTEN — jeder mit denselben
// drei fest verdrahteten Fragenformen. Die Pruefsuite stellt dagegen 295
// natuerliche Fragen. Das trainierte Modell lernte darum vor allem "auf eine
// Ueberschrift den Abschnitt aufsagen" und verlor, was das Basismodell konnte:
// Grundlinie 95,88 %, trainiert 67,89 %.
//
//   Drei Formulierungen derselben Frage sind keine drei Beispiele.
//   Sie sind ein Beispiel mit drei Etiketten.
//
// Dieses Modul nimmt zusaetzliche Fragen zu vorhandenen Fakten auf — und prueft
// sie, bevor sie ins Training duerfen.
//
// DIE WICHTIGSTE REGEL, und sie richtet sich ausdruecklich auch gegen den
// Agenten, der diese Datei geschrieben hat:
// **Fragen aus einem Sprachmodell sind gesperrt.** Ein Modell, das seine
// eigenen Fragen erzeugt und darauf trainiert, lernt nur seine eigene
// Verteilung — das ist Modellkollaps im Kleinen, und die
// Trainingsdaten-Policy (docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md)
// verbietet es unabhaengig davon. Zulaessig sind ausschliesslich von Menschen
// geschriebene Fragen und echte Nutzerfragen. Die Herkunft ist Pflichtfeld und
// wird fail-closed geprueft: fehlt sie oder ist sie unbekannt, faellt die
// Variante durch.

/** Zulaessige Herkuenfte. Alles andere wird abgewiesen. */
export const HERKUNFT = Object.freeze({
  HAND: "hand",
  NUTZERFRAGE: "nutzerfrage"
});

const ERLAUBTE_HERKUNFT = new Set(Object.values(HERKUNFT));

/** Laengengrenzen einer Frage. Zu kurz traegt kein Thema, zu lang ist ein Text. */
export const FRAGE_MIN_ZEICHEN = 12;
export const FRAGE_MAX_ZEICHEN = 240;

/**
 * Hoechste zulaessige Wortueberlappung zwischen zwei Varianten desselben Fakts.
 *
 * Der Zweck der Varianten ist FORMVIELFALT. Zwei Fragen, die sich nur in einem
 * Wort unterscheiden, bringen genau so wenig wie die drei Schablonen — sie
 * verdreifachen die Zeilenzahl, ohne die Verteilung zu verbreitern. 0,7 laesst
 * gemeinsames Fachvokabular zu und faengt blosse Umstellungen.
 */
export const MAX_UEBERLAPPUNG = 0.7;

/**
 * Antwortverrat: eine Frage, die die Antwort schon enthaelt, lehrt Abschreiben
 * statt Wissen.
 *
 * Gemessen wird die laengste woertlich gemeinsame Wortfolge — aber ZWEI
 * Bedingungen muessen zusammenkommen, und das ist der Punkt: eine feste
 * Wortzahl allein taugt nicht. Jede gute Frage nennt ihr Thema, und das Thema
 * steht auch in der Antwort. "Was gilt fuer die Speicherung grosser Dateien?"
 * teilt zwangslaeufig Woerter mit dem Abschnitt darueber.
 *
 * Verraeterisch ist eine Frage erst, wenn die gemeinsame Folge lang ist UND
 * einen grossen Teil der Frage selbst ausmacht. Dann ist die Frage keine Frage
 * mehr, sondern die umgestellte Antwort.
 */
export const MAX_ANTWORTVERRAT_WOERTER = 5;
export const MAX_ANTWORTVERRAT_ANTEIL = 0.5;

const WORTTRENNER = /[^\p{L}\p{N}]+/u;

/** Woerter einer Frage, klein und ohne Satzzeichen. */
export function woerter(text) {
  return String(text || "").toLowerCase().split(WORTTRENNER).filter((w) => w.length > 1);
}

/** Anteil gemeinsamer Woerter (Jaccard). 1 = identisch, 0 = voellig verschieden. */
export function ueberlappung(a, b) {
  const mengeA = new Set(woerter(a));
  const mengeB = new Set(woerter(b));
  if (mengeA.size === 0 || mengeB.size === 0) return 0;
  let gemeinsam = 0;
  for (const wort of mengeA) if (mengeB.has(wort)) gemeinsam += 1;
  return gemeinsam / (mengeA.size + mengeB.size - gemeinsam);
}

/** Laengste Wortfolge, die in beiden Texten vorkommt. */
export function laengsteGemeinsameFolge(a, b) {
  const x = woerter(a);
  const y = woerter(b);
  if (x.length === 0 || y.length === 0) return 0;
  let best = 0;
  let vorherige = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const aktuelle = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        aktuelle[j] = vorherige[j - 1] + 1;
        if (aktuelle[j] > best) best = aktuelle[j];
      }
    }
    vorherige = aktuelle;
  }
  return best;
}

/**
 * Prueft EINEN Variantensatz zu einem Fakt.
 *
 * @param {object} eintrag {quelle, ueberschrift, antwort, fragen: [{text, herkunft, erfasstAm}]}
 * @returns {{ok: boolean, gruende: string[]}}
 */
export function pruefeEintrag(eintrag) {
  const gruende = [];
  const melde = (grund) => { if (!gruende.includes(grund)) gruende.push(grund); };

  if (!eintrag || typeof eintrag !== "object") return { ok: false, gruende: ["eintrag_ungueltig"] };
  if (!nichtLeer(eintrag.quelle)) melde("quelle_fehlt");
  if (!nichtLeer(eintrag.ueberschrift)) melde("ueberschrift_fehlt");

  const fragen = Array.isArray(eintrag.fragen) ? eintrag.fragen : [];
  if (fragen.length === 0) melde("keine_fragen");

  const texte = [];
  for (const frage of fragen) {
    if (!frage || typeof frage !== "object") { melde("frage_ungueltig"); continue; }
    const text = String(frage.text || "").trim();

    // Herkunft zuerst: sie entscheidet ueber Zulaessigkeit, nicht ueber Qualitaet.
    if (!ERLAUBTE_HERKUNFT.has(frage.herkunft)) melde(`herkunft_unzulaessig:${frage.herkunft ?? "fehlt"}`);

    if (text.length < FRAGE_MIN_ZEICHEN) melde("frage_zu_kurz");
    if (text.length > FRAGE_MAX_ZEICHEN) melde("frage_zu_lang");
    if (text && !text.includes("?")) melde("kein_fragezeichen");

    // Die Frage darf die Antwort nicht schon enthalten.
    if (text && nichtLeer(eintrag.antwort)) {
      const folge = laengsteGemeinsameFolge(text, eintrag.antwort);
      const anteil = woerter(text).length > 0 ? folge / woerter(text).length : 0;
      if (folge > MAX_ANTWORTVERRAT_WOERTER && anteil > MAX_ANTWORTVERRAT_ANTEIL) melde("antwortverrat");
    }
    if (text) texte.push(text);
  }

  // Formvielfalt: jede Variante muss sich von jeder anderen unterscheiden.
  for (let i = 0; i < texte.length; i += 1) {
    for (let j = i + 1; j < texte.length; j += 1) {
      if (ueberlappung(texte[i], texte[j]) > MAX_UEBERLAPPUNG) melde("zu_aehnlich");
    }
  }

  return { ok: gruende.length === 0, gruende };
}

/**
 * Prueft die ganze Sammlung und liefert nur die zulaessigen Eintraege zurueck.
 * Fail-closed: ein fehlerhafter Eintrag wird verworfen, nicht repariert.
 */
export function pruefeSammlung(sammlung) {
  const eintraege = Array.isArray(sammlung?.eintraege) ? sammlung.eintraege : [];
  const angenommen = [];
  const abgelehnt = [];
  for (const eintrag of eintraege) {
    const urteil = pruefeEintrag(eintrag);
    if (urteil.ok) angenommen.push(eintrag);
    else abgelehnt.push({ quelle: eintrag?.quelle ?? null, ueberschrift: eintrag?.ueberschrift ?? null, gruende: urteil.gruende });
  }
  const fragen = angenommen.reduce((summe, e) => summe + e.fragen.length, 0);
  return {
    angenommen,
    abgelehnt,
    kennzahlen: {
      eintraege: eintraege.length,
      angenommen: angenommen.length,
      abgelehnt: abgelehnt.length,
      fragen,
      fragenJeFakt: angenommen.length > 0 ? Math.round((fragen / angenommen.length) * 10) / 10 : 0
    }
  };
}

/** Schluessel eines Fakts — verbindet Variante und Korpuszeile. */
export function faktSchluessel(quelle, ueberschrift) {
  return `${String(quelle || "").trim()}#${String(ueberschrift || "").trim()}`;
}

function nichtLeer(wert) {
  return typeof wert === "string" && wert.trim().length > 0;
}
