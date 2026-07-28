// smejj.com — Eval-Bericht: Budgets pruefen, mit dem Vorlauf vergleichen, Urteil bilden.
//
// Der Bericht ist das Artefakt, das in docs/benchmarks/ abgelegt und ins Object Brain
// (IDrive e2) hochgeladen wird. Er enthaelt bewusst KEINE Modellantworten im Klartext,
// nur Kennzahlen und Erwartungs-Ergebnisse — damit er weder Nutzerdaten noch
// Fremdmodell-Ausgaben transportiert (Trainingsdaten-Policy, fail-closed).
import { aggregateCaseScores } from "./evalScoring.js";

/** Toleranz, unterhalb derer ein Punktzahl-Unterschied als Rauschen gilt. */
export const SCORE_REGRESSION_TOLERANCE = 0.02;
/** Antwortzeit darf gegenueber dem Vorlauf um hoechstens diesen Faktor steigen. */
export const LATENCY_REGRESSION_FACTOR = 1.2;

export const EVAL_VERDICT = Object.freeze({
  PASSED: "passed",
  BUDGET_VIOLATED: "budget-violated",
  REGRESSION: "regression",
  BLOCKED: "blocked"
});

/**
 * Baut den vollstaendigen Bericht.
 * @param {object} input
 * @param {object} input.suite            validierte Eval-Suite
 * @param {object} input.run              {modelId, transport, profileMode, startedAt, finishedAt, live}
 * @param {object[]} input.caseScores     Ergebnis von scoreCase() je Fall
 * @param {object|null} input.baseline    frueherer Bericht desselben Modells (oder null)
 */
export function buildEvalReport({ suite, run, caseScores, baseline = null } = {}) {
  const summary = aggregateCaseScores(caseScores);
  const budgets = suite?.budgets || {};
  const violations = budgetViolations(summary, budgets);
  const comparison = compareWithBaseline(summary, baseline);

  let verdict = EVAL_VERDICT.PASSED;
  if (violations.length > 0) verdict = EVAL_VERDICT.BUDGET_VIOLATED;
  if (comparison.regressed) verdict = EVAL_VERDICT.REGRESSION;
  if (summary.criticalFailures > 0) verdict = EVAL_VERDICT.BLOCKED;

  return {
    schemaVersion: 1,
    kind: "smejj.com-model-eval-report",
    suite: {
      suiteId: suite?.suiteId || null,
      version: suite?.version || null,
      contentSha256: suite?.integrity?.contentSha256 || null
    },
    run: {
      modelId: String(run?.modelId || "unknown"),
      transport: String(run?.transport || "unknown"),
      profileMode: String(run?.profileMode || "case"),
      live: run?.live === true,
      startedAt: run?.startedAt || null,
      finishedAt: run?.finishedAt || null,
      // Beleg, wer wirklich geantwortet hat — angefordertes und antwortendes
      // Modell koennen wegen Router-Fallback auseinanderfallen.
      backendsSeen: distinct(caseScores, "backend"),
      resolvedModelIds: distinct(caseScores, "resolvedModelId")
    },
    budgets: {
      minScore: numberOrNull(budgets.minScore),
      latencyMsP95: numberOrNull(budgets.latencyMsP95),
      firstTokenMs: numberOrNull(budgets.firstTokenMs)
    },
    summary,
    violations,
    comparison,
    verdict,
    // Beforderung eines Modells ist nie automatisch — sie braucht die schriftliche
    // Freigabe des Betreibers (Autonomie-Charta, Rote Liste).
    automaticPromotionAllowed: false,
    eligibleForTraining: false,
    cases: caseScores.map((entry) => ({
      caseId: entry.caseId,
      profile: entry.profile,
      weight: entry.weight,
      status: entry.status,
      score: entry.score,
      criticalFailed: entry.criticalFailed,
      latencyMs: entry.latencyMs,
      firstTokenMs: entry.firstTokenMs,
      outputChars: entry.outputChars,
      backend: entry.backend || null,
      resolvedModelId: entry.resolvedModelId || null,
      // Mehr als ein Versuch heisst: der Transportweg war wackelig, nicht das Modell.
      attempts: Number.isInteger(entry.attempts) ? entry.attempts : 1,
      error: entry.error,
      failedAssertions: entry.assertions
        .filter((assertion) => !assertion.ok)
        .map((assertion) => ({ type: assertion.type, critical: assertion.critical }))
    }))
  };
}

/** Harte Budgetverletzungen. Leeres Array bedeutet: alle Budgets eingehalten. */
export function budgetViolations(summary, budgets) {
  const violations = [];
  if (Number.isFinite(budgets?.minScore) && summary.weightedScore < budgets.minScore) {
    violations.push({ code: "score_below_budget", actual: summary.weightedScore, budget: budgets.minScore });
  }
  if (Number.isFinite(budgets?.latencyMsP95) && Number.isFinite(summary.latencyMsP95) &&
      summary.latencyMsP95 > budgets.latencyMsP95) {
    violations.push({ code: "latency_p95_above_budget", actual: summary.latencyMsP95, budget: budgets.latencyMsP95 });
  }
  if (Number.isFinite(budgets?.firstTokenMs) && Number.isFinite(summary.firstTokenMsP95) &&
      summary.firstTokenMsP95 > budgets.firstTokenMs) {
    violations.push({ code: "first_token_above_budget", actual: summary.firstTokenMsP95, budget: budgets.firstTokenMs });
  }
  return violations;
}

/**
 * Vergleich mit dem letzten Bericht desselben Modells. Eine Verschlechterung ist
 * laut Performance-Lock ein Fehler, kein blosser Hinweis.
 */
export function compareWithBaseline(summary, baseline) {
  const previous = baseline?.summary;
  if (!previous || typeof previous !== "object") {
    return { hasBaseline: false, regressed: false, reasons: [], scoreDelta: null, latencyDeltaMs: null };
  }
  const reasons = [];
  const scoreDelta = Number.isFinite(previous.weightedScore)
    ? round4(summary.weightedScore - previous.weightedScore)
    : null;
  if (Number.isFinite(scoreDelta) && scoreDelta < -SCORE_REGRESSION_TOLERANCE) {
    reasons.push("score_regression");
  }
  let latencyDeltaMs = null;
  if (Number.isFinite(previous.latencyMsP95) && Number.isFinite(summary.latencyMsP95)) {
    latencyDeltaMs = summary.latencyMsP95 - previous.latencyMsP95;
    if (summary.latencyMsP95 > previous.latencyMsP95 * LATENCY_REGRESSION_FACTOR) {
      reasons.push("latency_regression");
    }
  }
  if (Number.isFinite(previous.criticalFailures) && summary.criticalFailures > previous.criticalFailures) {
    reasons.push("critical_failure_regression");
  }
  return {
    hasBaseline: true,
    regressed: reasons.length > 0,
    reasons,
    scoreDelta,
    latencyDeltaMs,
    baselineVersion: baseline?.suite?.version || null,
    baselineModelId: baseline?.run?.modelId || null
  };
}

/**
 * Kurze, menschenlesbare Zusammenfassung fuer die Konsole und die Task Capsule.
 * Absichtlich ohne Antworttexte.
 */
export function formatEvalSummary(report) {
  const s = report.summary;
  const lines = [
    `Suite ${report.suite.suiteId} ${report.suite.version} — Modell ${report.run.modelId} (${report.run.transport})`,
    `Punktzahl ${(s.weightedScore * 100).toFixed(1)} % (Budget ${((report.budgets.minScore ?? 0) * 100).toFixed(0)} %)`,
    `Faelle: ${s.passed} bestanden, ${s.partial} teilweise, ${s.failed} nicht bestanden, ${s.errors} Fehler`,
    `Antwortzeit p95 ${s.latencyMsP95 ?? "-"} ms, erster Token p95 ${s.firstTokenMsP95 ?? "-"} ms`,
    `Kritische Verstoesse: ${s.criticalFailures}`,
    `Urteil: ${report.verdict}`
  ];
  if (report.comparison.hasBaseline) {
    const delta = report.comparison.scoreDelta;
    const sign = Number.isFinite(delta) && delta >= 0 ? "+" : "";
    lines.push(`Vergleich zum Vorlauf: ${sign}${((delta ?? 0) * 100).toFixed(1)} Prozentpunkte` +
      (report.comparison.regressed ? ` — Regression (${report.comparison.reasons.join(", ")})` : ""));
  }
  return lines.join("\n");
}

function distinct(caseScores, key) {
  const values = (Array.isArray(caseScores) ? caseScores : [])
    .map((entry) => String(entry?.[key] || "").trim())
    .filter(Boolean);
  return [...new Set(values)].sort();
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}
