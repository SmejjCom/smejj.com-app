// smejj.com — RAG-Kontext fuer den Agenten: haelt den BM25-Index gecacht und
// liefert die besten Projektwissen-Treffer als Kontextblock fuer Prompts.
// FAIL-CLOSED: Jeder Fehler ergibt einen leeren Block — RAG darf Chat/Agent nie brechen.
import { buildIndex } from "./bm25Index.js";
import { loadKnowledgeChunks } from "./knowledgeLoader.js";
// Suche und Blocktext liegen bewusst in einem I/O-freien Modul: die Chat-Bridge hat
// keine Repo-Dateien und laedt einen fertigen Index, nutzt aber exakt denselben Code.
import { buildRagContextFromIndex, searchRagIndex } from "./ragContextBlock.js";
// Wissens-Ernte (2026-08-13): die taeglich geernteten Internet-Fakten wandern
// mit in den Index. Vorher schrieb der Harvester in eine Ablage, die niemand
// las — jetzt weiss der Agent Neues, ohne dass jemand trainiert oder deployt.
import { ladeErnteChunks } from "../autopilots/realtimeInternetHarvesterAutopilot.js";

const INDEX_TTL_MS = 300_000; // 5 Minuten — Projektwissen aendert sich selten pro Sitzung.
let cache = null;

export async function ensureKnowledgeIndex(projectRoot) {
  if (!cache || cache.projectRoot !== projectRoot || Date.now() - cache.builtAt > INDEX_TTL_MS) {
    const chunks = await loadKnowledgeChunks(projectRoot);
    // Fail-soft ([] bei jedem Fehler): eine kranke Ernte-Ablage darf den
    // Repo-Index nie mitreissen — weniger Wissen ist kein kaputtes Wissen.
    const ernte = await ladeErnteChunks().catch(() => []);
    cache = { projectRoot, builtAt: Date.now(), index: buildIndex([...chunks, ...ernte]) };
  }
  return cache.index;
}

/**
 * Sucht Wissens-Treffer; Output wie searchIndex ([{id, source, heading, score, snippet}]),
 * zusaetzlich nach Quellen-Autoritaet nachgewichtet (ragRanking.js).
 * Leeres Ergebnis, wenn kein Treffer die Relevanzschwelle erreicht.
 */
export async function searchKnowledge(projectRoot, query, k = 5, { minTopScore } = {}) {
  const index = await ensureKnowledgeIndex(projectRoot);
  return searchRagIndex(index, query, k, { minTopScore });
}

/**
 * Baut den Prompt-Kontextblock aus den besten Treffern zur Aufgabe.
 * Leerer String, wenn nichts gefunden wird oder ein Fehler auftritt.
 */
export async function buildRagContextBlock(projectRoot, task, k = 3, options = {}) {
  try {
    return buildRagContextFromIndex(await ensureKnowledgeIndex(projectRoot), task, k, options);
  } catch {
    return "";
  }
}
