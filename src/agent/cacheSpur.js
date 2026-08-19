// smejj.com — die Cache-Spur des Agenten-Wegs: fragen, protokollieren, ausliefern.
//
// WARUM EIGENES MODUL (2026-08-19): Die 800-Zeilen-Regel aus AI_Guidelines.md
// gilt ohne Ausnahme, und `src/server.js` stand nach der Kostenarbeit bei 906
// Zeilen. Der Cache-Teil ist die groesste zusammenhaengende Ergaenzung und
// zugleich eine eigene Verantwortung — er gehoert nicht in den Router.
// Single Responsibility: hier wird NUR entschieden, ob eine gespeicherte
// Antwort ausgeliefert wird, und wie das protokolliert wird.
//
// Der Cache selbst (Aehnlichkeit, Eignung, Haltbarkeit) liegt unveraendert in
// control-server/src/llm/semantischerCache.js. Dieses Modul verdrahtet ihn nur.

import { cacheModus, frageCache, merkeAntwort } from "../../control-server/src/llm/semantischerCache.js";

/** Kuerzt Text fuer das Protokoll — ein Log, das niemand liest, hilft niemandem. */
function kurz(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 120);
}

/**
 * Baut die Lage, aus der der Cache seine Eignung ableitet.
 *
 * Bewusst alle Merkmale an EINER Stelle: wer spaeter eine Regel ergaenzt, findet
 * hier, was ueberhaupt bekannt ist.
 */
export function baueCacheLage({ task, req, body, fileBlocks, webContext, codingTask }) {
  return {
    frage: task,
    nutzer: req?.authUser?.userId || req?.authUser?.email || "unbekannt",
    verlauf: body?.history,
    dateien: Array.isArray(fileBlocks) ? fileBlocks.length : 0,
    liveInhalt: Boolean(webContext),
    coding: Boolean(codingTask)
  };
}

/**
 * Fragt den Cache und protokolliert die Entscheidung.
 *
 * Bei einem Treffer wird das PAAR protokolliert, nicht nur die Zahl. Ohne die
 * getroffene Frage laesst sich ein Fehltreffer hinterher nicht nachvollziehen —
 * man saehe nur "Treffer 0,93" und muesste raten, ob das richtig war. Genau so
 * wurde am 2026-08-19 der Geschichten-Fehltreffer gefunden.
 */
export function befrageCache(cacheLage, { schreibe = console.log } = {}) {
  const ausCache = frageCache(cacheLage);
  schreibe(`[sem-cache] ${JSON.stringify({
    treffer: ausCache.treffer,
    grund: ausCache.grund,
    aehnlich: ausCache.aehnlich ?? null,
    ...(ausCache.treffer ? { neueFrage: kurz(cacheLage.frage), getroffeneFrage: kurz(ausCache.frage) } : {})
  })}`);
  return ausCache;
}

/** Nur wenn der Cache scharf ist, darf er auch antworten. */
export function darfAusliefern(ausCache, env = process.env) {
  return Boolean(ausCache?.treffer) && cacheModus(env) === "an";
}

/**
 * Liefert die gespeicherte Antwort als regulaeren Strom aus.
 *
 * Als SSE wie jede andere Antwort, damit der Client nichts anders behandeln
 * muss. Die Kopfzeilen sagen ehrlich, dass kein Modell gelaufen ist — und wie
 * aehnlich die Frage war, damit ein Fehltreffer erkennbar bleibt.
 */
export function liefereAusCache(res, ausCache, sicherheitsKopf) {
  res.writeHead(200, {
    ...sicherheitsKopf,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "x-smejj-model-backend": "semantischer-cache",
    "x-smejj-cache-aehnlichkeit": String(ausCache.aehnlich)
  });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ausCache.antwort } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  return res.end();
}

/**
 * Legt eine fertige Antwort ab.
 *
 * Erst NACH einer vollstaendigen Antwort: ein abgebrochener Strom gibt leeren
 * Text zurueck und faellt von selbst durch die Laengenpruefung in merkeAntwort —
 * eine halbe Antwort waere schlimmer als gar keine.
 */
export function merkeFuerSpaeter(cacheLage, antwortText) {
  return merkeAntwort(cacheLage, antwortText);
}
