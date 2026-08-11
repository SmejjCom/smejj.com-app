// smejj.com — 24/7 Real-Time Internet Ingestion & Knowledge Harvester (Autopilot Nr. 23)
// Durchforstet rund um die Uhr das Internet nach neuen Open-Source Releases, Framework-Updates,
// KI-Research-Paper und API-Änderungen und speichert strukturiertes Wissen auf IDrive e2 S3.

import { createRecordStore } from "../admin/recordStore.js";
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
    const selectedTopic = topic || HARVEST_TOPICS[Math.floor(Math.random() * HARVEST_TOPICS.length)];
    const researchResult = await runDeepResearch(selectedTopic, { maxRounds: 2 });

    const facts = extractHarvestedFacts(researchResult.report, selectedTopic);
    const batchId = `harvest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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
