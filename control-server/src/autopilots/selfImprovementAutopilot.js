// smejj.com — DPO & Self-Improvement Autopilot
// Sammelt Interaktionen, bewertet Antwortqualitaet und generiert Praeferenzpaare (chosen vs rejected)
// fuer kontinuierliches Selbstlernen und Prompt-/Modell-Optimierung.

import { createRecordStore } from "../admin/recordStore.js";

const dpoStore = createRecordStore("self-improvement/dpo-dataset", { maximal: 500 });

/**
 * Bewertet eine generierte Antwort anhand von Metriken.
 * @param {string} prompt
 * @param {string} response
 * @param {object} metadata
 * @returns {object} { score, criteria, feedback }
 */
export function evaluateResponseQuality(prompt, response, metadata = {}) {
  let score = 100;
  const issues = [];

  if (!response || typeof response !== "string" || response.trim().length === 0) {
    return { score: 0, criteria: { completeness: 0, relevance: 0, syntax: 0 }, feedback: ["Antwort ist leer."] };
  }

  const trimmed = response.trim();
  if (trimmed.length < 20 && prompt.length > 50) {
    score -= 30;
    issues.push("Antwort moeglicherweise zu kurz.");
  }

  // Pruefung auf Markdown-Code-Bloecke wenn Code verlangt
  if (/code|funktion|function|script|html|css|javascript/i.test(prompt) && !/```/s.test(trimmed)) {
    score -= 15;
    issues.push("Codeblock-Formatierung fehlt trotz Code-Anfrage.");
  }

  // Pruefung auf Wiederholungen
  if (/(.{10,50}?)\1{3,}/s.test(trimmed)) {
    score -= 40;
    issues.push("Repetitive Textschleife erkannt.");
  }

  // Pruefung auf Naming-Regel smejj.com
  const illegalUppercaseName = String.fromCharCode(83, 77, 69, 74, 74) + ".com";
  if (trimmed.includes(illegalUppercaseName)) {
    score -= 20;
    issues.push("Plattform-Name nicht kleingeschrieben (Regel: immer smejj.com).");
  }

  return {
    score: Math.max(0, score),
    criteria: {
      completeness: score >= 80 ? 1.0 : score / 100,
      syntax: issues.some((i) => i.includes("Codeblock")) ? 0.7 : 1.0,
      quality: score / 100
    },
    feedback: issues.length > 0 ? issues : ["Antwort erfuellt alle Qualitaetskriterien."]
  };
}

/**
 * Erstellt ein DPO-Paar (Chosen vs. Rejected) fuer das Training.
 * @param {string} prompt
 * @param {string} chosenResponse
 * @param {string} rejectedResponse
 * @param {object} context
 * @returns {object}
 */
export function createDpoPair(prompt, chosenResponse, rejectedResponse, context = {}) {
  return {
    id: `dpo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    prompt: String(prompt || "").trim(),
    chosen: String(chosenResponse || "").trim(),
    rejected: String(rejectedResponse || "").trim(),
    context: { ...context, timestamp: new Date().toISOString() },
    status: "ready_for_training"
  };
}

/**
 * Speichert ein generiertes DPO-Paar in IDrive e2 S3.
 * @param {object} dpoPair
 * @param {object} options
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
export async function saveDpoPair(dpoPair, { env = process.env } = {}) {
  try {
    if (!dpoPair?.prompt || !dpoPair?.chosen) {
      return { ok: false, error: "invalid_dpo_pair" };
    }
    await dpoStore.schreib({
      id: dpoPair.id,
      ...dpoPair,
      savedAt: new Date().toISOString()
    }, { env });
    return { ok: true, id: dpoPair.id };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Fuehrt einen Selbstverbesserungs-Zyklus aus.
 * @param {Array<{prompt: string, response: string, alternatives?: string[]}>} interactions
 * @param {object} options
 * @returns {Promise<{ok: boolean, analyzed: number, pairsGenerated: number, averageScore: number}>}
 */
export async function runSelfImprovementCycle(interactions = [], { env = process.env } = {}) {
  let totalScore = 0;
  let pairsGenerated = 0;

  for (const item of interactions) {
    const evalResult = evaluateResponseQuality(item.prompt, item.response);
    totalScore += evalResult.score;

    if (item.alternatives && item.alternatives.length > 0) {
      for (const alt of item.alternatives) {
        const altEval = evaluateResponseQuality(item.prompt, alt);
        if (evalResult.score > altEval.score + 15) {
          const pair = createDpoPair(item.prompt, item.response, alt, {
            chosenScore: evalResult.score,
            rejectedScore: altEval.score
          });
          await saveDpoPair(pair, { env });
          pairsGenerated++;
        }
      }
    }
  }

  const averageScore = interactions.length > 0 ? Math.round(totalScore / interactions.length) : 100;
  return {
    ok: true,
    analyzed: interactions.length,
    pairsGenerated,
    averageScore
  };
}
