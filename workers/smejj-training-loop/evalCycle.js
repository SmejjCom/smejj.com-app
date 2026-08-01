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
import { callViaControl, chatEndpointFromEnv } from "../../src/evaluation/evalTransport.js";
import { findBaselineReport, runEvalSuite } from "../../scripts/evaluation/run_model_eval.mjs";
import { evalDauerSchaetzungMs, ZYKLUS_SICHERHEITSANTEIL } from "./config.js";

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
  chatEndpoint,
  delayMs = 6000,
  retries = 2,
  wiederholungen = 1,
  tickMaxMs = null,
  callModel,
  readSuite = defaultReadJson,
  writeReport = defaultWriteJson,
  log = () => {},
  now = () => new Date()
}) {
  const suiteFile = path.resolve(repoRoot, suitePath);
  const suite = await readSuite(suiteFile);

  const validation = validateEvalSuite(suite);
  if (!validation.ok) {
    return { ok: false, reason: "suite_invalid", reasons: validation.reasons };
  }

  const cases = selectCases(suite, {});
  const gemessenerWeg = chatEndpoint || chatEndpointFromEnv();
  const call = callModel || ((evalCase) => callViaControl(evalCase, { modelId, endpoint: gemessenerWeg }));

  // Ehrlich melden statt still zu ueberziehen: der Waechter in loop.js gibt die
  // Sperre nach tickMaxMs frei. Wird das ueberschritten, laeuft die Messung ins
  // Leere — das muss im Protokoll stehen, bevor es passiert.
  if (Number.isFinite(tickMaxMs)) {
    const schaetzung = evalDauerSchaetzungMs({ faelle: cases.length, wiederholungen, delayMs });
    if (schaetzung >= tickMaxMs * ZYKLUS_SICHERHEITSANTEIL) {
      log(`[smejj-training-loop] WARNUNG: geschaetzte Zyklusdauer ${Math.round(schaetzung / 1000)} s` +
        ` (nur Abstaende, Antwortzeiten kommen obendrauf) erreicht das Limit ${Math.round(tickMaxMs / 1000)} s` +
        ` (${cases.length} Faelle x ${wiederholungen} x ${delayMs} ms).` +
        ` SMEJJ_EVAL_WIEDERHOLUNGEN senken oder SMEJJ_TRAINING_LOOP_TICK_MAX_MS anheben.`);
    }
  }

  const startedAt = now().toISOString();
  const { caseScores } = await runEvalSuite({ suite, cases, callModel: call, delayMs, retries, wiederholungen });
  const finishedAt = now().toISOString();

  const baseline = baselineOverride !== undefined
    ? vergleichbarerVorlauf(baselineOverride, wiederholungen)
    : await findBaselineReport({
    dir: path.resolve(repoRoot, baselineDir || "docs/benchmarks"),
    suiteId: suite.suiteId,
    contentSha256: suite.integrity.contentSha256,
    modelId,
    endpoint: gemessenerWeg,
    wiederholungen,
    readDir: async (dir) => (await import("node:fs/promises")).readdir(dir),
    readJson: defaultReadJson
  }).catch(() => null);

  const report = buildEvalReport({
    suite,
    run: { modelId, transport: "control", profileMode: "case", live: true, startedAt, finishedAt, endpoint: gemessenerWeg },
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
      medianMs: report.summary.latencyMsMedian,
      wiederholungen: report.summary.wiederholungen,
      wackelig: report.summary.wackelig,
      // Nur die wackeligen Faelle mit ihrer Quote — stabile Faelle stehen ohnehin
      // bei 0 % oder 100 % und wuerden den Verlauf nur aufblaehen. Ausschliesslich
      // Fallkennungen und Zahlen, nie Eingaben oder Antworten.
      wackeligeFaelle: report.cases
        .filter((eintrag) => eintrag.wackelig === true)
        .map((eintrag) => ({
          fall: eintrag.caseId,
          quote: eintrag.quote,
          bestanden: eintrag.bestanden,
          laeufe: eintrag.laeufe
        }))
    }
  };
}

/**
 * Ein Vorlauf mit anderer Wiederholungszahl ist kein Vergleichswert.
 * Der Loop reicht seinen Vorlauf aus dem Checkpoint herein (nicht ueber
 * findBaselineReport), deshalb muss die Pruefung auch hier stehen. Sonst
 * meldete die erste Messung nach einer Aenderung von SMEJJ_EVAL_WIEDERHOLUNGEN
 * eine Regression, die nur ein Wechsel der Messart ist.
 */
function vergleichbarerVorlauf(bericht, wiederholungen) {
  if (!bericht) return bericht;
  const gemessen = Number.isInteger(bericht?.summary?.wiederholungen) ? bericht.summary.wiederholungen : 1;
  return gemessen === wiederholungen ? bericht : null;
}

async function defaultReadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function defaultWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true }).catch(() => {});
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
