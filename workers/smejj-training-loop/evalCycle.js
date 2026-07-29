// smejj.com training-loop worker — one live eval pass (Single Responsibility: eval cycle).
// Reuses the exact same building blocks as `npm run eval:models:live`
// (scripts/evaluation/run_model_eval.mjs) instead of re-implementing scoring or
// report shape — this cycle is a scheduled, unattended caller of that pipeline,
// not a second implementation of it. A regression against the last live report
// is logged, never auto-promoted (eligibleForTraining is hardcoded false in
// src/evaluation/evalReport.js — that decision stays human-owned).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectCases, validateEvalSuite } from "../../src/evaluation/evalSuite.js";
import { buildEvalReport, EVAL_VERDICT, formatEvalSummary } from "../../src/evaluation/evalReport.js";
import { callViaControl } from "../../src/evaluation/evalTransport.js";
import { findBaselineReport, runEvalSuite } from "../../scripts/evaluation/run_model_eval.mjs";

function reportFileName(suiteId, modelId, isoDate) {
  const safeModel = String(modelId || "unknown").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `modeleval-${suiteId}-${safeModel}-${isoDate.slice(0, 10)}.json`;
}

/**
 * Runs one suite pass against the live chat bridge and persists the report.
 * The suite itself is always read from the local, image-baked, git-tracked
 * file (`readSuite`) — but the *report* target is fully opaque to this
 * function: `writeReport(target, report)` and `baseline` are injected by the
 * caller. The CLI-parity default writes to docs/benchmarks/ like
 * `npm run eval:models:live`; the loop instead persists to IDrive e2 (see
 * reportStore.js) — local container disk is wiped on every restart, and
 * IDrive e2 is where the storage policy already lists "Benchmarks".
 * When `baseline` is omitted, the CLI's own directory-scan
 * (findBaselineReport) is used so standalone/test invocations still work.
 */
export async function runEvalCycle({
  repoRoot,
  suitePath,
  baselineDir,
  reportTarget,
  baseline: baselineOverride,
  modelId = "live-default",
  delayMs = 6000,
  retries = 2,
  callModel,
  readSuite = defaultReadJson,
  writeReport = defaultWriteJson,
  now = () => new Date()
}) {
  const suiteFile = path.resolve(repoRoot, suitePath);
  const suite = await readSuite(suiteFile);

  const validation = validateEvalSuite(suite);
  if (!validation.ok) {
    return { ok: false, reason: "suite_invalid", reasons: validation.reasons };
  }

  const cases = selectCases(suite, {});
  const call = callModel || ((evalCase) => callViaControl(evalCase, { modelId }));

  const startedAt = now().toISOString();
  const { caseScores } = await runEvalSuite({ suite, cases, callModel: call, delayMs, retries });
  const finishedAt = now().toISOString();

  const baseline = baselineOverride !== undefined ? baselineOverride : await findBaselineReport({
    dir: path.resolve(repoRoot, baselineDir || "docs/benchmarks"),
    suiteId: suite.suiteId,
    contentSha256: suite.integrity.contentSha256,
    modelId,
    readDir: async (dir) => (await import("node:fs/promises")).readdir(dir),
    readJson: defaultReadJson
  }).catch(() => null);

  const report = buildEvalReport({
    suite,
    run: { modelId, transport: "control", profileMode: "case", live: true, startedAt, finishedAt },
    caseScores,
    baseline
  });

  const target = reportTarget || path.join(baselineDir || "docs/benchmarks", reportFileName(suite.suiteId, modelId, finishedAt));
  await writeReport(target, report);

  return {
    ok: true,
    verdict: report.verdict,
    regressed: report.verdict === EVAL_VERDICT.REGRESSION || report.verdict === EVAL_VERDICT.BUDGET_VIOLATED,
    summary: formatEvalSummary(report),
    reportTarget: target,
    // Die nackten Zahlen zusaetzlich zum lesbaren Text: der Loop fuehrt daraus
    // seinen Verlauf (loop.js), damit der Trend auch dann sichtbar bleibt, wenn
    // die Ablage nicht erreichbar ist. Bewusst aus report.summary abgeleitet und
    // nicht neu berechnet — es darf nur EINE Wahrheit fuer diese Zahlen geben.
    kennzahlen: {
      punktzahl: report.summary.weightedScore,
      faelle: report.summary.cases,
      bestanden: report.summary.passed,
      nichtBestanden: report.summary.failed,
      kritischeFehler: report.summary.criticalFailures,
      p95Ms: report.summary.latencyMsP95,
      medianMs: report.summary.latencyMsMedian
    }
  };
}

async function defaultReadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function defaultWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true }).catch(() => {});
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
