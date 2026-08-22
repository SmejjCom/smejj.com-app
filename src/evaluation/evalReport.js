// smejj.com — Eval-Bericht: Budgets pruefen, mit dem Vorlauf vergleichen, Urteil bilden.
//
// Der Bericht ist das Artefakt, das in docs/benchmarks/ abgelegt und ins Object Brain
// (IDrive e2) hochgeladen wird. Er enthaelt bewusst KEINE Modellantworten im Klartext,
// nur Kennzahlen und Erwartungs-Ergebnisse — damit er weder Nutzerdaten noch
// Fremdmodell-Ausgaben transportiert (Trainingsdaten-Policy, fail-closed).
import { aggregateCaseScores } from "./evalScoring.js";

/** Toleranz, unterhalb derer ein Punktzahl-Unterschied als Rauschen gilt. */
export const SCORE_REGRESSION_TOLERANCE = 0.02;
/**
 * Wie viele Standardfehler ein Rueckgang ueberschreiten muss, um als echt zu
 * gelten. Zwei entsprechen rund 95 % Sicherheit — die uebliche Schwelle dafuer,
 * einen Unterschied nicht mehr dem Zufall zuzuschreiben.
 */
export const SCORE_REGRESSION_SIGMA = 2;
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
  // Ein stiller Modellwechsel ist die gefaehrlichste Fehlmessung ueberhaupt: der
  // Bericht traegt den angeforderten Namen, die Zahlen stammen aber von einem
  // anderen Modell. Live belegt am 2026-08-04: `--model kimi-k3` fiel ohne
  // Moonshot-Schluessel auf zhipu/glm-5-2 zurueck und haette GLM-Zahlen als
  // Kimi-Zahlen ausgewiesen. Der Beleg stand schon immer im Bericht
  // (backendsSeen), aber niemand las ihn — deshalb ist er ab jetzt eine
  // Verletzung und kein Fussnoteneintrag.
  const abweichung = modellAbweichung(run, caseScores);
  if (abweichung) violations.push(abweichung);
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
      // Gemessener Weg. Pflicht, seit der Messweg umstellbar ist: zwei Berichte
      // ueber verschiedene Spuren sind NICHT vergleichbar, und ohne dieses Feld
      // wuerde findBaselineReport sie trotzdem gegeneinander stellen und eine
      // Regression melden, die nur ein Spurwechsel ist.
      endpoint: run?.endpoint ? String(run.endpoint) : null,
      // Projektwissen (RAG) im Prompt. Gehoert aus demselben Grund in den Bericht
      // wie endpoint: ein Lauf mit Kontext ist mit einem ohne nicht vergleichbar.
      rag: run?.rag === true,
      // Nachsortierer. Aus demselben Grund Teil der Messart: ein Lauf, in dem ein
      // Modell die Passage waehlt, misst etwas anderes als einer, der BM25 folgt.
      // Ohne dieses Feld wuerden die beiden gegeneinander gestellt und der
      // Unterschied als Fortschritt des MODELLS gelesen.
      rerank: run?.rerank === true,
      // Die Schwelle gehoert zwingend dazu: sie entscheidet, WIE OFT Kontext
      // ueberhaupt entsteht, und ist damit der Unterschied zwischen einem Lauf,
      // der 48 von 48 Aufrufen Kontext gibt, und einem, der 16 von 48 gibt.
      ragSchwelle: Number.isFinite(run?.ragSchwelle) ? Number(run.ragSchwelle) : null,
      ragStats: run?.ragStats && typeof run.ragStats === "object" ? { ...run.ragStats } : null,
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
      // Bestehensquote statt eines einzelnen Ja/Nein. `laeufe` ist 1, solange
      // ohne Wiederholungen gemessen wird — dann ist quote genau das alte
      // Ja/Nein, nur als Zahl. `wackelig` markiert die Faelle, die mal so und
      // mal so ausfallen; sie sind der Grund fuer scheinbare Einbrueche.
      laeufe: Number.isInteger(entry.laeufe) ? entry.laeufe : 1,
      bestanden: Number.isInteger(entry.bestanden) ? entry.bestanden : (entry.status === "passed" ? 1 : 0),
      quote: Number.isFinite(entry.quote) ? entry.quote : (entry.status === "passed" ? 1 : 0),
      wackelig: entry.wackelig === true,
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
        .map((assertion) => ({ type: assertion.type, critical: assertion.critical })),
      // Der WORTLAUT der nicht bestandenen Durchgaenge, sofern der Lauf ihn
      // mitgegeben hat. Diese Liste ist eine Erlaubnisliste: was hier nicht
      // steht, faellt still weg — genau daran ist der erste Versuch am
      // 2026-08-22 gescheitert. Die Mechanik war fertig und getestet, aber
      // getestet wurde `runEvalSuite`, nicht der Weg bis in die Datei; im
      // Bericht kam nichts an. Wer ein Feld ergaenzt, ergaenzt es HIER mit.
      ...(Array.isArray(entry.belege) && entry.belege.length ? { belege: entry.belege } : {})
    }))
  };
}

/**
 * Prueft, ob wirklich das angeforderte Modell geantwortet hat.
 *
 * Nur pruefbar, wenn ein Modell ausdruecklich angefordert wurde: bei
 * `live-default` misst man absichtlich "was die Kette liefert", da ist jedes
 * Backend die richtige Antwort. Berichte ohne aufgeloeste Modell-Kennung
 * (aeltere Laeufe, reine Transportfehler) ergeben ebenfalls kein Urteil —
 * Unwissen darf sich nicht als Verstoss ausgeben.
 *
 * @returns {{code: string, angefordert: string, geantwortet: string[]}|null}
 */
export function modellAbweichung(run, caseScores) {
  const angefordert = String(run?.modelId || "").trim();
  if (!angefordert || angefordert === "live-default") return null;
  const geantwortet = distinct(caseScores, "resolvedModelId");
  if (geantwortet.length === 0) return null;
  if (geantwortet.every((id) => id === angefordert)) return null;
  return { code: "model_mismatch", angefordert, geantwortet };
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
 *
 * Die Schwelle fuer "echte Verschlechterung" ist NICHT gelockert worden — sie
 * ist messfehler-bewusst geworden. Gemessen am 2026-07-31: bei drei
 * Wiederholungen springt die Gesamtpunktzahl zwischen zwei voellig
 * unveraenderten Laeufen noch immer um bis zu 0,095. Gegen eine feste Toleranz
 * von 0,02 haette der Dienst also weiterhin Rauschen als Regression gemeldet —
 * genau der Fehler, den dieser Umbau beseitigen soll. Deshalb gilt jetzt der
 * groessere der beiden Werte: die feste Toleranz ODER zwei Standardfehler der
 * beiden verglichenen Messungen.
 *
 * Ohne Wiederholungen ist der Standardfehler 0. Dann bleibt die Schwelle exakt
 * bei SCORE_REGRESSION_TOLERANCE — Feld fuer Feld das Verhalten von vorher.
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
  const rauschband = round4(SCORE_REGRESSION_SIGMA * Math.sqrt(
    streuung(summary) ** 2 + streuung(previous) ** 2
  ));
  const scoreSchwelle = Math.max(SCORE_REGRESSION_TOLERANCE, rauschband);
  if (Number.isFinite(scoreDelta) && scoreDelta < -scoreSchwelle) {
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
    // Offen ausgewiesen, gegen welche Schwelle geprueft wurde — sonst waere aus
    // dem Bericht nicht nachvollziehbar, warum ein Rueckgang durchging.
    scoreSchwelle: round4(scoreSchwelle),
    rauschband,
    latencyDeltaMs,
    baselineVersion: baseline?.suite?.version || null,
    baselineModelId: baseline?.run?.modelId || null
  };
}

/** Standardfehler einer Zusammenfassung; aeltere Berichte haben ihn nicht. */
function streuung(summary) {
  return Number.isFinite(summary?.punktzahlStreuung) ? summary.punktzahlStreuung : 0;
}

/**
 * Kurze, menschenlesbare Zusammenfassung fuer die Konsole und die Task Capsule.
 * Absichtlich ohne Antworttexte.
 */
export function formatEvalSummary(report) {
  const s = report.summary;
  const wiederholungen = Number.isInteger(s.wiederholungen) ? s.wiederholungen : 1;
  // Wackelige Faelle gehoeren in die kurze Zusammenfassung, nicht nur in den
  // Bericht: der Loop schreibt genau diesen Text ins Protokoll, und wenn nur die
  // Protokolle uebrig sind, muss dort stehen, WELCHE Faelle schwanken.
  const wackelige = (Array.isArray(report.cases) ? report.cases : []).filter((item) => item.wackelig === true);
  const lines = [
    `Suite ${report.suite.suiteId} ${report.suite.version} — Modell ${report.run.modelId} (${report.run.transport})`,
    `Punktzahl ${(s.weightedScore * 100).toFixed(1)} %` +
      (streuung(s) > 0 ? ` ± ${(streuung(s) * 100).toFixed(1)}` : "") +
      ` (Budget ${((report.budgets.minScore ?? 0) * 100).toFixed(0)} %)`,
    `Faelle: ${s.passed} bestanden, ${s.partial} teilweise, ${s.failed} nicht bestanden, ${s.errors} Fehler` +
      (wiederholungen > 1 ? ` (je ${wiederholungen} Wiederholungen)` : ""),
    ...(wackelige.length > 0
      ? [`Wackelige Faelle: ${wackelige.length} — ` +
        wackelige.map((item) => `${item.caseId} ${(item.quote * 100).toFixed(0)} % (${item.bestanden}/${item.laeufe})`).join(", ")]
      : []),
    `Antwortzeit p95 ${s.latencyMsP95 ?? "-"} ms, erster Token p95 ${s.firstTokenMsP95 ?? "-"} ms`,
    `Kritische Verstoesse: ${s.criticalFailures}`,
    `Urteil: ${report.verdict}`
  ];
  if (report.comparison.hasBaseline) {
    const delta = report.comparison.scoreDelta;
    const sign = Number.isFinite(delta) && delta >= 0 ? "+" : "";
    const schwelle = report.comparison.scoreSchwelle;
    lines.push(`Vergleich zum Vorlauf: ${sign}${((delta ?? 0) * 100).toFixed(1)} Prozentpunkte` +
      (Number.isFinite(schwelle) ? ` (Schwelle ${(schwelle * 100).toFixed(1)})` : "") +
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
