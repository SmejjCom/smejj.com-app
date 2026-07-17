// smejj.com Maus-Engine — Stufe-1-Optimierer (API/HTTP direkt).
// Single Responsibility: vor jedem Browserstart pruefen, ob der Plan ganz
// ohne Browser loesbar ist, und reine HTTP-Plaene direkt ausfuehren.
// Kein Browser, keine Maus, kein Modell — Zielanteil 40–60% aller Tasks
// bei ~0 Kosten.
import { checkUrlAllowed } from "./allowlist.mjs";

const HTTP_ONLY_ACTIONS = new Set(["httpRequest", "assert"]);

// Ein Plan ist Stufe-1-faehig, wenn er ausschliesslich aus httpRequest-
// Schritten und downloadExists-Asserts besteht (keine Seite noetig).
export function isHttpOnlyPlan(plan) {
  return plan.steps.every((step) => {
    if (!HTTP_ONLY_ACTIONS.has(step.action)) return false;
    if (step.action === "assert" && step.condition !== "downloadExists") return false;
    return true;
  });
}

// Reinen HTTP-Plan ausfuehren. Gleiche Ergebnisstruktur wie der
// Interpreter, damit Artefakt-Upload und Capsule-Abschluss identisch sind.
export async function runHttpOnlyPlan(plan, { fetchImpl = globalThis.fetch, clock = Date } = {}) {
  const actionLog = [];
  const artifacts = [];
  const downloads = [];
  let aborted = false;
  let abortReason = null;
  let failedStep = null;
  const deadline = clock.now() + plan.policy.budget.maxDurationMs;

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    if (clock.now() > deadline) {
      aborted = true;
      abortReason = "budget_laufzeit_ueberschritten";
      break;
    }
    const startedAt = clock.now();
    try {
      let result;
      if (step.action === "httpRequest") {
        const check = checkUrlAllowed(step.url, plan.policy.domainAllowlist);
        if (!check.ok) {
          aborted = true;
          abortReason = check.error;
          actionLog.push({ index, id: step.id, action: step.action, ok: false, error: check.error, abort: true });
          break;
        }
        const response = await fetchImpl(step.url, {
          method: step.method,
          headers: step.headers,
          body: ["GET", "HEAD"].includes(step.method) ? undefined : step.body,
          redirect: "manual"
        });
        if (step.expectStatus !== undefined && response.status !== step.expectStatus) {
          throw new Error(`http_status_${response.status}_erwartet_${step.expectStatus}`);
        }
        let bytes = 0;
        if (step.saveAs) {
          const buffer = Buffer.from(await response.arrayBuffer());
          bytes = buffer.length;
          artifacts.push({ name: `http/${step.saveAs}`, data: buffer, contentType: "application/octet-stream" });
          downloads.push(step.saveAs);
        }
        result = { status: response.status, bytes };
      } else {
        const found = downloads.includes(step.fileName);
        if (!found) throw new Error(`assert_fehlgeschlagen: download ${step.fileName} fehlt`);
        result = { condition: step.condition };
      }
      actionLog.push({ index, id: step.id, action: step.action, ok: true, attempts: 1, durationMs: clock.now() - startedAt, result });
    } catch (error) {
      actionLog.push({ index, id: step.id, action: step.action, ok: false, attempts: 1, durationMs: clock.now() - startedAt, error: error.message });
      failedStep = step.id;
      if ((step.onFailure || "abort") === "abort") {
        aborted = true;
        abortReason = error.message;
        break;
      }
    }
  }

  return {
    ok: !aborted && failedStep === null,
    planId: plan.planId,
    capsuleRef: plan.capsuleRef,
    stage: 1,
    aborted,
    abortReason,
    failedStep,
    actionLog,
    extracted: {},
    artifacts,
    downloads
  };
}
