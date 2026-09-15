// smejj.com — Live-Kontext fuer den Agenten-Weg: Wetter und Websuche.
//
// WARUM EIGENES MODUL (2026-08-19): Die 800-Zeilen-Regel aus AI_Guidelines.md
// gilt ohne Ausnahme; `src/server.js` stand nach der Kostenarbeit darueber.
// "Woher kommen tagesaktuelle Fakten?" ist eine eigene Verantwortung und
// gehoert nicht in den Router.
//
// INHALTLICH UNVERAENDERT uebernommen — beide Zeilen haben eine Vorgeschichte
// und bleiben, wie sie gemessen wurden.

/**
 * Holt tagesaktuellen Kontext, wenn die Aufgabe ihn braucht.
 *
 * Coding-Aufgaben bekommen KEINEN Live-Kontext: dort zaehlt der Projektstand,
 * nicht die Nachrichtenlage.
 *
 * @returns {Promise<string>} leer, wenn nichts noetig oder nichts gefunden wurde
 */
export async function holeLiveKontext(task, {
  codingTask,
  erkenneAbsicht,
  beantworteLive,
  sollSuchen,
  baueSuchkontext,
  suchFristMs = SUCH_FRIST_MS
}) {
  if (codingTask) return "";
  // Wetter direkt ueber Open-Meteo (echte API, ~0,2s) statt Suchmaschinen-Scraping (~9,5s).
  const liveIntent = erkenneAbsicht(task);
  if (liveIntent.kind === "weather") {
    const live = await beantworteLive(liveIntent, task).catch(() => null);
    if (live && live.ok) return "Live-Wetterdaten (Open-Meteo):\n" + live.answer;
  }
  // Intent-Gate: nur bei Aktualitaet/URL/Quellenbitte suchen. Suchbegriff und
  // Markt baut buildAgentWebContext (src/search/webSearchRoute.js).
  // GESAMTFRIST (15.09.2026, live gemessen): die Suche fragt ihre Quellen nacheinander
  // mit je 8 s — bei themenfremden Treffern liefen 33 bis 84 s ohne ein Byte. Nach
  // SUCH_FRIST_MS antwortet das Modell ohne Web-Kontext; die Suche selbst laeuft im
  // Hintergrund zu Ende und fuellt den 10-Minuten-Haltespeicher fuer die naechste Frage.
  if (sollSuchen(task)) return await mitFrist(baueSuchkontext(task), suchFristMs);
  return "";
}

export const SUCH_FRIST_MS = 15_000;

/** Ergebnis des Versprechens oder "" nach `ms` — nie ein Fehler nach aussen. */
export function mitFrist(versprechen, ms = SUCH_FRIST_MS) {
  let uhr;
  const frist = new Promise((resolve) => { uhr = setTimeout(() => resolve(""), ms); });
  const ergebnis = Promise.resolve(versprechen).then((wert) => wert, () => "");
  return Promise.race([ergebnis, frist]).finally(() => clearTimeout(uhr));
}
