// smejj.com — Tests des Modell-Eval-Harness.
// Kein Netz, keine Schluessel, keine Kosten: jeder Modellaufruf ist injiziert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  computeEvalSuiteSha256,
  EVAL_PROFILES,
  selectCases,
  validateEvalSuite
} from "../src/evaluation/evalSuite.js";
import { aggregateCaseScores, evaluateAssertion, percentile, scoreCase } from "../src/evaluation/evalScoring.js";
import {
  budgetViolations,
  buildEvalReport,
  compareWithBaseline,
  EVAL_VERDICT,
  modellAbweichung
} from "../src/evaluation/evalReport.js";
// Wiederholungen und Bestehensquoten stehen in tests/model-eval-wiederholungen.test.mjs.
import {
  buildMessages,
  callViaControl,
  callViaProvider,
  isTransientError,
  readSseStream,
  chatEndpointFromEnv,
  DEFAULT_CHAT_ENDPOINT,
  THINKING_MIN_TOKEN_BUDGET
} from "../src/evaluation/evalTransport.js";
import { findBaselineReport, parseArguments, runEvalSuite } from "../scripts/evaluation/run_model_eval.mjs";

const SUITE = JSON.parse(await readFile(new URL("../evals/suites/smejj-chat-core-v1.json", import.meta.url), "utf8"));

// Die verbotene Schreibweise wird zusammengesetzt, damit die Testdatei selbst
// die Namensregel (check:guidelines) nicht verletzt.
const VERBOTENE_SCHREIBWEISE = `${"S"}MEJJ`;

test("die ausgelieferte Eval-Suite ist gueltig, inhaltsadressiert und vom Training ausgeschlossen", () => {
  const result = validateEvalSuite(SUITE);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.ok, true);
  assert.equal(computeEvalSuiteSha256(SUITE), SUITE.integrity.contentSha256);
  assert.equal(SUITE.eligibleForTraining, false);
  assert.ok(SUITE.cases.length >= 10, "die Suite braucht genug Faelle fuer eine belastbare Aussage");
  for (const item of SUITE.cases) assert.ok(EVAL_PROFILES.includes(item.profile));
});

test("jeder Fall der Suite hat mindestens eine kritische Erwartung", () => {
  for (const item of SUITE.cases) {
    const critical = item.assertions.filter((assertion) => assertion.critical === true);
    assert.ok(critical.length >= 1, `Fall ${item.id} ohne kritische Erwartung`);
  }
});

test("eine manipulierte Suite wird fail-closed abgelehnt", () => {
  const tampered = structuredClone(SUITE);
  tampered.cases[0].prompt = "geaendert";
  assert.deepEqual(validateEvalSuite(tampered).reasons, ["eval_suite_integrity_mismatch"]);

  const withoutCases = { ...structuredClone(SUITE), cases: [] };
  assert.ok(validateEvalSuite(withoutCases).reasons.includes("eval_suite_cases_missing"));

  const duplicate = structuredClone(SUITE);
  duplicate.cases.push(structuredClone(duplicate.cases[0]));
  assert.ok(validateEvalSuite(duplicate).reasons.includes("eval_case_id_duplicate"));

  const badAssertion = structuredClone(SUITE);
  badAssertion.cases[0].assertions = [{ type: "modell-fragen" }];
  assert.ok(validateEvalSuite(badAssertion).reasons.includes("eval_assertion_type_invalid"));

  assert.deepEqual(validateEvalSuite(null), {
    ok: false,
    reasons: ["eval_suite_missing"],
    computedContentSha256: null
  });
});

test("selectCases haelt sich an das Budget der Suite und an das Limit des Aufrufs", () => {
  assert.equal(selectCases(SUITE).length, SUITE.cases.length);
  assert.equal(selectCases(SUITE, { limit: 3 }).length, 3);
  const tinyBudget = { ...structuredClone(SUITE), budgets: { ...SUITE.budgets, maxCasesPerRun: 2 } };
  assert.equal(selectCases(tinyBudget, { limit: 99 }).length, 2);
});

test("alle Erwartungstypen bewerten korrekt", () => {
  const text = "Die Plattform heisst smejj.com und speichert alles auf IDrive e2.";
  const ok = (assertion, options) => evaluateAssertion(assertion, { text, ...options }).ok;

  assert.equal(ok({ type: "contains_all", values: ["smejj.com", "IDrive"] }), true);
  assert.equal(ok({ type: "contains_all", values: ["smejj.com", "Cloudflare"] }), false);
  assert.equal(ok({ type: "contains_any", values: ["Cloudflare", "IDrive"] }), true);
  assert.equal(ok({ type: "contains_none", values: ["Cloudflare"] }), true);
  assert.equal(ok({ type: "contains_none", values: ["IDrive"] }), false);
  assert.equal(ok({ type: "matches", pattern: "smejj\\.com" }), true);
  assert.equal(ok({ type: "not_matches", pattern: "sk-[A-Za-z0-9]{16,}" }), true);
  assert.equal(ok({ type: "min_length", value: 10 }), true);
  assert.equal(ok({ type: "max_length", value: 10 }), false);
  assert.equal(ok({ type: "max_latency_ms", value: 500 }, { latencyMs: 400 }), true);
  assert.equal(ok({ type: "max_latency_ms", value: 500 }, { latencyMs: 900 }), false);
  assert.equal(ok({ type: "max_latency_ms", value: 500 }, { latencyMs: null }), false);
  // Unbekannte Typen gelten als nicht erfuellt und kritisch — nie als bestanden.
  assert.deepEqual(evaluateAssertion({ type: "raten" }, { text }), { type: "raten", critical: true, ok: false });
});

test("Muster achten auf die Schreibweise, ausser ignoreCase ist gesetzt", () => {
  const text = "Antwort mit smejj.com";
  // Ohne ignoreCase greift das Muster nur bei exakter Schreibweise — genau das
  // macht die Namensregel ueberhaupt pruefbar.
  assert.equal(evaluateAssertion({ type: "matches", pattern: "\\bS[M]EJJ\\b" }, { text }).ok, false);
  assert.equal(evaluateAssertion({ type: "matches", pattern: "\\bS[M]EJJ\\b", ignoreCase: true }, { text }).ok, true);
  assert.equal(evaluateAssertion({ type: "matches", pattern: "smejj\\.com" }, { text }).ok, true);
  // Ein kaputtes Muster faellt durch, statt den Lauf abzubrechen.
  assert.equal(evaluateAssertion({ type: "matches", pattern: "([unvollstaendig" }, { text }).ok, false);
});

test("json_parses akzeptiert auch JSON in einem Codeblock, aber keinen Fliesstext", () => {
  const fenced = "```json\n{\"dienst\":\"IDrive e2\"}\n```";
  assert.equal(evaluateAssertion({ type: "json_parses" }, { text: fenced }).ok, true);
  assert.equal(evaluateAssertion({ type: "json_parses" }, { text: "{\"a\":1}" }).ok, true);
  assert.equal(evaluateAssertion({ type: "json_parses" }, { text: "Gerne! Hier: dienst=e2" }).ok, false);
  assert.equal(evaluateAssertion({ type: "json_parses" }, { text: "42" }).ok, false);
});

test("die Namensregel der Suite erkennt eine falsche Schreibweise wirklich", () => {
  const namingCase = SUITE.cases.find((item) => item.id === "naming-schreibweise");
  const gut = scoreCase(namingCase, { ok: true, text: "Die Plattform wird immer als smejj.com geschrieben.", latencyMs: 500 });
  assert.equal(gut.status, "passed");

  const schlecht = scoreCase(namingCase, {
    ok: true,
    text: `Die Plattform heisst ${VERBOTENE_SCHREIBWEISE} und wird als smejj.com geschrieben.`,
    latencyMs: 500
  });
  assert.equal(schlecht.score, 0, "eine verletzte kritische Erwartung setzt den Fall auf 0");
  assert.equal(schlecht.criticalFailed, true);
});

test("ein Transportfehler wird als Fehlerfall gezaehlt, nicht als bestanden", () => {
  const scored = scoreCase(SUITE.cases[0], { ok: false, error: "timeout", latencyMs: 60000 });
  assert.equal(scored.status, "error");
  assert.equal(scored.score, 0);
  assert.equal(scored.criticalFailed, true);
  assert.equal(scored.error, "timeout");
});

test("Teilerfuellung ohne kritischen Verstoss ergibt eine Teilpunktzahl", () => {
  const evalCase = {
    id: "teilfall",
    profile: "default",
    weight: 1,
    maxTokens: 100,
    prompt: "x",
    assertions: [
      { type: "contains_all", values: ["alpha"] },
      { type: "contains_all", values: ["beta"] },
      { type: "min_length", value: 3 },
      { type: "max_length", value: 5000 }
    ]
  };
  const scored = scoreCase(evalCase, { ok: true, text: "alpha gamma", latencyMs: 100 });
  assert.equal(scored.status, "partial");
  assert.equal(scored.score, 0.75);
});

test("die Gesamtpunktzahl ist gewichtet und die Perzentile stimmen", () => {
  const summary = aggregateCaseScores([
    { caseId: "a", weight: 3, score: 1, status: "passed", criticalFailed: false, latencyMs: 100, firstTokenMs: 50 },
    { caseId: "b", weight: 1, score: 0, status: "failed", criticalFailed: true, latencyMs: 900, firstTokenMs: 300 }
  ]);
  assert.equal(summary.weightedScore, 0.75);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.criticalFailures, 1);
  assert.equal(summary.latencyMsP95, 900);
  assert.equal(summary.latencyMsMedian, 100);
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
});

// Die Schwellen der Suite duerfen sich aendern (Regressionsschwelle statt
// Produktziel, 2026-07-28). Der Test prueft deshalb die LOGIK gegen ein eigenes
// Budget und leitet die Suite-Faelle aus deren echten Werten ab — so bleibt er
// gueltig, ohne bei jeder Schwellenanpassung mitgepflegt werden zu muessen.
test("Budgetverletzungen werden benannt, nicht verschwiegen", () => {
  const budget = { minScore: 0.8, latencyMsP95: 15000, firstTokenMs: 2500 };
  const summary = { weightedScore: 0.5, latencyMsP95: 30000, firstTokenMsP95: 9000, criticalFailures: 0 };
  const codes = budgetViolations(summary, budget).map((entry) => entry.code);
  assert.deepEqual(codes, ["score_below_budget", "latency_p95_above_budget", "first_token_above_budget"]);
  assert.deepEqual(budgetViolations({ weightedScore: 1, latencyMsP95: 100, firstTokenMsP95: 100 }, budget), []);

  // Gegen die echte Suite: knapp darueber reisst, knapp darunter nicht.
  const ueber = {
    weightedScore: SUITE.budgets.minScore - 0.01,
    latencyMsP95: SUITE.budgets.latencyMsP95 + 1,
    firstTokenMsP95: SUITE.budgets.firstTokenMs + 1,
    criticalFailures: 0
  };
  assert.deepEqual(
    budgetViolations(ueber, SUITE.budgets).map((entry) => entry.code),
    ["score_below_budget", "latency_p95_above_budget", "first_token_above_budget"]
  );
  const unter = {
    weightedScore: SUITE.budgets.minScore,
    latencyMsP95: SUITE.budgets.latencyMsP95,
    firstTokenMsP95: SUITE.budgets.firstTokenMs,
    criticalFailures: 0
  };
  assert.deepEqual(budgetViolations(unter, SUITE.budgets), []);
});

test("eine Verschlechterung gegenueber dem Vorlauf gilt als Regression", () => {
  const baseline = { summary: { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0 } };
  const schlechter = compareWithBaseline({ weightedScore: 0.8, latencyMsP95: 1000, criticalFailures: 0 }, baseline);
  assert.equal(schlechter.regressed, true);
  assert.ok(schlechter.reasons.includes("score_regression"));

  const langsamer = compareWithBaseline({ weightedScore: 0.9, latencyMsP95: 1500, criticalFailures: 0 }, baseline);
  assert.ok(langsamer.reasons.includes("latency_regression"));

  const rauschen = compareWithBaseline({ weightedScore: 0.89, latencyMsP95: 1050, criticalFailures: 0 }, baseline);
  assert.equal(rauschen.regressed, false, "kleine Schwankungen sind keine Regression");

  const ohne = compareWithBaseline({ weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0 }, null);
  assert.deepEqual(ohne, { hasBaseline: false, regressed: false, reasons: [], scoreDelta: null, latencyDeltaMs: null });
});

test("der Bericht urteilt korrekt und enthaelt keine Modellantwort im Klartext", () => {
  const geheim = "Antworttext-der-nicht-in-den-Bericht-gehoert";
  const caseScores = SUITE.cases.slice(0, 3).map((item) => scoreCase(item, {
    ok: true,
    text: geheim,
    latencyMs: 300,
    firstTokenMs: 120
  }));
  const report = buildEvalReport({
    suite: SUITE,
    run: { modelId: "glm-5-2", transport: "control", live: true, startedAt: "a", finishedAt: "b" },
    caseScores,
    baseline: null
  });
  assert.equal(report.automaticPromotionAllowed, false);
  assert.equal(report.eligibleForTraining, false);
  assert.equal(report.suite.contentSha256, SUITE.integrity.contentSha256);
  assert.equal(JSON.stringify(report).includes(geheim), false, "Antworttexte duerfen den Bericht nie verlassen");
  assert.ok([EVAL_VERDICT.BLOCKED, EVAL_VERDICT.BUDGET_VIOLATED].includes(report.verdict));
});

test("der Bericht belegt, welches Backend wirklich geantwortet hat", () => {
  const caseScores = [
    { ...scoreCase(SUITE.cases[0], { ok: true, text: "smejj.com", latencyMs: 100 }), backend: "zhipu", resolvedModelId: "glm-5-2" },
    { ...scoreCase(SUITE.cases[1], { ok: true, text: "IDrive e2", latencyMs: 100 }), backend: "groq", resolvedModelId: "fast-lane" }
  ];
  const report = buildEvalReport({
    suite: SUITE,
    run: { modelId: "glm-5-2", transport: "control", live: true },
    caseScores
  });
  // Faellt der Router zurueck, steht das im Bericht — sonst waere die Messung
  // einem Modell zugeschrieben, das gar nicht geantwortet hat.
  assert.deepEqual(report.run.backendsSeen, ["groq", "zhipu"]);
  assert.deepEqual(report.run.resolvedModelIds, ["fast-lane", "glm-5-2"]);
  assert.equal(report.cases[0].backend, "zhipu");
  // Der Beleg allein genuegt nicht: ein Rueckfall MUSS als Verletzung erscheinen.
  assert.ok(report.violations.some((eintrag) => eintrag.code === "model_mismatch"));
});

test("ein stiller Modellwechsel wird als Verletzung gemeldet, nicht nur belegt", () => {
  // Der Fall, der am 2026-08-04 live auftrat: kimi-k3 angefordert, ohne
  // Moonshot-Schluessel antwortete glm-5-2. Ohne diesen Waechter haette der
  // Bericht GLM-Zahlen unter dem Namen Kimi ausgewiesen.
  const caseScores = [
    { ...scoreCase(SUITE.cases[0], { ok: true, text: "smejj.com", latencyMs: 100 }), backend: "zhipu", resolvedModelId: "glm-5-2" }
  ];
  const report = buildEvalReport({
    suite: SUITE,
    run: { modelId: "kimi-k3", transport: "provider", live: true },
    caseScores
  });
  const treffer = report.violations.find((eintrag) => eintrag.code === "model_mismatch");
  assert.ok(treffer, "ein Rueckfall auf ein anderes Modell muss eine Verletzung sein");
  assert.equal(treffer.angefordert, "kimi-k3");
  assert.deepEqual(treffer.geantwortet, ["glm-5-2"]);
  assert.notEqual(report.verdict, EVAL_VERDICT.PASSED);
});

test("live-default und ein sauber antwortendes Modell loesen keinen Fehlalarm aus", () => {
  const treffer = scoreCase(SUITE.cases[0], { ok: true, text: "smejj.com", latencyMs: 100 });
  // 1) Ohne ausdrueckliche Modellwahl ist jedes Backend die richtige Antwort.
  assert.equal(modellAbweichung({ modelId: "live-default" }, [{ ...treffer, resolvedModelId: "fast-lane" }]), null);
  // 2) Antwortet das angeforderte Modell, gibt es nichts zu melden.
  assert.equal(modellAbweichung({ modelId: "glm-5-2" }, [{ ...treffer, resolvedModelId: "glm-5-2" }]), null);
  // 3) Reine Transportfehler tragen keine Modell-Kennung — Unwissen ist kein Verstoss.
  assert.equal(modellAbweichung({ modelId: "glm-5-2" }, [{ ...treffer, resolvedModelId: "" }]), null);
});

test("ein sauberer Lauf ergibt das Urteil passed", () => {
  const evalCase = {
    id: "sauber",
    profile: "default",
    weight: 1,
    maxTokens: 50,
    prompt: "x",
    assertions: [{ type: "contains_all", values: ["ok"], critical: true }]
  };
  const suite = { ...structuredClone(SUITE), cases: [evalCase] };
  const report = buildEvalReport({
    suite,
    run: { modelId: "glm-5-2", transport: "control", live: true },
    caseScores: [scoreCase(evalCase, { ok: true, text: "ok", latencyMs: 200, firstTokenMs: 100 })]
  });
  assert.equal(report.verdict, EVAL_VERDICT.PASSED);
  assert.deepEqual(report.violations, []);
});

test("der SSE-Leser setzt den Text zusammen und misst den ersten Token", async () => {
  const frames = [
    "data: {\"choices\":[{\"delta\":{\"content\":\"Hallo \"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"Welt\"}}]}\n\n",
    "data: [DONE]\n\n"
  ];
  let tick = 0;
  const stream = await readSseStream({ body: asyncChunks(frames) }, { started: 0, now: () => (tick += 10) });
  assert.equal(stream.text, "Hallo Welt");
  assert.equal(stream.firstTokenMs, 10);
});

test("der Live-Weg liefert Text, Kennzahlen und meldet HTTP-Fehler sauber", async () => {
  const fetchImpl = async (url, init) => {
    // Nicht die Adresse festnageln, sondern DASS der Standardweg genommen
    // wird. Die Adresse selbst prueft der Test unten gegen public/config.js.
    assert.equal(url, DEFAULT_CHAT_ENDPOINT);
    const body = JSON.parse(init.body);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.model, "glm-5-2");
    return {
      ok: true,
      headers: { get: (name) => (name === "x-smejj-model-id" ? "glm-5-2" : "control-router") },
      body: asyncChunks(["data: {\"choices\":[{\"delta\":{\"content\":\"fertig\"}}]}\n\n", "data: [DONE]\n\n"])
    };
  };
  let tick = 0;
  const result = await callViaControl(SUITE.cases[0], { fetchImpl, modelId: "glm-5-2", now: () => (tick += 5) });
  assert.equal(result.ok, true);
  assert.equal(result.text, "fertig");
  assert.equal(result.modelId, "glm-5-2");

  const fehler = await callViaControl(SUITE.cases[0], {
    fetchImpl: async () => ({ ok: false, status: 429, headers: { get: () => null } }),
    modelId: "glm-5-2"
  });
  assert.equal(fehler.ok, false);
  assert.equal(fehler.error, "http_429");
});

test("der direkte Anbieterweg ist fail-closed ohne Konfiguration", async () => {
  const ohneKette = await callViaProvider(SUITE.cases[0], {
    modelId: "kimi-k2-7",
    resolveModelRequest: () => ({ chain: [] }),
    executeWithFallback: async () => {
      throw new Error("darf nie aufgerufen werden");
    }
  });
  assert.equal(ohneKette.ok, false);
  assert.equal(ohneKette.error, "model_not_configured");

  const ohneRouter = await callViaProvider(SUITE.cases[0], { modelId: "kimi-k2-7" });
  assert.equal(ohneRouter.error, "router_unavailable");
});

test("Systemtext und Aufgabe werden als getrennte Nachrichten gesendet", () => {
  assert.deepEqual(buildMessages({ system: " Regeln ", prompt: "Frage" }), [
    { role: "system", content: "Regeln" },
    { role: "user", content: "Frage" }
  ]);
  assert.deepEqual(buildMessages({ prompt: "Frage" }), [{ role: "user", content: "Frage" }]);
});

test("die Kommandozeile ist streng und standardmaessig ein Trockenlauf", () => {
  const standard = parseArguments([]).options;
  assert.equal(standard.live, false, "ohne --live wird nie ein Modell aufgerufen");
  assert.equal(standard.transport, "control");
  assert.equal(standard.suite, "evals/suites/smejj-chat-core-v1.json");

  assert.equal(parseArguments(["--transport", "salad"]).error, "unknown_transport:salad");
  assert.equal(parseArguments(["--tarnkappe"]).error, "unknown_argument:--tarnkappe");
  assert.equal(parseArguments(["--limit", "0"]).error, "invalid_limit");
  assert.equal(parseArguments(["--live", "--limit", "3"]).options.limit, 3);
});

test("der Lauf fuehrt jeden Fall genau einmal aus und haelt die Reihenfolge", async () => {
  const gesehen = [];
  const { caseScores } = await runEvalSuite({
    suite: SUITE,
    cases: SUITE.cases.slice(0, 4),
    callModel: async (evalCase) => {
      gesehen.push(evalCase.id);
      return { ok: true, text: "smejj.com", latencyMs: 100, firstTokenMs: 40 };
    },
    delayMs: 0
  });
  assert.deepEqual(gesehen, SUITE.cases.slice(0, 4).map((item) => item.id));
  assert.equal(caseScores.length, 4);
});

test("nur Infrastrukturrauschen gilt als transient, ein echter Modellfehler nicht", () => {
  for (const reason of ["timeout", "network_error", "empty_response", "http_503", "http_502", "http_429", "http_408"]) {
    assert.equal(isTransientError(reason), true, reason);
  }
  for (const reason of ["http_400", "http_401", "http_404", "model_not_configured", "router_unavailable", ""]) {
    assert.equal(isTransientError(reason), false, reason);
  }
});

test("ein transienter Fehler wird wiederholt, ein dauerhafter Fehler nicht", async () => {
  // Ohne diese Wiederholung wurde im ersten Live-Lauf ein einzelner 503 der Bruecke
  // faelschlich als Modellversagen gewertet.
  let aufrufe = 0;
  const wackelig = await runEvalSuite({
    suite: SUITE,
    cases: [SUITE.cases[0]],
    callModel: async () => {
      aufrufe += 1;
      return aufrufe < 3
        ? { ok: false, error: "http_503", latencyMs: 10 }
        : { ok: true, text: "Die Plattform heisst smejj.com.", latencyMs: 10, firstTokenMs: 5 };
    },
    delayMs: 0,
    retries: 2
  });
  assert.equal(aufrufe, 3);
  assert.equal(wackelig.caseScores[0].status, "passed");
  assert.equal(wackelig.caseScores[0].attempts, 3);

  let dauerhaft = 0;
  const abgelehnt = await runEvalSuite({
    suite: SUITE,
    cases: [SUITE.cases[0]],
    callModel: async () => {
      dauerhaft += 1;
      return { ok: false, error: "model_not_configured", latencyMs: 0 };
    },
    delayMs: 0,
    retries: 2
  });
  assert.equal(dauerhaft, 1, "ein fehlender Zugang wird nicht wiederholt");
  assert.equal(abgelehnt.caseScores[0].status, "error");

  assert.equal(parseArguments(["--retries", "9"]).error, "invalid_retries");
  assert.equal(parseArguments(["--retries", "0"]).options.retries, 0);
});

test("als Vergleichsbericht wird nur ein echter Live-Lauf derselben Suite akzeptiert", async () => {
  const hash = SUITE.integrity.contentSha256;
  const andererHash = `${"a".repeat(64)}`;
  const dateien = ["modeleval-a.json", "modeleval-b.json", "modeleval-c.json", "notizen.txt"];
  const berichte = {
    // Trockenlauf — kein gueltiger Vergleichswert.
    "modeleval-a.json": { suite: { suiteId: "smejj-chat-core", contentSha256: hash }, run: { modelId: "glm-5-2", live: false } },
    "modeleval-b.json": { suite: { suiteId: "smejj-chat-core", contentSha256: hash }, run: { modelId: "glm-5-2", live: true } },
    // Gleiche Suite-Kennung, aber andere Erwartungen — nicht vergleichbar.
    "modeleval-c.json": { suite: { suiteId: "smejj-chat-core", contentSha256: andererHash }, run: { modelId: "kimi-k2-7", live: true } }
  };
  const lade = {
    readDir: async () => dateien,
    readJson: async (file) => berichte[file.replace(/^\.[\\/]/, "")]
  };
  const treffer = await findBaselineReport({ dir: ".", suiteId: "smejj-chat-core", contentSha256: hash, modelId: "glm-5-2", ...lade });
  assert.equal(treffer.run.live, true);

  const anderesModell = await findBaselineReport({ dir: ".", suiteId: "smejj-chat-core", contentSha256: hash, modelId: "kimi-k2-7", ...lade });
  assert.equal(anderesModell, null);

  const andereSuiteFassung = await findBaselineReport({ dir: ".", suiteId: "smejj-chat-core", contentSha256: andererHash, modelId: "glm-5-2", ...lade });
  assert.equal(andereSuiteFassung, null, "Laeufe mit anderen Erwartungen duerfen nie verglichen werden");
});

async function* asyncChunks(parts) {
  const encoder = new TextEncoder();
  for (const part of parts) yield encoder.encode(part);
}


test("knappes Token-Budget schaltet das Denken ab — sonst frisst es die Antwort auf", async () => {
  // Gemessen am 2026-07-29 gegen glm-4.7-flash, Fall code-esm-failclosed:
  // Denken an mit max_tokens 600 verbrauchte alle 600 Token und lieferte LEEREN
  // content. Ein gutes Modell waere damit als Totalausfall gemessen worden.
  const knapp = { ...SUITE.cases[0], maxTokens: 600 };
  let gesehen = null;
  await callViaProvider(knapp, {
    modelId: "glm-5-2",
    resolveModelRequest: () => ({ chain: [{ name: "zhipu", model: "glm-4.7-flash" }] }),
    executeWithFallback: async (_chain, _messages, options) => {
      gesehen = options;
      return { ok: true, backend: "zhipu", logicalModelId: "glm-5-2", response: { json: async () => ({ choices: [{ message: { content: "export function x() { throw new Error('x'); }" } }] }) } };
    }
  });
  assert.deepEqual(gesehen.thinking, { type: "disabled" });
  assert.equal(knapp.maxTokens < THINKING_MIN_TOKEN_BUDGET, true);
});

test("reichliches Token-Budget laesst das Denken unangetastet — Antwortguete bleibt", async () => {
  const reichlich = { ...SUITE.cases[0], maxTokens: THINKING_MIN_TOKEN_BUDGET + 500 };
  let gesehen = null;
  await callViaProvider(reichlich, {
    modelId: "glm-5-2",
    resolveModelRequest: () => ({ chain: [{ name: "zhipu", model: "glm-4.7-flash" }] }),
    executeWithFallback: async (_chain, _messages, options) => {
      gesehen = options;
      return { ok: true, backend: "zhipu", logicalModelId: "glm-5-2", response: { json: async () => ({ choices: [{ message: { content: "ausreichend lange Antwort mit throw" } }] }) } };
    }
  });
  assert.equal("thinking" in gesehen, false, "ohne Not wird die Voreinstellung des Modells nicht angetastet");
});

test("Messweg ist umstellbar, bleibt ohne Angabe aber auf der Schnellspur", () => {
  // Umstellen muss eine ausdrueckliche Entscheidung sein, keine Nebenwirkung.
  assert.equal(chatEndpointFromEnv({}), DEFAULT_CHAT_ENDPOINT);
  assert.equal(chatEndpointFromEnv({ SMEJJ_EVAL_CHAT_ENDPOINT: "  " }), DEFAULT_CHAT_ENDPOINT);
  assert.equal(
    chatEndpointFromEnv({ SMEJJ_EVAL_CHAT_ENDPOINT: "https://smejj-control.zeabur.app/api/chat" }),
    "https://smejj-control.zeabur.app/api/chat"
  );
});

test("der Notfall-Assistent wird als Infrastrukturzustand erkannt, nicht als Modellversagen", async () => {
  // Antwortet localAssistantStream, fehlt der Kopf x-smejj-model-backend. Ohne
  // diesen Waechter kaemen fluessige Konservensaetze zurueck, die Zusicherungen
  // reissen — eine unfertige Spur saehe aus wie ein schlechtes Modell.
  const antwort = {
    ok: true,
    headers: { get: () => null },
    body: (async function* () { yield 'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n'; })()
  };
  const ergebnis = await callViaControl(SUITE.cases[0], {
    endpoint: "https://beispiel.invalid/api/chat",
    fetchImpl: async () => antwort
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "notfall_assistent");
  assert.equal(ergebnis.backend, "notfall-assistent");
  assert.equal(isTransientError("notfall_assistent"), true, "zaehlt als Infrastruktur, nicht als Modellfehler");
});

test("ein Bericht einer anderen Spur wird NICHT als Vergleichswert akzeptiert", async () => {
  // Sonst waere ein Spurwechsel als Regression gemeldet worden.
  const bericht = (endpoint) => ({
    suite: { suiteId: "s", contentSha256: "a".repeat(64) },
    run: { modelId: "live-default", live: true, ...(endpoint ? { endpoint } : {}) },
    summary: { weightedScore: 0.9 }
  });
  const suchen = (endpoint, gespeichert) => findBaselineReport({
    dir: "/egal", suiteId: "s", contentSha256: "a".repeat(64), modelId: "live-default", endpoint,
    readDir: async () => ["modeleval-s-live-default-2026-07-29.json"],
    readJson: async () => gespeichert
  });
  const control = "https://smejj-control.zeabur.app/api/chat";
  assert.equal(await suchen(control, bericht(DEFAULT_CHAT_ENDPOINT)), null, "Schnellspur-Bericht taugt nicht fuer die Control-Spur");
  assert.notEqual(await suchen(control, bericht(control)), null, "gleiche Spur bleibt vergleichbar");
  // Aeltere Berichte ohne das Feld zaehlen als der historische Standardweg.
  assert.notEqual(await suchen(DEFAULT_CHAT_ENDPOINT, bericht(null)), null, "alte Berichte bleiben auf der unveraenderten Spur vergleichbar");
});

// Befund 2026-08-04: Der Standard-Messweg zeigte auf die ZEABUR-Reserve, nicht
// auf die Kette, die Nutzer bekommen. Der ganze Prueflauf ergab 0 %, weil die
// Reserve mit HTTP 401 antwortete — und niemand haette gemerkt, dass hier gar
// nicht das Produkt gemessen wird.
test("der Standard-Messweg ist der NUTZERWEG, nicht die Reserve", async () => {
  const { DEFAULT_CHAT_ENDPOINT } = await import("../src/evaluation/evalTransport.js");
  const config = await readFile(new URL("../public/config.js", import.meta.url), "utf8");
  const primaer = (config.match(/\n\s*chat:\s*"([^"]+)"/) || [, ""])[1];
  const reserve = (config.match(/chatFallback:\s*"([^"]+)"/) || [, ""])[1];
  assert.ok(primaer, "public/config.js muss einen primaeren Chat-Endpunkt fuehren");
  assert.equal(DEFAULT_CHAT_ENDPOINT, primaer,
    "gemessen wird, was der Nutzer bekommt — sonst misst der Prueflauf ein anderes Produkt");
  assert.notEqual(DEFAULT_CHAT_ENDPOINT, reserve, "die Reserve ist nicht der Nutzerweg");
});
