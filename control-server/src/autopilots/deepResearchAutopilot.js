// smejj.com — Deep Research KI-Autopilot
// Führt mehrstufige Recherchen durch, synthetisiert Webinhalte und erstellt zitationsbasierte Berichte.

import { searchWebDetailed } from "../../../src/search/webSearch.js";

export const DEEP_RESEARCH_CONFIG = Object.freeze({
  maxIterations: 3,
  maxResultsPerQuery: 5,
  timeoutMs: 30000
});

export async function runDeepResearch(topic, options = {}) {
  if (!topic || typeof topic !== "string") {
    throw new Error("Deep Research erfordert sein Suchthema als String.");
  }

  const maxIter = options.maxIterations || DEEP_RESEARCH_CONFIG.maxIterations;
  const plan = generateResearchPlan(topic, maxIter);
  const findings = [];
  const citations = new Set();

  for (const step of plan) {
    try {
      const searchResult = await searchWebDetailed(step.query);
      if (searchResult && Array.isArray(searchResult.results)) {
        for (const item of searchResult.results.slice(0, DEEP_RESEARCH_CONFIG.maxResultsPerQuery)) {
          findings.push({
            query: step.query,
            title: item.title || "Unbekannter Titel",
            snippet: item.snippet || item.body || "",
            url: item.url || item.link || ""
          });
          if (item.url) citations.add(item.url);
        }
      }
    } catch (err) {
      // Fehlgeschlagene Einzelsuchen unterbrechen nicht die Gesamtrecherche
      findings.push({
        query: step.query,
        error: String(err?.message || err)
      });
    }
  }

  const report = formatResearchReport(topic, findings, Array.from(citations));

  return {
    status: "success",
    topic,
    stepsExecuted: plan.length,
    findingsCount: findings.length,
    citations: Array.from(citations),
    report,
    timestamp: new Date().toISOString()
  };
}

export function generateResearchPlan(topic, maxIterations = 3) {
  const baseTopic = topic.trim();
  const plan = [{ phase: 1, query: baseTopic, focus: "Überblick & Definitionen" }];

  if (maxIterations >= 2) {
    plan.push({ phase: 2, query: `${baseTopic} Analyse Trends Entwicklungen`, focus: "Vertiefung & Aktuelle Entwicklungen" });
  }
  if (maxIterations >= 3) {
    plan.push({ phase: 3, query: `${baseTopic} Bewertung Vergleich Kritik`, focus: "Kritische Einordnung & Vergleich" });
  }

  return plan;
}

export function formatResearchReport(topic, findings, citations) {
  let md = `# Deep Research Bericht: ${topic}\n\n`;
  md += `*Erstellt am ${new Date().toLocaleDateString("de-DE")} von smejj Deep Research Autopilot*\n\n`;

  md += `## 1. Zusammenfassung der Erkenntnisse\n\n`;
  if (findings.length === 0) {
    md += `Keine Treffer für die Rechercheanfrage gefunden.\n\n`;
  } else {
    for (const f of findings) {
      if (f.error) continue;
      md += `- **${f.title}**: ${f.snippet} ([Quelle](${f.url}))\n`;
    }
    md += `\n`;
  }

  md += `## 2. Quellennachweis & Zitate\n\n`;
  if (citations.length === 0) {
    md += `Keine direkten Webinhalte zitiert.\n`;
  } else {
    citations.forEach((url, i) => {
      md += `[${i + 1}] ${url}\n`;
    });
  }

  return md;
}
