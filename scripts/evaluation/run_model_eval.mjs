#!/usr/bin/env node
// smejj.com — Modell-Eval-Lauf.
//
// Beantwortet die einzige Frage, die bei einem neuen Modell wirklich zaehlt:
// "Ist es fuer smejj.com messbar besser als das, was heute laeuft?"
//
// Standard ist ein Trockenlauf: Suite pruefen, Plan zeigen, KEIN Modellaufruf,
// keine Kosten. Erst --live ruft wirklich ein Modell auf (Budget-Gate).
//
// Beispiele:
//   node scripts/evaluation/run_model_eval.mjs
//   node scripts/evaluation/run_model_eval.mjs --live
//   node scripts/evaluation/run_model_eval.mjs --live --model kimi-k2-7 --transport provider
//
// Der Bericht landet in docs/benchmarks/ und enthaelt nur Kennzahlen — nie
// Modellantworten im Klartext (Trainingsdaten-Policy, fail-closed).
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectCases, validateEvalSuite } from "../../src/evaluation/evalSuite.js";
import {
  aggregateCaseRuns,
  begrenzeWiederholungen,
  scoreCase,
  WIEDERHOLUNGEN_MAX,
  WIEDERHOLUNGEN_MIN,
  wiederholungenAusEnv
} from "../../src/evaluation/evalScoring.js";
import { buildEvalReport, EVAL_VERDICT, formatEvalSummary } from "../../src/evaluation/evalReport.js";
import { callViaControl, callViaProvider, chatEndpointFromEnv, DEFAULT_CHAT_ENDPOINT, isTransientError, TRANSPORTS } from "../../src/evaluation/evalTransport.js";
import { wrapCallerWithRag } from "../../src/evaluation/evalRagContext.js";
import { loadEvalSuite } from "../../src/evaluation/evalPacks.js";
import { MIN_TOP_SCORE } from "../../control-server/src/rag/ragRanking.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const DEFAULT_SUITE = "evals/suites/smejj-chat-core-v1.json";
const REPORT_DIR = "docs/benchmarks";
const DEFAULT_DELAY_MS = 400;

export function parseArguments(argv, env = process.env) {
  const options = {
    suite: DEFAULT_SUITE,
    model: "",
    transport: "control",
    live: false,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
    retries: 2,
    // Dieselbe Einstellung wie im Training-Loop, damit Kommandozeile und Dienst
    // nie unterschiedlich messen.
    wiederholungen: wiederholungenAusEnv(env),
    // Projektwissen (RAG) als System-Kontext voranstellen. Aus, solange die
    // Live-Kette es nicht ausliefert — sonst misst der Harness etwas, das der
    // Dienst nicht kann, und der Bericht wuerde die Realitaet beschoenigen.
    rag: false,
    // Leer = Produktionsschwelle aus ragRanking.js. Ein abweichender Wert ist eine
    // Messung, kein Betriebszustand — er landet darum im Bericht.
    ragSchwelle: null,
    // Nachsortierer: ein Modellaufruf waehlt aus einem groesseren Trefferbecken die
    // zustaendige Passage — oder lehnt alle ab. Aus heisst: Byte fuer Byte der
    // bisherige Weg, damit frueher gemessene Berichte vergleichbar bleiben.
    rerank: false,
    out: "",
    baseline: "",
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[index + 1];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--live") options.live = true;
    else if (token === "--rag") options.rag = true;
    else if (token === "--rerank") options.rerank = true;
    else if (token === "--rag-schwelle") { options.ragSchwelle = Number.parseFloat(next()); index += 1; }
    else if (token === "--suite") { options.suite = String(next() || ""); index += 1; }
    else if (token === "--model") { options.model = String(next() || ""); index += 1; }
    else if (token === "--transport") { options.transport = String(next() || ""); index += 1; }
    else if (token === "--limit") { options.limit = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--delay-ms") { options.delayMs = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--retries") { options.retries = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--wiederholungen") { options.wiederholungen = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--out") { options.out = String(next() || ""); index += 1; }
    else if (token === "--baseline") { options.baseline = String(next() || ""); index += 1; }
    else return { error: `unknown_argument:${token}` };
  }
  if (!TRANSPORTS.includes(options.transport)) return { error: `unknown_transport:${options.transport}` };
  if (options.limit !== null && !(Number.isInteger(options.limit) && options.limit > 0)) {
    return { error: "invalid_limit" };
  }
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0) return { error: "invalid_delay" };
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 5) {
    return { error: "invalid_retries" };
  }
  if (options.ragSchwelle !== null) {
    if (!Number.isFinite(options.ragSchwelle) || options.ragSchwelle < 0) return { error: "invalid_rag_schwelle" };
    // Eine Schwelle ohne --rag waere wirkungslos und liesse den Bericht behaupten,
    // es sei etwas gemessen worden, was nie lief.
    if (!options.rag) return { error: "rag_schwelle_ohne_rag" };
  }
  // Ein Nachsortierer ohne Kontext haette nichts zu sortieren. Still durchlassen
  // hiesse, der Bericht traegt "rerank: true" ueber einen Lauf, in dem nie einer lief.
  if (options.rerank && !options.rag) return { error: "rerank_ohne_rag" };
  // Streng statt stillschweigend begrenzt: auf der Kommandozeile ist ein Wert
  // ausserhalb des Bereichs ein Tippfehler, kein Wunsch.
  if (!Number.isInteger(options.wiederholungen) ||
      options.wiederholungen < WIEDERHOLUNGEN_MIN || options.wiederholungen > WIEDERHOLUNGEN_MAX) {
    return { error: "invalid_wiederholungen" };
  }
  return { options };
}

/**
 * Fuehrt die Suite aus. Der Modellaufruf wird injiziert, damit der Ablauf ohne
 * Netz getestet werden kann.
 *
 * Transiente Transportfehler (503, Timeout, leere Antwort) werden begrenzt
 * wiederholt: sonst wird Infrastrukturrauschen als Modellversagen gewertet und
 * die Modellentscheidung beruht auf einem Messfehler.
 *
 * `wiederholungen` fuehrt JEDEN Fall mehrfach aus und berichtet die
 * Bestehensquote. Das ist etwas anderes als `retries`: retries wiederholt einen
 * kaputten TRANSPORT, wiederholungen misst dasselbe Modell mehrfach, weil es mit
 * temperature 0.35 antwortet und jede Ziehung anders ausfallen darf.
 */
export async function runEvalSuite({
  suite,
  cases,
  callModel,
  delayMs = 0,
  retries = 2,
  wiederholungen = 1,
  onCase = () => {},
  sleep = defaultSleep
}) {
  const durchgaenge = begrenzeWiederholungen(Number.isInteger(wiederholungen) ? wiederholungen : 1);
  const caseScores = [];
  for (const evalCase of cases) {
    const laeufe = [];
    let letztesErgebnis = null;
    for (let durchgang = 0; durchgang < durchgaenge; durchgang += 1) {
      let result = null;
      let attempts = 0;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        attempts = attempt + 1;
        result = await callModel(evalCase);
        if (result?.ok === true || !isTransientError(result?.error)) break;
        if (attempt < retries && delayMs > 0) await sleep(delayMs);
      }
      // Das angeforderte Modell ist nicht zwingend das antwortende: der Router darf
      // zurueckfallen. Ohne diese Zuordnung waere die Messung nicht belastbar.
      laeufe.push({
        ...scoreCase(evalCase, result),
        attempts,
        backend: String(result?.backend || "unknown"),
        resolvedModelId: String(result?.modelId || "")
      });
      letztesErgebnis = result;
      // Der Abstand gilt zwischen JEDEM Modellaufruf, nicht je Fall. Mehr
      // Wiederholungen erhoehen damit die Gesamtzahl der Aufrufe, nicht das
      // Tempo — die Ratenbegrenzung der Bruecke (12 Anfragen/Minute) bleibt
      // eingehalten. Nicht schneller machen.
      if (delayMs > 0) await sleep(delayMs);
    }
    const scored = aggregateCaseRuns(laeufe);
    caseScores.push(scored);
    onCase(scored, letztesErgebnis);
  }
  return { suite, caseScores };
}

/**
 * Neuester frueherer Live-Bericht desselben Modells und derselben Suite.
 *
 * Verglichen wird ausschliesslich gegen denselben Suite-Inhalts-Hash. Zwei Laeufe
 * mit unterschiedlichen Erwartungen sind nicht vergleichbar — ein Vergleich waere
 * eine Zahl ohne Aussage.
 */
export async function findBaselineReport({
  dir,
  suiteId,
  contentSha256,
  modelId,
  // Gemessener Weg. Zwei Berichte ueber verschiedene Spuren (Schnellspur gegen
  // Control Server) sind NICHT vergleichbar — ein Spurwechsel wuerde sonst als
  // Regression gemeldet. Aeltere Berichte haben das Feld noch nicht; sie zaehlen
  // als der historische Standardweg, damit die unveraenderte Spur weiter
  // vergleichbar bleibt und nur ein echter Wechsel die Kette trennt.
  endpoint = DEFAULT_CHAT_ENDPOINT,
  // Wiederholungen je Fall. Aus demselben Grund Teil der Vergleichbarkeit wie
  // der Endpunkt: mit drei Ziehungen zaehlt ein Fall schon dann als kritisch
  // gescheitert, wenn er EINMAL reisst — mit einer Ziehung nur, wenn genau diese
  // riss. Ein Bericht ueber drei Ziehungen gegen einen ueber eine gestellt meldet
  // deshalb eine Regression, die nur ein Wechsel der Messart ist. Live belegt am
  // 2026-07-31: 89,2 % gegen 91,2 %, gemeldet als critical_failure_regression,
  // obwohl sich am System nichts geaendert hatte.
  // Aeltere Berichte kennen das Feld nicht; sie zaehlen als eine Ziehung.
  wiederholungen = 1,
  // Projektwissen im Prompt. Aus demselben Grund Teil der Vergleichbarkeit wie
  // Endpunkt und Wiederholungen: ein Lauf MIT Kontext gegen einen OHNE gestellt
  // misst nicht das Modell, sondern den Kontext — und meldet den Unterschied als
  // Fortschritt oder Regression des Modells. Das ist genau die Verwechslung, die
  // dieser Vergleichsschluessel verhindern soll.
  rag = false,
  // Nachsortierer. Aus demselben Grund Teil des Vergleichsschluessels wie rag:
  // ein Lauf, in dem ein Modell die Passage waehlt, ist mit einem, der BM25 folgt,
  // nicht vergleichbar — der Unterschied waere sonst als Modellfortschritt gelesen.
  // Aeltere Berichte kennen das Feld nicht; sie entstanden ohne Nachsortierer.
  rerank = false,
  readDir = readdir,
  readJson = readJsonFile
}) {
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return null;
  }
  const candidates = entries.filter((name) => name.startsWith("modeleval-") && name.endsWith(".json")).sort().reverse();
  for (const name of candidates) {
    const report = await readJson(path.join(dir, name)).catch(() => null);
    const berichtEndpunkt = report?.run?.endpoint || DEFAULT_CHAT_ENDPOINT;
    const berichtWiederholungen = Number.isInteger(report?.summary?.wiederholungen)
      ? report.summary.wiederholungen
      : 1;
    // Aeltere Berichte kennen das Feld nicht; sie entstanden ohne Projektwissen.
    const berichtRag = report?.run?.rag === true;
    const berichtRerank = report?.run?.rerank === true;
    if (report?.suite?.suiteId === suiteId &&
        report?.suite?.contentSha256 === contentSha256 &&
        report?.run?.modelId === modelId &&
        berichtEndpunkt === endpoint &&
        berichtWiederholungen === wiederholungen &&
        berichtRag === rag &&
        berichtRerank === rerank &&
        report?.run?.live === true) {
      return report;
    }
  }
  return null;
}

function reportFileName(suiteId, modelId, isoDate, rag = false, rerank = false) {
  const safeModel = String(modelId || "unknown").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  // Der Zusatz haelt die beiden Spuren desselben Tages auseinander; ohne ihn
  // ueberschriebe der zweite Lauf den ersten und der A/B-Vergleich waere weg.
  return `modeleval-${suiteId}-${safeModel}${rag ? "-rag" : ""}${rerank ? "-rerank" : ""}-${isoDate.slice(0, 10)}.json`;
}

async function readJsonFile(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  return [
    "smejj.com Modell-Eval",
    "",
    "  --suite <pfad>       Eval-Suite (Standard: evals/suites/smejj-chat-core-v1.json)",
    "  --model <id>         Modell-Kennung, z. B. glm-5-2 oder kimi-k2-7",
    "  --transport <weg>    control (Live-Kette, Standard) oder provider (direkt, BYOK)",
    "  --live               Modell wirklich aufrufen (ohne dieses Flag nur Trockenlauf)",
    "  --rag                Projektwissen als System-Kontext voranstellen (BM25 ueber",
    "                       die Regeldokumente). Fuer den A/B-Vergleich: derselbe Lauf",
    "                       einmal ohne und einmal mit --rag. Berichte werden nur",
    "                       gegen Berichte derselben Messart verglichen.",
    `  --rag-schwelle <n>   Mindestpunktzahl fuer RAG-Kontext (Standard ${MIN_TOP_SCORE}).`,
    "                       Nur mit --rag. Ein abweichender Wert ist eine Messung und",
    "                       wird im Bericht festgehalten.",
    "  --rerank             Nachsortierer: ein Modellaufruf waehlt aus einem groesseren",
    "                       Trefferbecken die zustaendige Passage — oder lehnt alle ab.",
    "                       Nur mit --rag. Ohne dieses Flag laeuft der bisherige Weg.",
    "  --limit <n>          hoechstens n Faelle ausfuehren",
    "  --delay-ms <n>       Pause zwischen zwei Faellen (Standard 400)",
    "  --retries <n>        Wiederholungen bei transienten Transportfehlern (Standard 2)",
    `  --wiederholungen <n> Durchgaenge je Fall, ${WIEDERHOLUNGEN_MIN} bis ${WIEDERHOLUNGEN_MAX}`,
    "                       (Standard aus SMEJJ_EVAL_WIEDERHOLUNGEN). Berichtet wird die",
    "                       Bestehensquote je Fall statt eines einzelnen Ja/Nein.",
    "  --baseline <pfad>    Vergleichsbericht; ohne Angabe wird der neueste passende gesucht",
    "  --out <pfad>         Zielpfad des Berichts",
    ""
  ].join("\n");
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`Abbruch: ${parsed.error}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  const options = parsed.options;
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const suiteFile = path.resolve(REPO_ROOT, options.suite);
  let suite;
  try {
    // Manifest-Suiten (Feld `packs`) werden hier zusammengefuehrt; eine einzelne
    // Suite-Datei laedt unveraendert wie vorher. Fail-closed in beiden Faellen.
    ({ suite } = await loadEvalSuite(suiteFile, { lesen: readJsonFile }));
  } catch (error) {
    process.stderr.write(`Abbruch: Suite nicht lesbar (${String(error?.message || error).slice(0, 120)})\n`);
    process.exitCode = 1;
    return;
  }

  const validation = validateEvalSuite(suite);
  if (!validation.ok) {
    process.stderr.write(`Abbruch: Suite ungueltig — ${validation.reasons.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const cases = selectCases(suite, { limit: options.limit });
  const modelId = options.model || "live-default";

  if (!options.live) {
    // Trockenlauf: beweist, dass die Suite gueltig und ausfuehrbar ist — ohne einen
    // einzigen kostenpflichtigen Aufruf. Das ist der Modus fuer die Pflicht-Checks.
    process.stdout.write([
      `Trockenlauf — kein Modellaufruf, keine Kosten.`,
      `Suite ${suite.suiteId} ${suite.version} (sha256 ${suite.integrity.contentSha256.slice(0, 12)}…)`,
      `Faelle: ${cases.length} von ${suite.cases.length}, Budget minScore ${suite.budgets.minScore}`,
      `Wiederholungen je Fall: ${options.wiederholungen}` +
        ` — ${cases.length * options.wiederholungen} Modellaufrufe im Livelauf`,
      `Transportweg: ${options.transport}, Modell: ${modelId}`,
      `Projektwissen (RAG) im Prompt: ${options.rag ? "ja" : "nein"}` +
        `${options.rerank ? " — mit Nachsortierer" : ""}`,
      `Fuer einen echten Lauf: --live anhaengen.`,
      ""
    ].join("\n"));
    return;
  }

  const basisAufruf = options.transport === "control"
    ? (evalCase) => callViaControl(evalCase, { modelId: options.model })
    : await providerCaller(options.model);
  // Der Nachsortierer laeuft ueber DENSELBEN Transportweg wie die Messung selbst.
  // Ein zweiter, eigener Weg waere eine zweite Fehlerquelle — und die Zeitkosten
  // waeren nicht die, die spaeter im Betrieb anfallen.
  const nachsortierer = options.rerank
    ? async (prompt, { maxTokens }) => {
      // Dieselbe Wiederholung wie beim Antwortaufruf. Ohne sie zaehlte jeder
      // einzelne Netzaussetzer als "Nachsortierer hat versagt": im Lauf vom
      // 2026-08-04 waren das 63 von 651 Becken (10 %), obwohl eine isolierte
      // Probe ueber 45 Becken NULL Ausfaelle zeigte. Der Unterschied war allein
      // die fehlende Wiederholung — ETIMEDOUT gegen open.bigmodel.cn.
      for (let versuch = 0; versuch <= options.retries; versuch += 1) {
        const ergebnis = await basisAufruf({ profile: "fast", prompt, maxTokens });
        if (ergebnis?.ok === true) return String(ergebnis.text || "");
        if (!isTransientError(ergebnis?.error)) break;
        if (versuch < options.retries && options.delayMs > 0) {
          await new Promise((fertig) => setTimeout(fertig, options.delayMs));
        }
      }
      return "";
    }
    : null;
  const ragHuelle = options.rag
    ? wrapCallerWithRag(basisAufruf, REPO_ROOT, {
      ...(Number.isFinite(options.ragSchwelle) ? { minTopScore: options.ragSchwelle } : {}),
      ...(nachsortierer ? { nachsortierer } : {})
    })
    : null;
  const callModel = ragHuelle ? ragHuelle.callModel : basisAufruf;

  const startedAt = new Date().toISOString();
  process.stdout.write(`Lauf gestartet: ${cases.length} Faelle je ${options.wiederholungen}x` +
    ` (${cases.length * options.wiederholungen} Aufrufe), Transportweg ${options.transport}\n`);
  const { caseScores } = await runEvalSuite({
    suite,
    cases,
    callModel,
    delayMs: options.delayMs,
    retries: options.retries,
    wiederholungen: options.wiederholungen,
    onCase: (scored) => {
      // WACK statt FEHL, sobald ein Fall schwankt: die Unterscheidung zwischen
      // "faellt immer durch" und "faellt manchmal durch" ist die Aussage.
      const marker = scored.wackelig ? "WACK" : scored.status === "passed" ? "OK  " : scored.status === "partial" ? "TEIL" : "FEHL";
      process.stdout.write(`  ${marker} ${scored.caseId} — ${(scored.score * 100).toFixed(0)} %` +
        `${scored.laeufe > 1 ? `, ${scored.bestanden}/${scored.laeufe} bestanden` : ""}` +
        `${scored.latencyMs === null ? "" : `, ${scored.latencyMs} ms`}` +
        `${scored.attempts > 1 ? `, ${scored.attempts} Versuche` : ""}` +
        `${scored.error ? `, ${scored.error}` : ""}\n`);
    }
  });
  const finishedAt = new Date().toISOString();

  const reportDirAbs = path.resolve(REPO_ROOT, REPORT_DIR);
  const baseline = options.baseline
    ? await readJsonFile(path.resolve(REPO_ROOT, options.baseline)).catch(() => null)
    : await findBaselineReport({
      dir: reportDirAbs,
      suiteId: suite.suiteId,
      contentSha256: suite.integrity.contentSha256,
      modelId,
      wiederholungen: options.wiederholungen,
      endpoint: chatEndpointFromEnv(),
      rag: options.rag,
      rerank: options.rerank
    });

  const report = buildEvalReport({
    suite,
    run: {
      modelId,
      transport: options.transport,
      profileMode: "case",
      live: true,
      startedAt,
      finishedAt,
      // Beide Felder gehoeren in den Bericht, weil findBaselineReport spaeter
      // genau danach vergleicht. Ohne sie waeren Laeufe verschiedener Messart
      // nicht auseinanderzuhalten.
      endpoint: chatEndpointFromEnv(),
      rag: options.rag,
      rerank: options.rerank,
      ragSchwelle: options.rag ? (options.ragSchwelle ?? MIN_TOP_SCORE) : null,
      ...(ragHuelle ? { ragStats: ragHuelle.stats } : {})
    },
    caseScores,
    baseline
  });

  await mkdir(reportDirAbs, { recursive: true });
  const outRelative = options.out || path.join(REPORT_DIR, reportFileName(suite.suiteId, modelId, finishedAt, options.rag, options.rerank));
  await writeFile(path.resolve(REPO_ROOT, outRelative), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (ragHuelle) {
    process.stdout.write(`\nProjektwissen: ${ragHuelle.stats.aufrufeMitKontext} von ` +
      `${ragHuelle.stats.aufrufeMitKontext + ragHuelle.stats.aufrufeOhneKontext} Aufrufen mit Kontext ` +
      `(${ragHuelle.stats.zeichenGesamt} Zeichen gesamt)\n`);
  }
  process.stdout.write(`\n${formatEvalSummary(report)}\nBericht: ${outRelative}\n`);
  if (report.verdict !== EVAL_VERDICT.PASSED) process.exitCode = 1;
}

/**
 * Baut den direkten Router-Aufruf. Der Router wird erst hier geladen, damit der
 * Trockenlauf und die Tests ohne Control-Server-Abhaengigkeiten auskommen.
 */
async function providerCaller(modelId) {
  const router = await import("../../control-server/src/llm/modelRouter.js");
  return (evalCase) => callViaProvider(evalCase, {
    modelId,
    resolveModelRequest: router.resolveModelRequest,
    executeWithFallback: router.executeWithFallback
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  await main();
}
