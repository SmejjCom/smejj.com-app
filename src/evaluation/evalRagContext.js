// smejj.com — RAG-Kontext fuer den Eval-Harness.
//
// Zweck: die Frage "bringt Projektwissen im Prompt ueberhaupt etwas?" beantworten,
// BEVOR die Live-Kette dafuer umgebaut wird. Der Block wird hier lokal aus denselben
// Modulen gebaut, die spaeter im Dienst laufen, und dem Fall als System-Nachricht
// vorangestellt. Damit misst der A/B-Vergleich genau EINEN Unterschied — den Kontext —
// am selben Modell, ueber denselben Transportweg, ohne Deploy und ohne lokale Schluessel.
//
// Bewusst kein eigener Retrieval-Code: waere die Suche hier nachgebaut, wuerde die
// Messung eine Sache belegen und der Dienst eine andere ausliefern.
import { buildRagContextBlock } from "../../control-server/src/rag/agentContext.js";

/** Treffer je Fall. Drei ist auch die Voreinstellung des Agenten-Pfads. */
export const RAG_HITS_PER_CASE = 3;

/**
 * Haengt den RAG-Kontextblock als System-Nachricht an einen Eval-Fall.
 *
 * Der Block kommt VOR die fallspezifische system-Anweisung: die Zusicherungen des
 * Falls pruefen die Anweisung, nicht den Kontext — sie muss zuletzt gelten.
 * Findet die Suche nichts ueber der Relevanzschwelle, bleibt der Fall unveraendert.
 *
 * @param {object} evalCase Fall aus der Suite
 * @param {string} projectRoot absoluter Repo-Pfad
 * @param {{hits?: number, buildBlock?: Function}} options
 * @returns {Promise<{case: object, contextChars: number}>}
 */
export async function withRagContext(evalCase, projectRoot, {
  hits = RAG_HITS_PER_CASE,
  minTopScore,
  buildBlock = buildRagContextBlock
} = {}) {
  const block = await buildBlock(projectRoot, String(evalCase?.prompt || ""), hits,
    Number.isFinite(minTopScore) ? { minTopScore } : {});
  if (!block) return { case: evalCase, contextChars: 0 };
  const system = [block, evalCase?.system].filter((part) => typeof part === "string" && part.trim()).join("\n\n");
  return { case: { ...evalCase, system }, contextChars: block.length };
}

/**
 * Umhuellt einen Modellaufruf so, dass jeder Fall vorher seinen RAG-Kontext bekommt.
 * @param {Function} callModel urspruengliche Aufruffunktion
 * @returns {{callModel: Function, stats: {aufrufeMitKontext: number, aufrufeOhneKontext: number, zeichenGesamt: number}}}
 */
export function wrapCallerWithRag(callModel, projectRoot, options = {}) {
  const stats = { aufrufeMitKontext: 0, aufrufeOhneKontext: 0, zeichenGesamt: 0 };
  return {
    stats,
    callModel: async (evalCase) => {
      const { case: augmented, contextChars } = await withRagContext(evalCase, projectRoot, options);
      if (contextChars > 0) {
        stats.aufrufeMitKontext += 1;
        stats.zeichenGesamt += contextChars;
      } else {
        stats.aufrufeOhneKontext += 1;
      }
      return callModel(augmented);
    }
  };
}
