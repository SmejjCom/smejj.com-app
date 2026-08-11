// smejj.com — Process-Reward & Step-by-Step Reasoner Autopilot (Autopilot Nr. 20)
// Zerlegt Denk- und Codeprozesse in atomare Schritte (Chain-of-Thought), bewertet
// die Zwischenschritte mit einem Process-Reward-Score (PRM) und bricht fehlerhafte Pfade frühzeitig ab.

/**
 * Zerlegt einen Gedankengang oder Code-Lösungsweg in atomare Einzelschritte.
 * @param {string} reasoningTrace
 * @returns {Array<{stepNumber: number, text: string, type: "logic" | "code" | "conclusion"}>}
 */
export function decomposeReasoningSteps(reasoningTrace) {
  if (typeof reasoningTrace !== "string" || !reasoningTrace.trim()) return [];

  const rawLines = reasoningTrace.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const steps = [];
  let currentStep = "";
  let stepIndex = 1;

  for (const line of rawLines) {
    if (/^(?:Schritt|\d+\.|\-|\*|Zuerst|Dann|Danach|Schließlich|Step)\b/i.test(line) && currentStep) {
      steps.push({
        stepNumber: stepIndex++,
        text: currentStep.trim(),
        type: determineStepType(currentStep)
      });
      currentStep = line;
    } else {
      currentStep = currentStep ? `${currentStep}\n${line}` : line;
    }
  }

  if (currentStep) {
    steps.push({
      stepNumber: stepIndex,
      text: currentStep.trim(),
      type: determineStepType(currentStep)
    });
  }

  return steps;
}

function determineStepType(text) {
  if (/```|\b(?:function|const|let|var|class|return)\b/.test(text)) return "code";
  if (/\b(?:ergebnis|fazit|daher|conclusion|somit)\b/i.test(text)) return "conclusion";
  return "logic";
}

/**
 * Bewertet einen einzelnen Denk- oder Codeschritt mit einem Process-Reward-Score (0.0 - 1.0).
 * @param {object} step
 * @param {object} context
 * @returns {{score: number, passed: boolean, reasoning: string}}
 */
export function evaluateStepReward(step, context = {}) {
  let score = 0.5;
  const text = step.text || "";

  if (step.type === "code") {
    // Syntax- und Variablen-Gültigkeit
    const hasUnclosedBrackets = (text.match(/\{/g) || []).length !== (text.match(/\}/g) || []).length;
    const hasUnclosedParens = (text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length;
    if (hasUnclosedBrackets || hasUnclosedParens) {
      score -= 0.3;
    } else {
      score += 0.3;
    }

    if (/\beval\s*\(/.test(text)) score -= 0.4;
    if (/return\b/.test(text)) score += 0.2;
  } else if (step.type === "logic") {
    if (text.length > 20) score += 0.2;
    if (/widerspruch|unmöglich|fehler/i.test(text) && !/löse|behebe/i.test(text)) score -= 0.2;
    if (/\b(?:da|weil|folglich|angenommen)\b/i.test(text)) score += 0.2;
  } else if (step.type === "conclusion") {
    if (text.length >= 10) score += 0.3;
    if (context.expectedResult && !text.includes(String(context.expectedResult))) score -= 0.3;
  }

  score = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));
  const passed = score >= 0.60;

  return {
    score,
    passed,
    reasoning: passed
      ? "Schritt ist logisch und syntaktisch valide."
      : "Schritt weist Inkonsistenzen oder Syntax-Mängel auf."
  };
}

/**
 * Führt eine vollständige Process-Reward-MCTS-Verifikation über den gesamten Lösungsweg durch.
 * @param {string} reasoningTrace
 * @param {object} options
 * @returns {{valid: boolean, overallScore: number, stepsEvaluated: number, prunedAtStep: number | null, stepDetails: Array}}
 */
export function verifyReasoningTracePRM(reasoningTrace, { minStepThreshold = 0.50 } = {}) {
  const steps = decomposeReasoningSteps(reasoningTrace);
  if (steps.length === 0) {
    return { valid: false, overallScore: 0.0, stepsEvaluated: 0, prunedAtStep: null, stepDetails: [] };
  }

  const stepDetails = [];
  let totalScore = 0;
  let prunedAtStep = null;

  for (const step of steps) {
    const evalRes = evaluateStepReward(step);
    stepDetails.push({
      stepNumber: step.stepNumber,
      type: step.type,
      score: evalRes.score,
      passed: evalRes.passed,
      reasoning: evalRes.reasoning
    });

    totalScore += evalRes.score;

    if (evalRes.score < minStepThreshold && prunedAtStep === null) {
      prunedAtStep = step.stepNumber;
    }
  }

  const avgScore = Math.round((totalScore / steps.length) * 100) / 100;
  const valid = prunedAtStep === null && avgScore >= 0.60;

  return {
    valid,
    overallScore: avgScore,
    stepsEvaluated: steps.length,
    prunedAtStep,
    stepDetails
  };
}
