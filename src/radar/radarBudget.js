// smejj ai radar — Budget, Notaus und Vorrang (Auftrag Punkt 7).
//
// Rein und ohne I/O. Gezaehlt wird, was der Radar wirklich verbraucht:
// SUCHANFRAGEN (unser Weg ist gratis, aber nicht unbegrenzt hoeflich) und
// Rechenzeit. Geld faellt nur an, wenn jemand spaeter einen bezahlten
// Suchdienst hinterlegt — dafuer gibt es `kostenJeAnfrageUsd`.
//
// DIE WICHTIGSTE REGEL steht in `darfLaufen`: Ist der Zaehler NICHT LESBAR,
// wird nicht gestartet. Ein Deckel, den man nicht lesen kann, ist kein Deckel
// (dieselbe Lehre wie beim Trainings-Deckel).

export const STANDARD_GRENZEN = Object.freeze({
  anfragenJeLauf: 6,
  anfragenJeTag: 120,
  anfragenJeMonat: 2000,
  kostenJeAnfrageUsd: 0,
  maxUsdJeMonat: 0,
  laufZeitlimitMs: 120_000
});

export function grenzenAus(env = process.env, konfig = null) {
  const zahl = (wert, standard, min, max) => {
    const z = Number(wert);
    return Number.isFinite(z) ? Math.min(max, Math.max(min, z)) : standard;
  };
  return Object.freeze({
    anfragenJeLauf: zahl(konfig?.anfragenJeLauf ?? env.SMEJJ_RADAR_ANFRAGEN_JE_LAUF, STANDARD_GRENZEN.anfragenJeLauf, 1, 50),
    anfragenJeTag: zahl(konfig?.anfragenJeTag ?? env.SMEJJ_RADAR_ANFRAGEN_JE_TAG, STANDARD_GRENZEN.anfragenJeTag, 1, 5000),
    anfragenJeMonat: zahl(konfig?.anfragenJeMonat ?? env.SMEJJ_RADAR_ANFRAGEN_JE_MONAT, STANDARD_GRENZEN.anfragenJeMonat, 1, 100000),
    kostenJeAnfrageUsd: zahl(env.SMEJJ_RADAR_KOSTEN_JE_ANFRAGE_USD, STANDARD_GRENZEN.kostenJeAnfrageUsd, 0, 1),
    maxUsdJeMonat: zahl(env.SMEJJ_RADAR_MAX_USD_MONAT, STANDARD_GRENZEN.maxUsdJeMonat, 0, 1000),
    laufZeitlimitMs: zahl(env.SMEJJ_RADAR_ZEITLIMIT_MS, STANDARD_GRENZEN.laufZeitlimitMs, 10_000, 600_000)
  });
}

/** Notaus: Umgebung ODER gespeicherte Konfiguration. Beides zaehlt. */
export function notaus(env = process.env, konfig = null) {
  if (String(env?.SMEJJ_RADAR_NOTAUS || "").trim().toUpperCase() === "YES") return true;
  return konfig?.eingeschaltet === false;
}

const tagVon = (iso) => String(iso || "").slice(0, 10);
const monatVon = (iso) => String(iso || "").slice(0, 7);

/** Zaehlt die Anfragen des Tages und des Monats aus den Laufprotokollen. */
export function verbrauch(laeufe = [], jetzt = new Date().toISOString()) {
  const tag = tagVon(jetzt);
  const monat = monatVon(jetzt);
  let anfragenHeute = 0;
  let anfragenMonat = 0;
  for (const lauf of laeufe) {
    const anfragen = Number(lauf?.anfragen) || 0;
    if (monatVon(lauf?.begonnenAm) === monat) anfragenMonat += anfragen;
    if (tagVon(lauf?.begonnenAm) === tag) anfragenHeute += anfragen;
  }
  return { anfragenHeute, anfragenMonat };
}

/**
 * Darf ein Lauf starten?
 * @returns {{erlaubt: boolean, grund: string|null, rest: object}}
 */
export function darfLaufen({ grenzen, laeufe, jetzt = new Date().toISOString(), env = process.env, konfig = null, laeuftSchon = false } = {}) {
  const leer = { anfragenHeute: null, anfragenMonat: null, restHeute: null, restMonat: null };
  if (notaus(env, konfig)) return { erlaubt: false, grund: "notaus", rest: leer };
  if (laeuftSchon) return { erlaubt: false, grund: "laeuft_bereits", rest: leer };
  if (!Array.isArray(laeufe)) return { erlaubt: false, grund: "budget_nicht_lesbar", rest: leer };

  const v = verbrauch(laeufe, jetzt);
  const restHeute = grenzen.anfragenJeTag - v.anfragenHeute;
  const restMonat = grenzen.anfragenJeMonat - v.anfragenMonat;
  const rest = { ...v, restHeute, restMonat };
  if (restHeute < 1) return { erlaubt: false, grund: "tagesbudget_erschoepft", rest };
  if (restMonat < 1) return { erlaubt: false, grund: "monatsbudget_erschoepft", rest };

  const kostenMonat = v.anfragenMonat * grenzen.kostenJeAnfrageUsd;
  if (grenzen.kostenJeAnfrageUsd > 0 && kostenMonat >= grenzen.maxUsdJeMonat) {
    return { erlaubt: false, grund: "kostendeckel_erreicht", rest: { ...rest, kostenMonatUsd: kostenMonat } };
  }
  return { erlaubt: true, grund: null, rest };
}

/** Wie viele Anfragen darf DIESER Lauf machen? Nie mehr, als noch uebrig ist. */
export function anfragenFuerLauf(grenzen, rest) {
  return Math.max(0, Math.min(grenzen.anfragenJeLauf, rest.restHeute ?? 0, rest.restMonat ?? 0));
}
