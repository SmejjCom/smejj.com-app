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
    latencyMsP95: percentile(scores.map((entry) => entry.latencyMs), 95),
    latencyMsMedian: percentile(scores.map((entry) => entry.latencyMs), 50),
    firstTokenMsP95: percentile(scores.map((entry) => entry.firstTokenMs), 95)
  };
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
