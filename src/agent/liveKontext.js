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
  baueSuchkontext
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
  if (sollSuchen(task)) return await baueSuchkontext(task);
  return "";
}
