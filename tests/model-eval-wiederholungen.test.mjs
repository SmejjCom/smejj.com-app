// smejj.com — Tests der Wiederholungen und Bestehensquoten im Eval-Harness.
//
// Eigene Datei, weil tests/model-eval.test.mjs damit ueber die 800-Zeilen-Regel
// gelaufen waere. Inhaltlich gehoert alles hier zu EINER Frage: kann die Messung
// echte Veraenderungen von Zufallsrauschen unterscheiden?
//
// Kein Netz, keine Schluessel, keine Kosten: jeder Modellaufruf ist injiziert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregateCaseRuns,
  aggregateCaseScores,
  scoreCase,
  varianzDesMittels,
  WIEDERHOLUNGEN_MAX,
  WIEDERHOLUNGEN_STANDARD,
  wiederholungenAusEnv
} from "../src/evaluation/evalScoring.js";
import {
  buildEvalReport,
  compareWithBaseline,
  EVAL_VERDICT,
  formatEvalSummary
} from "../src/evaluation/evalReport.js";
import { findBaselineReport, parseArguments, runEvalSuite } from "../scripts/evaluation/run_model_eval.mjs";

const SUITE = JSON.parse(await readFile(new URL("../evals/suites/smejj-chat-core-v1.json", import.meta.url), "utf8"));

// ---------------------------------------------------------------------------

/** Ein Fall mit genau einer, nicht kritischen Erwartung — leicht steuerbar. */
const WACKELFALL = {
  id: "wackelfall",
  profile: "default",
  weight: 1,
  maxTokens: 100,
  prompt: "x",
  assertions: [{ type: "contains_all", values: ["ja"] }]
};

const JA = { ok: true, text: "ja", latencyMs: 100, firstTokenMs: 40 };
const NEIN = { ok: true, text: "nein", latencyMs: 120, firstTokenMs: 50 };

test("eine Wiederholung verhaelt sich exakt wie bisher — die Rueckfallebene", () => {
  // Das ist die wichtigste Zusicherung des Umbaus: bei wiederholungen = 1 aendert
  // sich kein einziges bestehendes Feld, es kommen nur neue hinzu.
  const einzeln = scoreCase(WACKELFALL, JA);
  const zusammengefasst = aggregateCaseRuns([einzeln]);
  assert.deepEqual(zusammengefasst, { ...einzeln, laeufe: 1, bestanden: 1, quote: 1, wackelig: false, varianz: 0 });

  const durchgefallen = scoreCase(WACKELFALL, NEIN);
  assert.deepEqual(aggregateCaseRuns([durchgefallen]), {
    ...durchgefallen, laeufe: 1, bestanden: 0, quote: 0, wackelig: false, varianz: 0
  });
  assert.equal(aggregateCaseRuns([]), null);

  // Und die Folge davon: ohne Wiederholungen ist der Messfehler 0, also bleibt
  // die Regressionsschwelle exakt die alte.
  const summary = aggregateCaseScores([zusammengefasst]);
  assert.equal(summary.punktzahlStreuung, 0);
  assert.equal(summary.wiederholungen, 1);
});

test("ein wackeliger Fall wird als Quote berichtet, nicht als Ja/Nein", () => {
  // Genau der gemessene Fall: 3 von 5 Wiederholungen bestehen.
  const laeufe = [JA, JA, JA, NEIN, NEIN].map((antwort) => scoreCase(WACKELFALL, antwort));
  const fall = aggregateCaseRuns(laeufe);
  assert.equal(fall.laeufe, 5);
  assert.equal(fall.bestanden, 3);
  assert.equal(fall.quote, 0.6);
  assert.equal(fall.wackelig, true, "weder 0 % noch 100 % — das ist die eigentliche Information");
  // "Ein Fall mit 60 % zaehlt als 0,6, nicht als 0 oder 1."
  assert.equal(fall.score, 0.6);
  assert.equal(fall.status, "partial");
});

test("kein best of N — gemittelt wird ueber ALLE Wiederholungen", () => {
  // Den besten Lauf zu nehmen waere Betrug an der eigenen Messung.
  const laeufe = [JA, NEIN, NEIN, NEIN].map((antwort) => scoreCase(WACKELFALL, antwort));
  assert.equal(aggregateCaseRuns(laeufe).score, 0.25, "nicht 1, obwohl ein Lauf perfekt war");
});

test("ein stabiler Fehlschlag ist kein wackeliger Fall", () => {
  // code-esm-failclosed war 0 von 5 — ein echter, stabiler Fehler. Der darf
  // durch den Umbau nicht als Schwankung verharmlost werden.
  const laeufe = [NEIN, NEIN, NEIN, NEIN, NEIN].map((antwort) => scoreCase(WACKELFALL, antwort));
  const fall = aggregateCaseRuns(laeufe);
  assert.equal(fall.quote, 0);
  assert.equal(fall.wackelig, false);
  assert.equal(fall.status, "failed");
});

test("ein kritischer Verstoss in EINER Wiederholung genuegt — konservativ gewaehlt", () => {
  // Sonst haenge das Urteil davon ab, ob der Wuerfel den Verstoss diesmal traf.
  const kritisch = {
    ...WACKELFALL,
    assertions: [{ type: "contains_none", values: ["geheim"], critical: true }]
  };
  const laeufe = [
    scoreCase(kritisch, { ok: true, text: "alles gut", latencyMs: 10 }),
    scoreCase(kritisch, { ok: true, text: "alles gut", latencyMs: 10 }),
    scoreCase(kritisch, { ok: true, text: "hier steht geheim", latencyMs: 10 })
  ];
  const fall = aggregateCaseRuns(laeufe);
  assert.equal(fall.criticalFailed, true, "die Regel wurde gebrochen, auch wenn sie meistens hielt");
  assert.equal(fall.bestanden, 2);
  assert.equal(fall.wackelig, true);

  // Und die Regel criticalFailures > 0 => blocked bleibt unangetastet.
  const suite = { ...structuredClone(SUITE), cases: [kritisch] };
  const report = buildEvalReport({ suite, run: { modelId: "m", transport: "control", live: true }, caseScores: [fall] });
  assert.equal(report.verdict, EVAL_VERDICT.BLOCKED);
});

test("eine Erwartung, die nur manchmal reisst, verschwindet nicht aus dem Bericht", () => {
  const laeufe = [JA, JA, NEIN].map((antwort) => scoreCase(WACKELFALL, antwort));
  const fall = aggregateCaseRuns(laeufe);
  assert.equal(fall.assertions[0].ok, false, "fail-closed: erfuellt gilt nur, wenn sie in JEDEM Lauf hielt");
  assert.equal(fall.assertions[0].erfuellt, 2);
  assert.equal(fall.assertions[0].laeufe, 3);
});

test("der Lauf fuehrt jeden Fall so oft aus wie verlangt und haelt den Abstand ein", async () => {
  let aufrufe = 0;
  let schlaefe = 0;
  const { caseScores } = await runEvalSuite({
    suite: SUITE,
    cases: [WACKELFALL, WACKELFALL],
    callModel: async () => { aufrufe += 1; return aufrufe % 2 === 0 ? NEIN : JA; },
    delayMs: 6000,
    wiederholungen: 3,
    sleep: async () => { schlaefe += 1; }
  });
  assert.equal(aufrufe, 6, "2 Faelle x 3 Wiederholungen");
  // Der Abstand liegt zwischen JEDEM Aufruf, nicht je Fall: mehr Wiederholungen
  // erhoehen die Gesamtzahl der Aufrufe, nicht das Tempo. Sonst risse die
  // Ratenbegrenzung der Bruecke (12 Anfragen/Minute).
  assert.equal(schlaefe, 6, "ein Abstand je Modellaufruf — nicht schneller machen");
  assert.equal(caseScores[0].laeufe, 3);
  assert.equal(caseScores[0].bestanden, 2);
});

test("bei einer Wiederholung ist der Ablauf unveraendert", async () => {
  let aufrufe = 0;
  let schlaefe = 0;
  const { caseScores } = await runEvalSuite({
    suite: SUITE,
    cases: SUITE.cases.slice(0, 4),
    callModel: async () => { aufrufe += 1; return { ok: true, text: "smejj.com", latencyMs: 100, firstTokenMs: 40 }; },
    delayMs: 400,
    wiederholungen: 1,
    sleep: async () => { schlaefe += 1; }
  });
  assert.equal(aufrufe, 4, "genau ein Aufruf je Fall wie vor dem Umbau");
  assert.equal(schlaefe, 4);
  assert.equal(caseScores[0].laeufe, 1);
  assert.equal(caseScores[0].wackelig, false);
});

test("die Zusammenfassung zaehlt wackelige Faelle und nennt sie beim Namen", () => {
  const wackelig = aggregateCaseRuns([JA, JA, NEIN].map((a) => scoreCase(WACKELFALL, a)));
  const stabil = aggregateCaseRuns([JA, JA, JA].map((a) => scoreCase({ ...WACKELFALL, id: "stabil" }, a)));
  const summary = aggregateCaseScores([wackelig, stabil]);
  assert.equal(summary.wackelig, 1);
  assert.equal(summary.wiederholungen, 3);

  const report = buildEvalReport({
    suite: SUITE,
    run: { modelId: "m", transport: "control", live: true },
    caseScores: [wackelig, stabil]
  });
  assert.equal(report.cases[0].quote, 0.6667);
  assert.equal(report.cases[0].wackelig, true);
  // Der Loop schreibt genau diesen Text ins Protokoll — wenn nur die Protokolle
  // uebrig sind, muss dort stehen, WELCHER Fall schwankt.
  const text = formatEvalSummary(report);
  assert.match(text, /Wackelige Faelle: 1 — wackelfall 67 % \(2\/3\)/);
  assert.match(text, /je 3 Wiederholungen/);
});

test("ohne Wiederholungen bleibt die Zusammenfassung wortgleich zu vorher", () => {
  const report = buildEvalReport({
    suite: SUITE,
    run: { modelId: "m", transport: "control", live: true },
    caseScores: [scoreCase(WACKELFALL, JA)]
  });
  const text = formatEvalSummary(report);
  assert.equal(text.includes("Wiederholungen"), false);
  assert.equal(text.includes("Wackelige"), false);
});

test("SMEJJ_EVAL_WIEDERHOLUNGEN wird begrenzt statt geglaubt", () => {
  assert.equal(wiederholungenAusEnv({}), WIEDERHOLUNGEN_STANDARD);
  assert.equal(wiederholungenAusEnv({ SMEJJ_EVAL_WIEDERHOLUNGEN: "1" }), 1);
  assert.equal(wiederholungenAusEnv({ SMEJJ_EVAL_WIEDERHOLUNGEN: "5" }), 5);
  assert.equal(wiederholungenAusEnv({ SMEJJ_EVAL_WIEDERHOLUNGEN: "0" }), 1, "unter dem Bereich");
  assert.equal(wiederholungenAusEnv({ SMEJJ_EVAL_WIEDERHOLUNGEN: "9999" }), WIEDERHOLUNGEN_MAX);
  assert.equal(wiederholungenAusEnv({ SMEJJ_EVAL_WIEDERHOLUNGEN: "viel" }), WIEDERHOLUNGEN_STANDARD);
});

test("die Kommandozeile lehnt einen Wiederholungswert ausserhalb des Bereichs ab", () => {
  const leer = {};
  assert.equal(parseArguments([], leer).options.wiederholungen, WIEDERHOLUNGEN_STANDARD);
  assert.equal(parseArguments([], { SMEJJ_EVAL_WIEDERHOLUNGEN: "1" }).options.wiederholungen, 1);
  assert.equal(parseArguments(["--wiederholungen", "5"], leer).options.wiederholungen, 5);
  assert.equal(parseArguments(["--wiederholungen", "0"], leer).error, "invalid_wiederholungen");
  assert.equal(parseArguments(["--wiederholungen", "11"], leer).error, "invalid_wiederholungen");
  assert.equal(parseArguments(["--wiederholungen", "drei"], leer).error, "invalid_wiederholungen");
});

test("der Messfehler der Gesamtpunktzahl wird aus den Wiederholungen gebildet", () => {
  assert.equal(varianzDesMittels([1]), 0, "eine einzige Ziehung sagt nichts ueber die Streuung");
  assert.equal(varianzDesMittels([1, 1, 1]), 0, "ein stabiler Fall hat keinen Messfehler");
  // Drei Ziehungen 1/1/0: Stichprobenvarianz 1/3, Varianz des Mittels 1/9.
  assert.equal(Math.round(varianzDesMittels([1, 1, 0]) * 10_000) / 10_000, 0.1111);

  const wackelig = aggregateCaseRuns([JA, JA, NEIN].map((a) => scoreCase(WACKELFALL, a)));
  const stabil = aggregateCaseRuns([JA, JA, JA].map((a) => scoreCase({ ...WACKELFALL, id: "stabil" }, a)));
  const summary = aggregateCaseScores([wackelig, stabil]);
  // Ein wackeliger von zwei Faellen: (1/2)^2 * 0,1111 -> Wurzel 0,1667.
  assert.equal(summary.punktzahlStreuung, 0.1667);
});

test("Rauschen gilt nicht als Regression, eine echte Verschlechterung schon", () => {
  // Ohne Wiederholungen bleibt die Schwelle exakt die alte (0,02).
  const ohneWiederholungen = compareWithBaseline(
    { weightedScore: 0.87, latencyMsP95: 1000, criticalFailures: 0 },
    { summary: { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0 } }
  );
  assert.equal(ohneWiederholungen.scoreSchwelle, 0.02);
  assert.equal(ohneWiederholungen.regressed, true, "3 Punkte Rueckgang ohne Messfehlerangabe bleibt eine Regression");

  // Mit Wiederholungen: derselbe Rueckgang liegt innerhalb des Rauschbandes.
  const mitMessfehler = compareWithBaseline(
    { weightedScore: 0.87, latencyMsP95: 1000, criticalFailures: 0, punktzahlStreuung: 0.034 },
    { summary: { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0, punktzahlStreuung: 0.034 } }
  );
  assert.equal(mitMessfehler.rauschband, 0.0962);
  assert.equal(mitMessfehler.regressed, false, "3 Punkte sind bei diesem Messfehler nicht unterscheidbar vom Zufall");

  // Aber ein echter Einbruch wird weiterhin gemeldet — die Pruefung ist nicht
  // gelockert, sie ist nur ehrlich ueber ihre eigene Genauigkeit.
  const echterEinbruch = compareWithBaseline(
    { weightedScore: 0.5, latencyMsP95: 1000, criticalFailures: 0, punktzahlStreuung: 0.034 },
    { summary: { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0, punktzahlStreuung: 0.034 } }
  );
  assert.equal(echterEinbruch.regressed, true);
  assert.ok(echterEinbruch.reasons.includes("score_regression"));

  // Ein neuer kritischer Verstoss bleibt unabhaengig davon eine Regression.
  const kritisch = compareWithBaseline(
    { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 1, punktzahlStreuung: 0.2 },
    { summary: { weightedScore: 0.9, latencyMsP95: 1000, criticalFailures: 0, punktzahlStreuung: 0.2 } }
  );
  assert.ok(kritisch.reasons.includes("critical_failure_regression"));
});

test("ein Vorlauf mit anderer Wiederholungszahl ist kein Vergleichswert", async () => {
  // Live belegt am 2026-07-31: der erste Lauf mit drei Ziehungen verglich sich
  // gegen einen Bericht mit einer Ziehung und meldete critical_failure_regression
  // — obwohl sich am System nichts geaendert hatte. Grund: bei drei Ziehungen
  // gilt ein Fall schon dann als kritisch gescheitert, wenn er EINMAL reisst.
  const hash = "a".repeat(64);
  const bericht = (wiederholungen) => ({
    suite: { suiteId: "s", contentSha256: hash },
    run: { modelId: "live-default", live: true },
    summary: { weightedScore: 0.9, ...(wiederholungen === null ? {} : { wiederholungen }) }
  });
  const suchen = (gesucht, gespeichert) => findBaselineReport({
    dir: "/egal",
    suiteId: "s",
    contentSha256: hash,
    modelId: "live-default",
    wiederholungen: gesucht,
    readDir: async () => ["modeleval-s-live-default-2026-07-31.json"],
    readJson: async () => gespeichert
  });
  assert.equal(await suchen(3, bericht(1)), null, "eine Ziehung taugt nicht als Vorlauf fuer drei");
  assert.notEqual(await suchen(3, bericht(3)), null, "gleiche Messart bleibt vergleichbar");
  // Aeltere Berichte kennen das Feld nicht und zaehlen als eine Ziehung.
  assert.notEqual(await suchen(1, bericht(null)), null);
  assert.equal(await suchen(3, bericht(null)), null);
});

test("Abnahme: zwei unveraenderte Laeufe unterscheiden sich nur noch geringfuegig", async () => {
  // Nachbau der gemessenen Lage vom 2026-07-31: 14 Faelle, davon drei wackelig
  // (0 %, 60 %, 60 %). Der Zufall ist fest verdrahtet, damit der Test
  // deterministisch bleibt und trotzdem echtes Wuerfeln nachbildet.
  const quoten = [0, 0.6, 0.6, ...Array(11).fill(1)];
  const faelle = quoten.map((_, i) => ({ ...WACKELFALL, id: `fall-${i}` }));
  const laeufe = async (wiederholungen, anzahl) => {
    let zustand = 20260731;
    const wuerfel = () => {
      zustand = (zustand * 1664525 + 1013904223) % 4294967296;
      return zustand / 4294967296;
    };
    const ergebnisse = [];
    for (let lauf = 0; lauf < anzahl; lauf += 1) {
      const { caseScores } = await runEvalSuite({
        suite: SUITE,
        cases: faelle,
        callModel: async (evalCase) => {
          const index = faelle.findIndex((f) => f.id === evalCase.id);
          return wuerfel() < quoten[index] ? JA : NEIN;
        },
        delayMs: 0,
        wiederholungen
      });
      ergebnisse.push(aggregateCaseScores(caseScores));
    }
    return ergebnisse;
  };

  // 1. Der Ausgangsbefund ist reproduziert: ohne Wiederholungen schwankt die
  //    Punktzahl allein durch Zufall zwischen 11/14 und 13/14.
  const ohne = await laeufe(1, 40);
  const punkteOhne = ohne.map((s) => s.weightedScore);
  assert.equal(Math.min(...punkteOhne), 0.7857, "11 von 14");
  assert.equal(Math.max(...punkteOhne), 0.9286, "13 von 14");
  assert.equal(ohne[0].punktzahlStreuung, 0, "und die Messung behauptet, exakt zu sein");

  // 2. Mit Wiederholungen schrumpft die Spannweite — aber sie verschwindet
  //    nicht. Genau deshalb wird der Messfehler mitgefuehrt statt so zu tun,
  //    als waere die Zahl jetzt exakt.
  const mit = await laeufe(3, 40);
  const punkteMit = mit.map((s) => s.weightedScore);
  const spannweiteMit = Math.max(...punkteMit) - Math.min(...punkteMit);
  assert.ok(spannweiteMit < 0.1429, `Spannweite gesunken (gemessen ${spannweiteMit})`);
  assert.ok(mit[0].punktzahlStreuung > 0, "der Messfehler wird jetzt ausgewiesen");
  assert.equal(mit[0].wackelig >= 2, true, "die wackeligen Faelle sind als solche benannt");

  // 3. Das eigentliche Abnahmekriterium: KEIN Paar aufeinanderfolgender Laeufe
  //    darf noch als Regression gelten, obwohl sich am System nichts geaendert
  //    hat. Das ist die Aussage "unterscheiden sich nur noch geringfuegig".
  const faelschlichGemeldet = (reihe) => {
    let treffer = 0;
    for (let i = 1; i < reihe.length; i += 1) {
      if (compareWithBaseline(reihe[i], { summary: reihe[i - 1] }).regressed) treffer += 1;
    }
    return treffer;
  };
  //    Gemessen ueber 39 Paare: vorher 14 Fehlalarme, bei drei Wiederholungen
  //    noch einer, bei fuenf keiner mehr. Der eine Rest ist kein Fehler im Code,
  //    sondern der Preis der 2-Sigma-Schwelle: rund 2 % Fehlalarme sind bei 95 %
  //    Sicherheit zu erwarten. Wer weniger will, erhoeht SMEJJ_EVAL_WIEDERHOLUNGEN
  //    — nicht die Schwelle.
  assert.equal(faelschlichGemeldet(ohne), 14, "vorher wurde Rauschen laufend als Regression gemeldet");
  assert.ok(faelschlichGemeldet(mit) <= 1, `nachher hoechstens ein Fehlalarm (gemessen ${faelschlichGemeldet(mit)})`);

  const mitFuenf = await laeufe(5, 40);
  assert.equal(faelschlichGemeldet(mitFuenf), 0, "bei fuenf Wiederholungen verschwindet auch der Rest");
});
