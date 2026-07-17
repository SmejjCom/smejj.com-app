// smejj.com Maus-Engine — Plan-Validierung (fail-closed, kein Modell).
// Single Responsibility: einen Aktionsplan gegen das normative Schema
// schemas/maus-action-plan.schema.json UND semantische Regeln pruefen,
// die JSON Schema nicht ausdruecken kann. Egal welches Modell den Plan
// erzeugt hat: ungueltig heisst abgelehnt.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createValidator } from "./schema-validator.mjs";
import { checkUrlAllowed } from "./allowlist.mjs";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas", "maus-action-plan.schema.json");

let cachedValidator = null;
function schemaValidator() {
  if (!cachedValidator) {
    cachedValidator = createValidator(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
  }
  return cachedValidator;
}

function hasCoordinates(step) {
  return Boolean(step?.target && typeof step.target === "object" && "coordinates" in step.target);
}

function staticUrlsOfStep(step) {
  const urls = [];
  if (typeof step.url === "string") urls.push(step.url);
  return urls;
}

// Semantische Regeln jenseits des Schemas. Alle fail-closed.
function semanticErrors(plan) {
  const errors = [];
  const budget = plan.policy.budget;
  const allowlist = plan.policy.domainAllowlist;
  const files = plan.policy.files || {};
  const visionAllowed = plan.policy.visionAllowed === true;
  const seenIds = new Set();

  if (plan.steps.length > budget.maxActions) {
    errors.push(`steps: ${plan.steps.length} Schritte ueberschreiten budget.maxActions=${budget.maxActions}`);
  }
  plan.steps.forEach((step, index) => {
    const at = `steps[${index}] (${step.id}/${step.action})`;
    if (seenIds.has(step.id)) errors.push(`${at}: doppelte Schritt-ID`);
    seenIds.add(step.id);

    if (step.retries !== undefined && step.retries > budget.maxLocalRetries) {
      errors.push(`${at}: retries=${step.retries} > budget.maxLocalRetries=${budget.maxLocalRetries}`);
    }
    if (hasCoordinates(step) && !visionAllowed) {
      errors.push(`${at}: Koordinaten-Klick verlangt policy.visionAllowed=true (Stufe 3, separat freizugeben)`);
    }
    if ((step.action === "download" || step.action === "watchDownloads") && files.downloadAllowed !== true) {
      errors.push(`${at}: Download verlangt policy.files.downloadAllowed=true`);
    }
    if (step.action === "uploadFile" && files.uploadAllowed !== true) {
      errors.push(`${at}: Upload verlangt policy.files.uploadAllowed=true`);
    }
    if (step.action === "openLink" && step.newTab === true && !step.tabId) {
      errors.push(`${at}: newTab=true verlangt tabId`);
    }
    if (step.action === "waitFor") {
      const needsTarget = step.condition === "selectorVisible" || step.condition === "selectorHidden";
      if (needsTarget && !step.target) errors.push(`${at}: condition=${step.condition} verlangt target`);
      if (step.condition === "urlMatches" && !step.urlPattern) errors.push(`${at}: condition=urlMatches verlangt urlPattern`);
      if (step.condition === "delay" && !step.ms) errors.push(`${at}: condition=delay verlangt ms`);
    }
    if (step.action === "assert") {
      const needsTarget = ["selectorExists", "selectorTextContains", "selectorTextEquals"].includes(step.condition);
      if (needsTarget && !step.target) errors.push(`${at}: condition=${step.condition} verlangt target`);
      if (["selectorTextContains", "selectorTextEquals"].includes(step.condition) && step.text === undefined) {
        errors.push(`${at}: condition=${step.condition} verlangt text`);
      }
      if (step.condition === "urlMatches" && !step.urlPattern) errors.push(`${at}: condition=urlMatches verlangt urlPattern`);
      if (step.condition === "downloadExists" && !step.fileName) errors.push(`${at}: condition=downloadExists verlangt fileName`);
    }
    if (step.action === "scroll" && !step.to && !(step.direction && step.amountPx)) {
      errors.push(`${at}: scroll verlangt entweder to oder direction+amountPx`);
    }
    if (step.action === "cookies" && step.op === "set" && !Array.isArray(step.cookies)) {
      errors.push(`${at}: op=set verlangt cookies[]`);
    }
    for (const url of staticUrlsOfStep(step)) {
      const check = checkUrlAllowed(url, allowlist);
      if (!check.ok) errors.push(`${at}: ${check.error}`);
    }
  });
  return errors;
}

// Oeffentliche Schnittstelle. Input: geparster Plan (Objekt).
// Output: { ok, errors } — Engine startet nur bei ok:true.
export function validatePlan(plan) {
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, errors: ["Plan ist kein Objekt."] };
  }
  const schemaResult = schemaValidator()(plan);
  if (!schemaResult.ok) {
    return { ok: false, errors: schemaResult.errors.slice(0, 50) };
  }
  const errors = semanticErrors(plan);
  return { ok: errors.length === 0, errors };
}

// Hilfsfunktion fuer Tests und Makro-Pruefung: Plan aus JSON-Text parsen und
// validieren, ohne Ausnahmen nach aussen (fail-closed als Ergebnisobjekt).
export function validatePlanText(text) {
  try {
    return validatePlan(JSON.parse(String(text)));
  } catch (error) {
    return { ok: false, errors: [`Kein gueltiges JSON: ${error.message}`] };
  }
}
