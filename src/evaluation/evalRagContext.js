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
import { buildRagContextBlock, ensureKnowledgeIndex } from "../../control-server/src/rag/agentContext.js";
import { formatRagContextBlock } from "../../control-server/src/rag/ragContextBlock.js";
import {
  beckenFuerNachsortierung,
  bucheNachsortierung,
  nachsortiere,
  neueNachsortierStatistik
} from "../../control-server/src/rag/ragRerank.js";

/** Treffer je Fall. Drei ist auch die Voreinstellung des Agenten-Pfads. */
export const RAG_HITS_PER_CASE = 3;

/**
 * Haengt den RAG-Kontextblock als System-Nachricht an einen Eval-Fall.
 *
 * Der Block kommt VOR die fallspezifische system-Anweisung: die Zusicherungen des
 * Falls pruefen die Anweisung, nicht den Kontext — sie muss zuletzt gelten.
 * Findet die Suche nichts ueber der Relevanzschwelle, bleibt der Fall unveraendert.
 *
 * Mit `nachsortierer` laeuft der Weg ueber ein groesseres Trefferbecken und laesst
 * ein Modell die zustaendige Passage waehlen (oder alle ablehnen). Ohne
 * `nachsortierer` ist dieser Pfad Byte fuer Byte der bisherige — das ist die
 * Bedingung dafuer, dass die alten Berichte vergleichbar bleiben.
 *
 * @param {object} evalCase Fall aus der Suite
 * @param {string} projectRoot absoluter Repo-Pfad
 * @param {{hits?: number, minTopScore?: number, buildBlock?: Function, nachsortierer?: Function, statistik?: object}} options
 * @returns {Promise<{case: object, contextChars: number, grund: string|null}>}
 */
export async function withRagContext(evalCase, projectRoot, {
  hits = RAG_HITS_PER_CASE,
  minTopScore,
  buildBlock = buildRagContextBlock,
  nachsortierer = null,
  statistik = null
} = {}) {
  const frage = String(evalCase?.prompt || "");
  const { block, grund } = nachsortierer
    ? await blockMitNachsortierung(frage, projectRoot, { minTopScore, nachsortierer, statistik })
    : { block: await buildBlock(projectRoot, frage, hits, Number.isFinite(minTopScore) ? { minTopScore } : {}), grund: null };

  if (!block) return { case: evalCase, contextChars: 0, grund };
  const system = [block, evalCase?.system].filter((part) => typeof part === "string" && part.trim()).join("\n\n");
  return { case: { ...evalCase, system }, contextChars: block.length, grund };
}

/**
 * Suchen, nachsortieren, formatieren.
 * Fail-closed wie der bisherige Weg: jeder Fehler ergibt einen leeren Block statt
 * eines Abbruchs — RAG darf eine Messung nie zum Absturz bringen.
 */
async function blockMitNachsortierung(frage, projectRoot, { minTopScore, nachsortierer, statistik }) {
  try {
    const index = await ensureKnowledgeIndex(projectRoot);
    const becken = beckenFuerNachsortierung(index, frage, { minTopScore });
    const ergebnis = await nachsortiere(frage, becken, { callModel: nachsortierer });
    if (statistik) bucheNachsortierung(statistik, ergebnis.grund);
    return { block: formatRagContextBlock(ergebnis.treffer), grund: ergebnis.grund };
  } catch {
    return { block: "", grund: "fehler" };
  }
}

/**
 * Umhuellt einen Modellaufruf so, dass jeder Fall vorher seinen RAG-Kontext bekommt.
 * @returns {{callModel: Function, stats: object}}
 */
export function wrapCallerWithRag(callModel, projectRoot, options = {}) {
  const stats = { aufrufeMitKontext: 0, aufrufeOhneKontext: 0, zeichenGesamt: 0 };
  // Die Nachsortier-Statistik entsteht nur, wenn wirklich nachsortiert wird —
  // sonst stuende im Bericht ein Zaehlwerk voller Nullen, das so aussieht, als
  // haette der Nachsortierer gelaufen und nichts gefunden.
  const nachsortierung = options?.nachsortierer ? neueNachsortierStatistik() : null;
  if (nachsortierung) stats.nachsortierung = nachsortierung;
  return {
    stats,
    callModel: async (evalCase) => {
      const { case: augmented, contextChars } = await withRagContext(evalCase, projectRoot, {
        ...options,
        statistik: nachsortierung
      });
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
