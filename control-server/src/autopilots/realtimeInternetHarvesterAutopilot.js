// smejj.com — 24/7 Real-Time Internet Ingestion & Knowledge Harvester (Autopilot Nr. 23)
// Durchforstet rund um die Uhr das Internet nach neuen Open-Source Releases, Framework-Updates,
// KI-Research-Paper und API-Änderungen und speichert strukturiertes Wissen auf IDrive e2 S3.

import { createHash } from "node:crypto";
import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { runDeepResearch } from "./deepResearchAutopilot.js";
import { STANDARD_THEMEN, themaFuer, themenListe } from "../../../src/markt/marktthemen.js";

const harvestedKnowledgeStore = createRecordStore("knowledge/realtime-internet-feed", { maximal: 3000 });

/**
 * Standard-Kategorien für die 24/7 Internet-Wissensgewinnung.
 */
export const HARVEST_TOPICS = STANDARD_THEMEN;

/** Wie lange ein geernteter Fund als aktuell gilt (Spur 2, 21.09.2026). */
export const ERNTE_HALTBAR_TAGE = 120;

// Zeilen, die aus dem BERICHT stammen und kein Wissen sind: Fusszeile,
// Ueberschriften, Quellenliste. Gemessen am 21.09.2026 stand in JEDEM der 42
// Ernte-Laeufe die Zeile "*Erstellt am ... von smejj Deep Research Autopilot*"
// als Fakt Nummer 1 im Wissensspeicher.
const BERICHTS_RESTE = /^(\*|#|\[\d+\]|Keine (Treffer|direkten))/;

/** Ein Fund ist genau einmal wert, gemerkt zu werden: Adresse + Auszug. */
export function fundFingerabdruck(fund) {
  const roh = `${String(fund?.url || "").trim().toLowerCase()}|${String(fund?.summary || fund?.snippet || "").trim().slice(0, 200)}`;
  return createHash("sha256").update(roh).digest("hex").slice(0, 24);
}

/**
 * Fakten aus den ECHTEN Suchfunden (Titel, Auszug, Adresse) statt aus dem
 * gerenderten Bericht. Jeder Fakt traegt seine Quelle — ohne Adresse kein Fakt:
 * ein Satz ohne Herkunft ist im Wissensspeicher nicht pruefbar.
 */
export function ernteFaktenAusFunden(funde, sourceTopic = "Allgemein", { max = 12 } = {}) {
  const gesehen = new Set();
  const fakten = [];
  for (const fund of Array.isArray(funde) ? funde : []) {
    if (fakten.length >= max) break;
    const url = String(fund?.url || "").trim();
    const auszug = String(fund?.snippet || "").replace(/\s+/g, " ").trim();
    const titel = String(fund?.title || "").replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(url) || auszug.length < 25) continue;
    const abdruck = fundFingerabdruck({ url, summary: auszug });
    if (gesehen.has(abdruck)) continue;
    gesehen.add(abdruck);
    fakten.push({
      headline: (titel || auszug).slice(0, 80),
      // Kurzes Zitat mit Quelle — nicht der ganze fremde Text.
      summary: auszug.slice(0, 400),
      url,
      thema: sourceTopic,
      tags: markiere(`${titel} ${auszug}`, sourceTopic),
      abdruck
    });
  }
  return fakten;
}

function markiere(text, sourceTopic) {
  const tags = [String(sourceTopic).toLowerCase().slice(0, 20)];
  if (/security|vulnerability|cve|sicherheit/i.test(text)) tags.push("security");
  if (/preis|price|pricing|kosten|abo/i.test(text)) tags.push("preise");
  if (/openai|chatgpt|gemini|claude|perplexity|deepseek|qwen|mistral|grok/i.test(text)) tags.push("wettbewerb");
  if (/ai|llm|model|reasoning|ki-/i.test(text)) tags.push("ai");
  return tags;
}

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
    if (line.length >= 25 && !BERICHTS_RESTE.test(line)) {
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
    const themen = themenListe(env);
    const tagDesJahres = Math.floor(Date.now() / 86_400_000);
    const selectedTopic = topic || themaFuer(tagDesJahres, themen);
    const researchResult = await runDeepResearch(selectedTopic, { maxRounds: 2 });

    // Zuerst die echten Funde; nur wenn keine kommen, der alte Weg ueber den
    // Berichtstext (dann ohne Quelle, aber besser als nichts).
    const roh = ernteFaktenAusFunden(researchResult.findings, selectedTopic);
    const facts = roh.length ? await ohneDubletten(roh, { env }) : extractHarvestedFacts(researchResult.report, selectedTopic);
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

/** Faellt weg, was schon im Speicher liegt — sonst wandert dieselbe Seite taeglich neu hinein. */
async function ohneDubletten(fakten, { env = process.env } = {}) {
  try {
    const listRes = await harvestedKnowledgeStore.liste({ env });
    if (!listRes?.ok) return fakten;
    const bekannt = new Set();
    for (const batch of listRes.datensaetze || []) {
      for (const f of batch.facts || []) bekannt.add(f.abdruck || fundFingerabdruck(f));
    }
    return fakten.filter((f) => !bekannt.has(f.abdruck));
  } catch {
    return fakten;
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
export async function ladeErnteChunks({ env = process.env, maxFakten = 200, listeLader = null, jetztMs = Date.now() } = {}) {
  try {
    const listRes = listeLader ? await listeLader({ env }) : await harvestedKnowledgeStore.liste({ env });
    if (!listRes?.ok) return [];
    const chunks = [];
    const aelteste = jetztMs - ERNTE_HALTBAR_TAGE * 86_400_000;
    // Neueste zuerst: wenn der Deckel greift, faellt das Alte weg, nicht das Neue.
    const stapel = [...(listRes.datensaetze || [])]
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
    for (const batch of stapel) {
      const zeit = Date.parse(batch?.createdAt || "");
      if (Number.isFinite(zeit) && zeit < aelteste) continue;
      for (const [i, fakt] of (batch.facts || []).entries()) {
        if (chunks.length >= maxFakten) return chunks;
        const datum = String(batch.createdAt || "").slice(0, 10);
        const text = String(fakt?.summary || "").trim();
        // Auch BEIM LESEN filtern: die 42 Laeufe vor dem 21.09.2026 liegen
        // weiter im Speicher und tragen je eine Berichts-Fusszeile. Geloescht
        // wird nichts (Betreiber-Regel), sie kommen nur nicht mehr ins Wissen.
        if (text.length < 25 || BERICHTS_RESTE.test(text)) continue;
        const quelle = String(fakt?.url || "").trim();
        chunks.push({
          id: `ernte:${batch.id}:${i}`,
          source: `internet-ernte/${datum || "unbekannt"}`,
          heading: String(fakt.headline || "").slice(0, 80),
          // Datum und Quelle gehoeren IN den Text: der Agent soll sagen koennen,
          // woher etwas stammt und wie alt es ist.
          text: `${text} (Stand ${datum || "?"}, Thema: ${batch.topic || "?"}${quelle ? `, Quelle: ${quelle}` : ""})`
        });
      }
    }
    return chunks;
  } catch {
    return [];
  }
}
