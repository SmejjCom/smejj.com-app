// smejj.com — Modell-Eval-Suite: Laden, Validieren, Inhalts-Hash.
//
// Zweck: Eine Eval-Suite ist eine versionierte, inhaltsadressierte Sammlung echter
// smejj.com-Faelle mit maschinell pruefbaren Erwartungen. Sie ist die Grundlage jeder
// Modellentscheidung (z. B. "GLM-5.2 behalten oder Kimi K3 nehmen?") und ersetzt
// Bauchgefuehl durch Messwerte.
//
// Trennung der Verantwortung (Single Responsibility):
//   evalSuite.js    -> Struktur und Integritaet der Suite (dieses Modul)
//   evalScoring.js  -> Bewertung einzelner Antworten gegen die Erwartungen
//   evalReport.js   -> Bericht, Budgets, Regressionsvergleich gegen den Vorlauf
//
// Fail-closed: Eine Suite, die nicht vollstaendig validiert, wird nie ausgefuehrt.
import crypto from "node:crypto";
import { canonicalJson } from "./modelPromotion.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

export const EVAL_SCHEMA_VERSION = 1;

/** Erlaubte Routing-Profile — deckungsgleich mit ROUTING_PROFILES des Modell-Routers. */
export const EVAL_PROFILES = Object.freeze(["coding", "reasoning", "fast", "web", "default"]);

/**
 * Erlaubte Erwartungstypen. Bewusst klein und deterministisch gehalten: keine
 * Modell-als-Richter-Konstruktion, damit die Bewertung reproduzierbar bleibt und
 * selbst keine Kosten erzeugt.
 */
export const ASSERTION_TYPES = Object.freeze([
  "contains_all",
  "contains_any",
  "contains_none",
  "matches",
  "not_matches",
  "min_length",
  "max_length",
  "json_parses",
  "max_latency_ms"
]);

const VALUE_LIST_TYPES = new Set(["contains_all", "contains_any", "contains_none"]);
const PATTERN_TYPES = new Set(["matches", "not_matches"]);
const NUMBER_TYPES = new Set(["min_length", "max_length", "max_latency_ms"]);

/** Inhalts-Hash der Suite (ohne das Hash-Feld selbst) — identisch zum Verfahren der Benchmark-Suite. */
export function computeEvalSuiteSha256(suite) {
  const digestInput = structuredClone(suite);
  if (digestInput?.integrity && typeof digestInput.integrity === "object") {
    delete digestInput.integrity.contentSha256;
  }
  return crypto.createHash("sha256").update(canonicalJson(digestInput)).digest("hex");
}

/**
 * Prueft eine Eval-Suite vollstaendig.
 * @param {unknown} suite
 * @returns {{ok: boolean, reasons: string[], computedContentSha256: string|null}}
 */
export function validateEvalSuite(suite) {
  const reasons = [];
  const reject = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!isObject(suite)) return { ok: false, reasons: ["eval_suite_missing"], computedContentSha256: null };
  if (suite.schemaVersion !== EVAL_SCHEMA_VERSION) reject("eval_suite_schema_unsupported");
  if (!ID_PATTERN.test(String(suite.suiteId || ""))) reject("eval_suite_id_invalid");
  if (!nonEmptyString(suite.version)) reject("eval_suite_version_missing");
  if (suite.eligibleForTraining !== false) reject("eval_suite_training_exclusion_missing");

  validateBudgets(suite.budgets, reject);
  const computed = validateIntegrity(suite, reject);
  validateCases(suite.cases, reject);

  return { ok: reasons.length === 0, reasons, computedContentSha256: computed };
}

function validateIntegrity(suite, reject) {
  const integrity = suite.integrity;
  if (!isObject(integrity) ||
      integrity.algorithm !== "sha256" ||
      integrity.canonicalization !== "json-key-sort-v1" ||
      !SHA256_PATTERN.test(String(integrity.contentSha256 || ""))) {
    reject("eval_suite_integrity_invalid");
    return null;
  }
  let computed = null;
  try {
    computed = computeEvalSuiteSha256(suite);
  } catch {
    reject("eval_suite_integrity_invalid");
    return null;
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(integrity.contentSha256, "hex"))) {
      reject("eval_suite_integrity_mismatch");
    }
  } catch {
    reject("eval_suite_integrity_invalid");
  }
  return computed;
}

function validateBudgets(budgets, reject) {
  if (!isObject(budgets)) {
    reject("eval_suite_budgets_missing");
    return;
  }
  // minScore ist die Bestehensgrenze der gesamten Suite (0..1).
  if (!isRatio(budgets.minScore)) reject("eval_suite_min_score_invalid");
  // Antwortzeit-Budget je Fall in Millisekunden; 0 waere kein Budget, sondern ein Fehler.
  if (!isPositiveInt(budgets.latencyMsP95)) reject("eval_suite_latency_budget_invalid");
  if (!isPositiveInt(budgets.firstTokenMs)) reject("eval_suite_first_token_budget_invalid");
  // Harte Obergrenze der Faelle pro Lauf: schuetzt das Modell-Budget (BYOK, kostenpflichtig).
  if (!isPositiveInt(budgets.maxCasesPerRun)) reject("eval_suite_max_cases_invalid");
}

function validateCases(cases, reject) {
  if (!Array.isArray(cases) || cases.length === 0) {
    reject("eval_suite_cases_missing");
    return;
  }
  const seen = new Set();
  for (const item of cases) {
    if (!isObject(item)) {
      reject("eval_case_invalid");
      continue;
    }
    if (!ID_PATTERN.test(String(item.id || ""))) reject("eval_case_id_invalid");
    else if (seen.has(item.id)) reject("eval_case_id_duplicate");
    else seen.add(item.id);

    if (!EVAL_PROFILES.includes(item.profile)) reject("eval_case_profile_invalid");
    if (!nonEmptyString(item.prompt)) reject("eval_case_prompt_missing");
    if (!isPositiveInt(item.weight)) reject("eval_case_weight_invalid");
    if (!isPositiveInt(item.maxTokens)) reject("eval_case_max_tokens_invalid");
    if (item.system !== undefined && !nonEmptyString(item.system)) reject("eval_case_system_invalid");

    if (!Array.isArray(item.assertions) || item.assertions.length === 0) {
      reject("eval_case_assertions_missing");
      continue;
    }
    for (const assertion of item.assertions) validateAssertion(assertion, reject);
  }
}

function validateAssertion(assertion, reject) {
  if (!isObject(assertion) || !ASSERTION_TYPES.includes(assertion.type)) {
    reject("eval_assertion_type_invalid");
    return;
  }
  if (assertion.critical !== undefined && typeof assertion.critical !== "boolean") {
    reject("eval_assertion_critical_invalid");
  }
  if (VALUE_LIST_TYPES.has(assertion.type)) {
    if (!Array.isArray(assertion.values) || assertion.values.length === 0 ||
        !assertion.values.every((value) => nonEmptyString(value))) {
      reject("eval_assertion_values_invalid");
    }
    return;
  }
  if (PATTERN_TYPES.has(assertion.type)) {
    if (!nonEmptyString(assertion.pattern) || !isSafePattern(assertion.pattern)) {
      reject("eval_assertion_pattern_invalid");
    }
    // Muster pruefen standardmaessig die Schreibweise mit. ignoreCase ist die Ausnahme.
    if (assertion.ignoreCase !== undefined && typeof assertion.ignoreCase !== "boolean") {
      reject("eval_assertion_ignore_case_invalid");
    }
    return;
  }
  if (NUMBER_TYPES.has(assertion.type) && !isPositiveInt(assertion.value)) {
    reject("eval_assertion_value_invalid");
  }
}

/**
 * Nur uebersetzbare, laengenbegrenzte Muster zulassen. Verhindert, dass eine
 * fehlerhafte Suite den Lauf mit einem Regex-Fehler abbricht.
 */
export function isSafePattern(pattern) {
  if (String(pattern).length > 300) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

/** Faelle in Ausfuehrungsreihenfolge, begrenzt auf das Budget der Suite bzw. das Limit des Aufrufs. */
export function selectCases(suite, { limit } = {}) {
  const budget = suite?.budgets?.maxCasesPerRun;
  const cap = Math.min(
    Number.isInteger(budget) && budget > 0 ? budget : Number.MAX_SAFE_INTEGER,
    Number.isInteger(limit) && limit > 0 ? limit : Number.MAX_SAFE_INTEGER
  );
  const cases = Array.isArray(suite?.cases) ? suite.cases : [];
  return cases.slice(0, cap === Number.MAX_SAFE_INTEGER ? cases.length : cap);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
