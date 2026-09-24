// smejj.com — Piper-Stimme passend zur Sprache (Sprachmodus, Betreiber 24.09.2026:
// "soll wie ChatGPT wie ein Mensch sprechen", mit unserem eigenen Modell).
//
// Befund 24.09.: Die Bruecke schickte nur {text} an Piper. Piper sprach darum
// JEDE Antwort mit der deutschen Startstimme de_DE-thorsten — auch englische
// oder franzoesische Saetze. Das klang falsch und maschinell.
//
// Jetzt: jede Sprache bekommt ihre eigene Piper-Stimme (dieselbe Liste wie die
// Erzaehlstimme des Video-Malers, dort live in 14 Sprachen bewiesen). Der
// Piper-Dienst startet nur mit Thorsten und laedt weitere Stimmen ueber
// POST /download nach (idempotent, ~3 s beim ersten Mal je Neustart).
// Ohne passende Stimme gilt die Sprache als nicht bedient — der Browser nimmt
// seine eigene Stimme. Thorsten liest NIE fremdsprachigen Text vor.

export const PIPER_STIMMEN = {
  en: "en_US-lessac-medium", es: "es_ES-davefx-medium", fr: "fr_FR-siwis-medium",
  pt: "pt_BR-faber-medium", it: "it_IT-paola-medium", tr: "tr_TR-dfki-medium",
  ru: "ru_RU-irina-medium", ar: "ar_JO-kareem-medium", hi: "hi_IN-pratham-medium",
  bn: "bn_BD-google-medium", id: "id_ID-news_tts-medium", ko: "ko_KR-kss-medium",
  zh: "zh_CN-huayan-medium", ja: "ja_JP-hi_fi_captain-medium"
};

// Grundsprache aus "en-US", "pt_BR", "DE" usw.
export function grundSprache(lang) {
  return String(lang || "").trim().toLowerCase().split(/[-_]/)[0];
}

// Liefert { bedient, stimme }: stimme null = Startstimme (Deutsch oder ohne Angabe).
export function piperStimmeFuer(lang) {
  const basis = grundSprache(lang);
  if (!basis || basis === "de") return { bedient: true, stimme: null };
  const stimme = PIPER_STIMMEN[basis];
  return stimme ? { bedient: true, stimme } : { bedient: false, stimme: null };
}

// Merkt sich, welche Stimmen der Piper-Dienst schon hat. Nach Ablauf wird
// erneut /download gerufen (idempotent) — so faellt ein Neustart des
// Piper-Dienstes (Stimmen weg, Rueckfall auf Thorsten!) spaetestens dann auf.
export function createPiperStimmenLader({ laden, gueltigMs = 5 * 60 * 1000, jetzt = () => Date.now() }) {
  const geladen = new Map(); // stimme -> Zeitpunkt
  const laufend = new Map(); // stimme -> Promise (ein Download je Stimme gleichzeitig)

  async function sicherstellen(stimme) {
    if (!stimme) return true;
    const zeit = geladen.get(stimme);
    if (zeit !== undefined && jetzt() - zeit < gueltigMs) return true;
    if (laufend.has(stimme)) return laufend.get(stimme);
    const versuch = (async () => {
      try {
        const ok = await laden(stimme);
        if (ok) geladen.set(stimme, jetzt());
        else geladen.delete(stimme);
        return Boolean(ok);
      } catch {
        geladen.delete(stimme);
        return false;
      } finally {
        laufend.delete(stimme);
      }
    })();
    laufend.set(stimme, versuch);
    return versuch;
  }

  function vergessen(stimme) {
    if (stimme) geladen.delete(stimme);
  }

  return { sicherstellen, vergessen };
}
