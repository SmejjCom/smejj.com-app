// smejj.com — Cross-Model Knowledge Distiller Autopilot (Autopilot Nr. 21)
// Destilliert hochkomplexe Lösungs- und Denkstrukturen in kompakte, verifizierte
// Trainings-Archetypen für das Training der nächsten Modell-Generation (smejj 2.0).

import { createRecordStore } from "../admin/recordStore.js";
import { runCodeInterpreter } from "./codeInterpreterAutopilot.js";
import { createDpoPair, saveDpoPair } from "./selfImprovementAutopilot.js";

const distilledStore = createRecordStore("self-improvement/distilled-datasets", { maximal: 1500 });

/**
 * Destilliert die beste Lösungsstrategie aus mehreren Lösungsansätzen.
 * @param {string} prompt
 * @param {Array<{model: string, reasoning: string, code: string}>} candidateSolutions
 * @returns {{winnerModel: string, distilledReasoning: string, verifiedCode: string, isSound: boolean}}
 */
export function distillOptimalReasoning(prompt, candidateSolutions = []) {
  if (!Array.isArray(candidateSolutions) || candidateSolutions.length === 0) {
    return { winnerModel: "none", distilledReasoning: "", verifiedCode: "", isSound: false };
  }

  let bestSolution = null;
  let bestScore = -1;

  for (const sol of candidateSolutions) {
    let score = 0;
    const code = sol.code || "";
    const reasoning = sol.reasoning || "";

    // 1. Sandbox-Ausführung und Verifikation
    if (code) {
      const sandboxRes = runCodeInterpreter(code);
      if (sandboxRes.status === "success") {
        score += 50;
      } else {
        score -= 30;
      }
    }

    // 2. Denk-Tiefe und Klarheit
    if (reasoning.length > 50) score += 20;
    if (/\b(?:Schritt|Step|Zuerst|Daher|Invariant)\b/i.test(reasoning)) score += 15;
    if (/```[a-z]*\n[\s\S]*?\n```/.test(reasoning)) score += 15;

    if (score > bestScore) {
      bestScore = score;
      bestSolution = sol;
    }
  }

  if (!bestSolution || bestScore < 40) {
    return { winnerModel: "none", distilledReasoning: "", verifiedCode: "", isSound: false };
  }

  const cleanDistillation = [
    `### Verifizierter Lösungsweg für: ${prompt.slice(0, 80)}`,
    bestSolution.reasoning.trim(),
    bestSolution.code ? `\`\`\`javascript\n${bestSolution.code.trim()}\n\`\`\`` : ""
  ].filter(Boolean).join("\n\n");

  return {
    winnerModel: bestSolution.model || "distilled_champion",
    distilledReasoning: cleanDistillation,
    verifiedCode: bestSolution.code || "",
    isSound: true
  };
}

/**
 * Führt einen Destillations- und Persistierungs-Lauf durch.
 * @param {string} prompt
 * @param {Array<object>} solutions
 * @param {object} options
 * @returns {Promise<{ok: boolean, distilledId?: string, error?: string}>}
 */
export async function processDistillationRun(prompt, solutions, { env = process.env } = {}) {
  try {
    const distillation = distillOptimalReasoning(prompt, solutions);
    if (!distillation.isSound) {
      return { ok: false, error: "Keine der Lösungen erfüllte die hohen Qualitäts- und Sandbox-Kriterien." };
    }

    const recordId = `distill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await distilledStore.schreib({
      id: recordId,
      prompt,
      winnerModel: distillation.winnerModel,
      distilledReasoning: distillation.distilledReasoning,
      createdAt: new Date().toISOString()
    }, { env });

    // DPO-Trainingspaar für smejj 2.0 generieren (beste Lösung vs. schwächere Lösung)
    const inferior = solutions.find((s) => s.model !== distillation.winnerModel);
    if (inferior) {
      const dpo = createDpoPair(
        prompt,
        distillation.distilledReasoning,
        inferior.reasoning || "Unvollständige Lösung",
        { source: "cross_model_distillation", winner: distillation.winnerModel }
      );
      await saveDpoPair(dpo, { env });
    }

    return { ok: true, distilledId: recordId };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
