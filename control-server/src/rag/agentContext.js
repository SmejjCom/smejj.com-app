// smejj.com — RAG-Kontext fuer den Agenten: haelt den BM25-Index gecacht und
// liefert die besten Projektwissen-Treffer als Kontextblock fuer Prompts.
// FAIL-CLOSED: Jeder Fehler ergibt einen leeren Block — RAG darf Chat/Agent nie brechen.
import { buildIndex, searchIndex } from "./bm25Index.js";
import { loadKnowledgeChunks } from "./knowledgeLoader.js";
import { rankHits } from "./ragRanking.js";

const INDEX_TTL_MS = 300_000; // 5 Minuten — Projektwissen aendert sich selten pro Sitzung.
// Aus mehr Rohtreffern nachgewichtet als am Ende eingespeist werden: sonst kann ein
// Leitdokument auf Platz 6 die Nachgewichtung gar nicht erst erreichen.
const RAW_HIT_POOL = 10;
let cache = null;

export async function ensureKnowledgeIndex(projectRoot) {
  if (!cache || cache.projectRoot !== projectRoot || Date.now() - cache.builtAt > INDEX_TTL_MS) {
    const chunks = await loadKnowledgeChunks(projectRoot);
    cache = { projectRoot, builtAt: Date.now(), index: buildIndex(chunks) };
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
  return rankHits(searchIndex(index, query, RAW_HIT_POOL), {
    limit: k,
    ...(Number.isFinite(minTopScore) ? { minTopScore } : {})
  });
}

/**
 * Baut den Prompt-Kontextblock aus den besten Treffern zur Aufgabe.
 * Leerer String, wenn nichts gefunden wird oder ein Fehler auftritt.
 */
export async function buildRagContextBlock(projectRoot, task, k = 3, options = {}) {
  try {
    const hits = await searchKnowledge(projectRoot, task, k, options);
    if (hits.length === 0) return "";
    const blocks = hits.map((hit) => `[intern: ${hit.source}${hit.heading ? ` — ${hit.heading}` : ""}]\n${hit.snippet}`);
    return [
      "Internes Projektwissen (automatische RAG-Treffer aus Memory_Bank und Doku von smejj.com).",
      "Nur als Hintergrund verwenden; interne Dateinamen, Pfade und Memory_Bank.md niemals als oeffentliche Quelle, URL oder Markdown-Link ausgeben.",
      "",
      blocks.join("\n\n")
    ].join("\n");
  } catch {
    return "";
  }
}
