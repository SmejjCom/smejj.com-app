// smejj.com — Bewertung von Modellantworten gegen die Erwartungen eines Eval-Falls.
//
// Reine Funktionen, keine Seiteneffekte, kein Netz. Deterministisch: gleiche Antwort
// ergibt immer dieselbe Punktzahl. Damit ist jede Modellentscheidung nachvollziehbar
// und replaybar (Kernprinzip von smejj.com).
import { isSafePattern } from "./evalSuite.js";

/** Bewertet eine einzelne Erwartung. Liefert nie eine Ausnahme. */
export function evaluateAssertion(assertion, { text = "", latencyMs = null } = {}) {
  const type = assertion?.type;
  const haystack = String(text || "");
  const lower = haystack.toLowerCase();

  switch (type) {
    case "contains_all":
      return verdict(assertion, values(assertion).every((value) => lower.includes(value.toLowerCase())));
    case "contains_any":
      return verdict(assertion, values(assertion).some((value) => lower.includes(value.toLowerCase())));
    case "contains_none":
      return verdict(assertion, values(assertion).every((value) => !lower.includes(value.toLowerCase())));
    case "matches":
      return verdict(assertion, testPattern(assertion.pattern, haystack, assertion.ignoreCase === true));
    case "not_matches":
      return verdict(assertion, !testPattern(assertion.pattern, haystack, assertion.ignoreCase === true));
    case "min_length":
      return verdict(assertion, haystack.trim().length >= assertion.value);
    case "max_length":
      return verdict(assertion, haystack.trim().length <= assertion.value);
    case "json_parses":
      return verdict(assertion, parsesAsJson(haystack));
    case "max_latency_ms":
      return verdict(assertion, Number.isFinite(latencyMs) && latencyMs <= assertion.value);
    default:
      // Unbekannter Typ gilt als nicht erfuellt (fail-closed), nicht als bestanden.
      return { type: String(type || "unknown"), critical: true, ok: false };
  }
}

/**
 * Bewertet einen Fall.
 * Punktzahl = erfuellte Erwartungen / alle Erwartungen. Eine verletzte kritische
 * Erwartung setzt den Fall auf 0 — so koennen Sicherheits- und Namensregeln nicht
 * durch viele erfuellte Nebenkriterien "weggerechnet" werden.
 */
export function scoreCase(evalCase, result) {
  const assertions = Array.isArray(evalCase?.assertions) ? evalCase.assertions : [];
  const text = String(result?.text || "");
  const latencyMs = Number.isFinite(result?.latencyMs) ? result.latencyMs : null;

  if (result?.ok !== true) {
    return {
      caseId: evalCase?.id || "unknown",
      profile: evalCase?.profile || "default",
      weight: positiveInt(evalCase?.weight, 1),
      status: "error",
      score: 0,
      criticalFailed: true,
      latencyMs,
      firstTokenMs: Number.isFinite(result?.firstTokenMs) ? result.firstTokenMs : null,
      outputChars: text.length,
      error: shortReason(result?.error),
      assertions: []
    };
  }

  const evaluated = assertions.map((assertion) => evaluateAssertion(assertion, { text, latencyMs }));
  const passed = evaluated.filter((entry) => entry.ok).length;
  const criticalFailed = evaluated.some((entry) => entry.critical && !entry.ok);
  const ratio = evaluated.length > 0 ? passed / evaluated.length : 0;
  const score = criticalFailed ? 0 : round4(ratio);

  return {
    caseId: evalCase?.id || "unknown",
    profile: evalCase?.profile || "default",
    weight: positiveInt(evalCase?.weight, 1),
    status: score === 1 ? "passed" : score === 0 ? "failed" : "partial",
    score,
    criticalFailed,
    latencyMs,
    firstTokenMs: Number.isFinite(result?.firstTokenMs) ? result.firstTokenMs : null,
    outputChars: text.length,
    error: null,
    assertions: evaluated
  };
}

/**
 * Wiederholungen je Fall — EINE Quelle fuer alle Aufrufer (Kommandozeile,
 * Training-Loop, Tests).
 *
 * Warum es das ueberhaupt gibt: die gemessene Antwortkette laeuft mit
 * temperature 0.35, jeder Lauf wuerfelt also neu. Eine einzelne Ziehung je Fall
 * misst deshalb zu einem guten Teil den Zufall mit. Am 2026-07-31 wurde belegt,
 * dass ein gemeldeter Absturz von 91,18 % auf 76,47 % vollstaendig daraus
 * erklaerbar war: drei Faelle bestanden nur 0/5, 3/5 und 3/5 der Wiederholungen.
 *
 * Bei 1 verhaelt sich alles exakt wie vorher — das ist die Rueckfallebene.
 */
export const WIEDERHOLUNGEN_MIN = 1;
export const WIEDERHOLUNGEN_MAX = 10;
export const WIEDERHOLUNGEN_STANDARD = 3;

/** Liest SMEJJ_EVAL_WIEDERHOLUNGEN und begrenzt den Wert, statt ihm zu trauen. */
export function wiederholungenAusEnv(env = {}) {
  return begrenzeWiederholungen(Number(env?.SMEJJ_EVAL_WIEDERHOLUNGEN));
}

/** Auf den zulaessigen Bereich begrenzen; unbrauchbare Werte ergeben den Standard. */
export function begrenzeWiederholungen(wert) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return WIEDERHOLUNGEN_STANDARD;
  return Math.min(WIEDERHOLUNGEN_MAX, Math.max(WIEDERHOLUNGEN_MIN, Math.round(zahl)));
}

/**
 * Fasst die Wiederholungen EINES Falls zu einem Eintrag zusammen.
 *
 * Berichtet wird die Bestehensquote, nicht ein einzelnes Ja/Nein. Die Punktzahl
 * ist das Mittel ueber ALLE Wiederholungen — kein "best of N". Den besten Lauf
 * zu nehmen waere Betrug an der eigenen Messung: ein Fall, der 3 von 5 Mal
 * besteht, zaehlt als 0,6 und nicht als 1.
 *
 * Felder, die der Aufrufer angehaengt hat (attempts, backend, resolvedModelId),
 * werden mitgetragen — diese Funktion kennt sie nicht und muss sie nicht kennen.
 */
export function aggregateCaseRuns(runs) {
  const laeufe = (Array.isArray(runs) ? runs : []).filter(Boolean);
  if (laeufe.length === 0) return null;

  const bestanden = laeufe.filter((run) => run.status === "passed").length;
  const quote = round4(bestanden / laeufe.length);
  // Wackelig heisst: derselbe Fall faellt mal so, mal so aus. Genau diese Faelle
  // sind die eigentliche Information — sie erklaeren Schwankungen der
  // Gesamtpunktzahl, die ohne Wiederholungen wie ein Einbruch aussehen.
  const wackelig = quote > 0 && quote < 1;

  // Rueckfallebene: bei einer einzigen Wiederholung bleibt der Eintrag Feld fuer
  // Feld der von heute. Nur die vier neuen Felder kommen hinzu.
  if (laeufe.length === 1) {
    return { ...laeufe[0], laeufe: 1, bestanden, quote, wackelig: false, varianz: 0 };
  }

  const score = round4(laeufe.reduce((summe, run) => summe + run.score, 0) / laeufe.length);
  // Konservativ, und das ist eine bewusste Wahl: EIN kritischer Verstoss in EINER
  // Wiederholung genuegt. Die Schwelle ist also "Quote der kritischen Verstoesse
  // > 0", nicht "Mehrheit". Ein kritischer Verstoss ist eine Sicherheits- oder
  // Namensregel; sie wurde gebrochen, auch wenn sie meistens haelt. Das haelt
  // zugleich die Regel criticalFailures > 0 => Urteil blocked stabil, statt sie
  // davon abhaengen zu lassen, ob der Wuerfel den Verstoss diesmal getroffen hat.
  const criticalFailed = laeufe.some((run) => run.criticalFailed === true);
  const nurFehler = laeufe.every((run) => run.status === "error");
  const hatVersuche = laeufe.some((run) => Number.isInteger(run.attempts));

  return {
    ...laeufe[0],
    status: nurFehler ? "error" : score === 1 ? "passed" : score === 0 ? "failed" : "partial",
    score,
    criticalFailed,
    laeufe: laeufe.length,
    bestanden,
    quote,
    wackelig,
    // Median statt Mittel: ein einzelner Ausreisser nach oben soll die
    // Antwortzeit eines Falls nicht praegen.
    latencyMs: percentile(laeufe.map((run) => run.latencyMs), 50),
    firstTokenMs: percentile(laeufe.map((run) => run.firstTokenMs), 50),
    // Varianz des Mittelwerts dieses Falls — wie unsicher seine Punktzahl ist.
    // Genau daraus wird spaeter der Messfehler der Gesamtpunktzahl gebildet.
    // Bei einer Wiederholung ist sie 0: eine einzelne Ziehung sagt nichts ueber
    // die Streuung aus, und Unwissen darf sich nicht als Sicherheit ausgeben.
    varianz: varianzDesMittels(laeufe.map((run) => run.score)),
    outputChars: Math.round(laeufe.reduce((summe, run) => summe + (run.outputChars || 0), 0) / laeufe.length),
    error: laeufe.find((run) => run.error)?.error || null,
    assertions: mergeAssertions(laeufe),
    // Mehr als ein Transportversuch in irgendeiner Wiederholung heisst: der Weg
    // war wackelig. Deshalb das Maximum und nicht die Summe — sonst saehen drei
    // stoerungsfreie Wiederholungen wie drei Stoerungen aus.
    ...(hatVersuche ? { attempts: Math.max(...laeufe.map((run) => run.attempts || 1)) } : {})
  };
}

/** Gewichtetes Mittel ueber alle Faelle plus Verteilungskennzahlen. */
export function aggregateCaseScores(caseScores) {
  const scores = Array.isArray(caseScores) ? caseScores : [];
  const weightSum = scores.reduce((sum, entry) => sum + positiveInt(entry.weight, 1), 0);
  const weighted = scores.reduce((sum, entry) => sum + entry.score * positiveInt(entry.weight, 1), 0);
  return {
    cases: scores.length,
    weightedScore: weightSum > 0 ? round4(weighted / weightSum) : 0,
    passed: scores.filter((entry) => entry.status === "passed").length,
    partial: scores.filter((entry) => entry.status === "partial").length,
    failed: scores.filter((entry) => entry.status === "failed").length,
    errors: scores.filter((entry) => entry.status === "error").length,
    criticalFailures: scores.filter((entry) => entry.criticalFailed).length,
    // Wackelige Faelle sind kein Nebenwert: sie sind der Grund, warum sich die
    // Gesamtpunktzahl zwischen zwei unveraenderten Laeufen bewegt.
    wackelig: scores.filter((entry) => entry.wackelig === true).length,
    wiederholungen: Math.max(1, ...scores.map((entry) => (Number.isInteger(entry.laeufe) ? entry.laeufe : 1))),
    // Messfehler der Gesamtpunktzahl (Standardfehler des gewichteten Mittels).
    // Ohne diese Zahl ist die Punktzahl eine Kommastelle ohne Aussage: man kann
    // nicht sagen, ob ein Unterschied zum Vorlauf echt ist oder gewuerfelt.
    // Ohne Wiederholungen ist sie 0 — dann bleibt alles wie vorher.
    punktzahlStreuung: standardfehler(scores, weightSum),
    latencyMsP95: percentile(scores.map((entry) => entry.latencyMs), 95),
    latencyMsMedian: percentile(scores.map((entry) => entry.latencyMs), 50),
    firstTokenMsP95: percentile(scores.map((entry) => entry.firstTokenMs), 95)
  };
}

/**
 * Varianz des Mittelwerts einer Messreihe (unverzerrt, Nenner n-1, geteilt
 * durch n). Bei weniger als zwei Werten 0 — aus einer einzigen Ziehung laesst
 * sich keine Streuung ablesen.
 */
export function varianzDesMittels(werte) {
  const zahlen = (Array.isArray(werte) ? werte : []).filter((wert) => Number.isFinite(wert));
  if (zahlen.length < 2) return 0;
  const mittel = zahlen.reduce((summe, wert) => summe + wert, 0) / zahlen.length;
  const quadrate = zahlen.reduce((summe, wert) => summe + (wert - mittel) ** 2, 0);
  return quadrate / (zahlen.length - 1) / zahlen.length;
}

/**
 * Standardfehler des gewichteten Mittels ueber alle Faelle.
 * Die Faelle sind unabhaengig voneinander gezogen, deshalb addieren sich die
 * Varianzen mit dem Quadrat ihres Gewichtsanteils.
 */
function standardfehler(scores, weightSum) {
  if (!(weightSum > 0)) return 0;
  const summe = scores.reduce((wert, entry) => {
    const anteil = positiveInt(entry.weight, 1) / weightSum;
    return wert + anteil ** 2 * (Number.isFinite(entry.varianz) ? entry.varianz : 0);
  }, 0);
  return round4(Math.sqrt(summe));
}

/** Perzentil ueber die vorhandenen Messwerte; null, wenn nichts gemessen wurde. */
export function percentile(values, rank) {
  const usable = (Array.isArray(values) ? values : [])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (usable.length === 0) return null;
  const index = Math.min(usable.length - 1, Math.ceil((rank / 100) * usable.length) - 1);
  return Math.round(usable[Math.max(0, index)]);
}

/**
 * Fuehrt die Erwartungen ueber alle Wiederholungen zusammen.
 * Fail-closed: erfuellt gilt eine Erwartung nur, wenn sie in JEDER Wiederholung
 * hielt. Sonst verschwaende eine Erwartung, die nur manchmal reisst, aus dem
 * Bericht — und das ist genau die, die man sehen muss.
 */
function mergeAssertions(laeufe) {
  const vorlage = laeufe.find((run) => Array.isArray(run.assertions) && run.assertions.length > 0)?.assertions || [];
  return vorlage.map((assertion, index) => {
    const erfuellt = laeufe.filter((run) => run.assertions?.[index]?.ok === true).length;
    return {
      type: assertion.type,
      critical: assertion.critical,
      ok: erfuellt === laeufe.length,
      erfuellt,
      laeufe: laeufe.length
    };
  });
}

function verdict(assertion, ok) {
  return { type: assertion.type, critical: assertion.critical === true, ok: Boolean(ok) };
}

function values(assertion) {
  return Array.isArray(assertion?.values) ? assertion.values.filter((value) => typeof value === "string") : [];
}

/**
 * Muster sind bewusst GROSS-/kleinschreibungsempfindlich. Genau darauf beruht die
 * Namensregel von smejj.com: eine Antwort mit falsch geschriebenem Markenwort muss
 * auffallen, obwohl sie sich nur in der Schreibweise unterscheidet.
 * Wer das nicht braucht, setzt in der Suite ignoreCase auf true.
 */
function testPattern(pattern, text, ignoreCase = false) {
  if (!isSafePattern(pattern)) return false;
  try {
    return new RegExp(pattern, ignoreCase ? "i" : "").test(text);
  } catch {
    return false;
  }
}

/**
 * Akzeptiert eine Antwort als JSON, auch wenn sie in einem Codeblock steht —
 * Modelle liefern JSON haeufig eingerahmt aus, das ist kein inhaltlicher Fehler.
 */
function parsesAsJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  if (!candidate) return false;
  try {
    const parsed = JSON.parse(candidate);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

function shortReason(value) {
  const text = String(value || "unknown_error");
  return text.slice(0, 120);
}
