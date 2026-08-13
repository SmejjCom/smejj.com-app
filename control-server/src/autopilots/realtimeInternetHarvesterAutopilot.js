// smejj.com — 24/7 Real-Time Internet Ingestion & Knowledge Harvester (Autopilot Nr. 23)
// Durchforstet rund um die Uhr das Internet nach neuen Open-Source Releases, Framework-Updates,
// KI-Research-Paper und API-Änderungen und speichert strukturiertes Wissen auf IDrive e2 S3.

import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { runDeepResearch } from "./deepResearchAutopilot.js";

const harvestedKnowledgeStore = createRecordStore("knowledge/realtime-internet-feed", { maximal: 3000 });

/**
 * Standard-Kategorien für die 24/7 Internet-Wissensgewinnung.
 */
export const HARVEST_TOPICS = Object.freeze([
  "Trending JavaScript & TypeScript frameworks 2026",
  "Latest AI model architectures & LoRA fine-tuning papers",
  "Node.js & web standards API security advisories",
  "Cloud native distributed systems & serverless optimizations"
]);

/**
 * Extrahiert Kernfakten aus einem rohen Internet-Artikel oder Release-Feed.
 * @param {string} rawContent
 * @param {string} sourceTopic
 * @returns {Array<{headline: string, summary: string, tags: string[], confidence: number}>}
 */
export function extractHarvestedFacts(rawContent, sourceTopic = "Allgemein") {
  if (typeof rawContent !== "string" || !rawContent.trim()) return [];

  const lines = rawContent.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const facts = [];

  for (const line of lines) {
    if (line.length >= 25 && !line.startsWith("#")) {
      const tags = [sourceTopic.toLowerCase().slice(0, 15)];
      if (/security|vulnerability|cve/i.test(line)) tags.push("security");
      if (/performance|optimization|speed/i.test(line)) tags.push("performance");
      if (/ai|llm|model|reasoning/i.test(line)) tags.push("ai");

      facts.push({
        headline: line.slice(0, 60),
        summary: line,
        tags,
        confidence: 0.92
      });
    }
  }

  return facts.slice(0, 10);
}

/**
 * Führt einen 24/7 Web-Ingestion-Lauf für ein bestimmtes Themengebiet aus.
 * @param {string} topic
 * @param {object} options
 * @returns {Promise<{ok: boolean, topic: string, factsHarvested: number, batchId?: string, error?: string}>}
 */
export async function executeRealtimeHarvestCycle(topic, { env = process.env } = {}) {
  try {
    // Ohne Vorgabe rotiert das Thema mit dem Kalendertag — NICHT mit
    // Math.random: eine gewuerfelte Themenwahl kann dasselbe Thema tagelang
    // wiederholen und andere nie treffen, und niemand koennte den Lauf
    // nachvollziehen. So ist die Reihenfolge vorhersagbar und lueckenlos.
    const tagDesJahres = Math.floor(Date.now() / 86_400_000);
    const selectedTopic = topic || HARVEST_TOPICS[tagDesJahres % HARVEST_TOPICS.length];
    const researchResult = await runDeepResearch(selectedTopic, { maxRounds: 2 });

    const facts = extractHarvestedFacts(researchResult.report, selectedTopic);
    const batchId = neueKennung("harvest");

    await harvestedKnowledgeStore.schreib({
      id: batchId,
      topic: selectedTopic,
      factCount: facts.length,
      facts,
      createdAt: new Date().toISOString()
    }, { env });

    return {
      ok: true,
      topic: selectedTopic,
      factsHarvested: facts.length,
      batchId
    };
  } catch (err) {
    return {
      ok: false,
      topic: topic || "unknown",
      factsHarvested: 0,
      error: String(err?.message || err)
    };
  }
}

/**
 * Der gemessene Bestand der Ernte — fuer die Ampel und den Tages-Takt.
 * @returns {Promise<{ok: boolean, batches: number, faktenGesamt: number,
 *   letzterBatch: {topic: string, createdAt: string, factCount: number}|null, grund?: string}>}
 */
export async function getHarvestBestand({ env = process.env } = {}) {
  try {
    const listRes = await harvestedKnowledgeStore.liste({ env });
    if (!listRes?.ok) return { ok: false, batches: 0, faktenGesamt: 0, letzterBatch: null, grund: "Ernte-Ablage nicht lesbar" };
    const batches = listRes.datensaetze || [];
    const faktenGesamt = batches.reduce((summe, b) => summe + (Number(b?.factCount) || 0), 0);
    const neuester = batches[0] || null;
    return {
      ok: true,
      batches: batches.length,
      faktenGesamt,
      letzterBatch: neuester ? { topic: neuester.topic || "?", createdAt: neuester.createdAt || "", factCount: Number(neuester.factCount) || 0 } : null
    };
  } catch (fehler) {
    return { ok: false, batches: 0, faktenGesamt: 0, letzterBatch: null, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

/**
 * Die geernteten Fakten als RAG-Chunks — dieselbe Form wie loadKnowledgeChunks
 * ({id, source, heading, text}), damit buildIndex sie ohne Sonderweg schluckt.
 * Damit ist der Feed zum ERSTEN Mal mit dem Wissen verbunden, das der Agent
 * tatsaechlich benutzt; vorher schrieb der Harvester in eine Ablage, die
 * niemand las. Fail-soft: jeder Fehler ergibt [], RAG bricht nie.
 */
export async function ladeErnteChunks({ env = process.env, maxFakten = 200 } = {}) {
  try {
    const listRes = await harvestedKnowledgeStore.liste({ env });
    if (!listRes?.ok) return [];
    const chunks = [];
    for (const batch of listRes.datensaetze || []) {
      for (const [i, fakt] of (batch.facts || []).entries()) {
        if (chunks.length >= maxFakten) return chunks;
        const datum = String(batch.createdAt || "").slice(0, 10);
        chunks.push({
          id: `ernte:${batch.id}:${i}`,
          source: `internet-ernte/${datum || "unbekannt"}`,
          heading: String(fakt.headline || "").slice(0, 80),
          text: `${fakt.summary || ""} (Internet-Ernte vom ${datum || "?"}, Thema: ${batch.topic || "?"})`
        });
      }
    }
    return chunks;
  } catch {
    return [];
  }
}
