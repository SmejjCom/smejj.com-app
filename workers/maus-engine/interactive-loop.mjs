// smejj.com Maus-Engine — interaktiver Loop-Modus (Observe-Decide-Act).
// Single Responsibility: den budgetierten Loop fahren:
//   beobachten (observer.mjs) -> entscheiden (injizierter plannerClient,
//   modellneutral, JSON-Vertrag maus-step-decision.schema.json) ->
//   handeln (injiziertes runAction, deterministische Engine) -> pruefen.
// NICHT Standard: nur bei task.mode === "interaktiv" oder nach
// gescheitertem Plan-Modus (Verdrahtung in planner-roundtrip.mjs).
// Alles fail-closed: hartes Budget maxLoopSteps, Einzelschritt-Validierung
// gegen das bestehende Plan-Schema, Allowlist bei JEDEM Schritt.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createValidator } from "./schema-validator.mjs";
import { validatePlan } from "./plan-validator.mjs";
import { checkUrlAllowed } from "./allowlist.mjs";
import { normalizePlannerOutput } from "./plan-normalizer.mjs";
import { buildStepPrompt, PROMPT_TEMPLATE_VERSION } from "./prompt-template.mjs";
import { buildObservation } from "./observer.mjs";

export const LOOP_DEFAULT_MAX_STEPS = 8;
export const LOOP_HARD_MAX_STEPS = 25;
export const LOOP_FORBIDDEN_ACTIONS = Object.freeze(["openBrowser", "closeBrowser", "runMacro"]);

const DECISION_SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas", "maus-step-decision.schema.json");

let cachedDecisionValidator = null;
function decisionValidator() {
  if (!cachedDecisionValidator) {
    cachedDecisionValidator = createValidator(JSON.parse(readFileSync(DECISION_SCHEMA_PATH, "utf8")));
  }
  return cachedDecisionValidator;
}

// Synthetischer Ein-Schritt-Plan: der Loop-Schritt wird gegen das VOLLE
// bestehende Plan-Schema inkl. Semantik (Allowlist, files, vision, budget)
// validiert — exakt dieselben Regeln wie im Plan-Modus, fail-closed.
function syntheticPlanFor(step, policyInput) {
  return {
    schemaVersion: 1,
    planId: "loop-schritt",
    createdAt: new Date(0).toISOString(),
    capsuleRef: policyInput.capsuleRef,
    planner: { modelId: "loop", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: {
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      ...(policyInput.files ? { files: policyInput.files } : {}),
      ...(policyInput.visionAllowed === true ? { visionAllowed: true } : {})
    },
    steps: [step]
  };
}

// Rohe Modellantwort -> validierte Entscheidung. Rueckgabe fail-closed:
// { ok:true, decision } oder { ok:false, errors, allowlistViolation? }.
// allowlistViolation loest im Loop den SOFORTIGEN Abbruch aus (kein
// weiterer Modell-Aufruf, kein Browser-Aufruf).
export function validateLoopDecision(rawAnswer, policyInput) {
  const normalized = normalizePlannerOutput(rawAnswer);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };
  const decision = normalized.plan;
  const envelope = decisionValidator()(decision);
  if (!envelope.ok) return { ok: false, errors: envelope.errors.slice(0, 10) };
  if (decision.decision !== "act") return { ok: true, decision };

  const step = decision.step;
  if (LOOP_FORBIDDEN_ACTIONS.includes(step?.action)) {
    return { ok: false, errors: [`aktion_im_loop_verboten: ${step.action}`] };
  }
  // Allowlist-Pruefung VOR der Schema-Validierung sichtbar machen:
  // navigate/httpRequest ausserhalb der Allowlist ist ein harter Abbruch.
  if (typeof step?.url === "string") {
    const check = checkUrlAllowed(step.url, policyInput.domainAllowlist);
    if (!check.ok) return { ok: false, allowlistViolation: true, errors: [check.error] };
  }
  const validation = validatePlan(syntheticPlanFor(step, policyInput));
  if (!validation.ok) {
    const allowlistViolation = validation.errors.some((error) => /Allowlist|Blockierter Host/i.test(error));
    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10) };
  }
  return { ok: true, decision };
}

function taskText(task) {
  return typeof task === "object" && task !== null ? String(task.text ?? "") : String(task ?? "");
}

// Kernschleife. Alle Seiteneffekte sind injiziert (modellneutral, testbar
// ohne Browser): plannerClient(prompt) -> Antworttext; runAction(step, i)
// fuehrt einen validierten Schritt deterministisch aus (Produktion:
// Interpreter ctx.runMacroSteps + enforcePageAllowed, siehe loop-runner.mjs).
export async function observeDecideAct({ task, policyInput, page, plannerClient, runAction, observer = buildObservation, onDecision = null, clock = Date }) {
  if (typeof plannerClient !== "function" || typeof runAction !== "function") {
    throw new Error("loop_parameter_fehlen");
  }
  const requested = policyInput?.budget?.maxLoopSteps ?? LOOP_DEFAULT_MAX_STEPS;
  const maxLoopSteps = Math.min(Number(requested), LOOP_HARD_MAX_STEPS);
  if (!Number.isFinite(maxLoopSteps) || maxLoopSteps < 1) {
    return { ok: false, mode: "interaktiv", error: "loop_budget_ungueltig", loopSteps: 0, modelCalls: 0, decisions: [], recordedSteps: [] };
  }

  // ZEITGRENZE — bis 2026-08-17 hatte der Loop KEINE.
  //
  // Er zaehlte ausschliesslich Schritte. `maxDurationMs` wurde im Plan
  // mitgefuehrt, geklemmt und dokumentiert — und hier schlicht ignoriert. Der
  // Plan-Modus hat seine Frist (interpreter.run), der freie Modus hatte keine.
  //
  // Aufgefallen ist es beim Gegenteil eines Fehlers: Die Schrittzahl wurde von
  // 16 auf 10 gesenkt, damit ein Lauf in die ~300 s passt, die die Plattform
  // eine Verbindung offen haelt. Es aenderte NICHTS — der Lauf lief weiter bis
  // zur gekappten Verbindung und endete mit `worker_fehler: fetch failed`,
  // ohne Ergebnis und ohne Protokoll. Eine Frist, die niemand liest, ist keine.
  //
  // Jetzt endet der Lauf von selbst und liefert, wie weit er kam. Das ist der
  // Unterschied zwischen "abgebrochen, wir wissen nichts" und "hier ist der
  // Stand nach acht Schritten".
  const maxDurationMs = Number(policyInput?.budget?.maxDurationMs);
  const deadline = Number.isFinite(maxDurationMs) && maxDurationMs > 0
    ? clock.now() + maxDurationMs
    : Infinity;

  const decisions = [];
  const history = [];
  const recordedSteps = [];
  let modelCalls = 0;
  let zeitAbgelaufen = false;

  for (let iteration = 1; iteration <= maxLoopSteps; iteration += 1) {
    // VOR der Modellfrage pruefen: sie ist der teure Teil, und ein Schritt,
    // der ohnehin nicht mehr ausgefuehrt wird, muss nicht bezahlt werden.
    if (clock.now() >= deadline) { zeitAbgelaufen = true; break; }
    const observation = await observer(page);
    const prompt = buildStepPrompt({
      task: taskText(task),
      capsuleRef: policyInput.capsuleRef,
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      files: policyInput.files,
      visionAllowed: policyInput.visionAllowed,
      observation,
      history,
      remainingSteps: maxLoopSteps - iteration + 1
    });
    modelCalls += 1;
    const rawAnswer = await plannerClient(prompt);
    const verdict = validateLoopDecision(rawAnswer, policyInput);

    if (!verdict.ok) {
      const entry = { iteration, phase: "validate", ok: false, errors: verdict.errors };
      decisions.push(entry);
      history.push({ schritt: iteration, abgelehnt: true, fehler: verdict.errors.slice(0, 3) });
      if (onDecision) await onDecision(entry, observation);
      if (verdict.allowlistViolation === true) {
        // Sofortiger Abbruch: Allowlist-Verstoss ist nie verhandelbar.
        return { ok: false, mode: "interaktiv", aborted: true, abortReason: `allowlist_verstoss: ${verdict.errors[0]}`, loopSteps: iteration, modelCalls, decisions, recordedSteps };
      }
      continue; // abgelehnter Schritt erreicht NIE den Browser; Budget zaehlt weiter
    }

    const decision = verdict.decision;
    const entry = { iteration, phase: "decide", decision: decision.decision, reason: decision.reason, step: decision.step ?? null, ok: true };
    if (onDecision) await onDecision(entry, observation);

    if (decision.decision === "done") {
      decisions.push(entry);
      return { ok: true, mode: "interaktiv", done: true, result: decision.result ?? null, reason: decision.reason, loopSteps: iteration, modelCalls, decisions, recordedSteps };
    }
    if (decision.decision === "fail") {
      decisions.push(entry);
      return { ok: false, mode: "interaktiv", error: "modell_meldet_nicht_loesbar", reason: decision.reason, loopSteps: iteration, modelCalls, decisions, recordedSteps };
    }

    try {
      const value = await runAction(decision.step, iteration);
      entry.actionOk = true;
      recordedSteps.push({ ...decision.step, id: `l${recordedSteps.length + 1}` });
      history.push({ schritt: iteration, action: decision.step.action, ok: true, ergebnis: value ?? null });
    } catch (error) {
      entry.actionOk = false;
      entry.actionError = String(error?.message || error).slice(0, 300);
      history.push({ schritt: iteration, action: decision.step.action, ok: false, fehler: entry.actionError });
      if (/allowlist|Blockierter Host|budget_/i.test(entry.actionError)) {
        decisions.push(entry);
        return { ok: false, mode: "interaktiv", aborted: true, abortReason: entry.actionError, loopSteps: iteration, modelCalls, decisions, recordedSteps };
      }
    }
    decisions.push(entry);
  }

  // Budget erschoepft: fail-closed, keine weiteren Modell-Aufrufe.
  // Zwei verschiedene Enden, zwei verschiedene Worte: `loop_zeit_erschoepft`
  // heisst "die Frist war um, weitere Schritte waeren gegangen" —
  // `loop_budget_erschoepft` heisst "alle Schritte verbraucht". Wer beides
  // gleich nennt, dreht beim Diagnostizieren wieder an der falschen Zahl.
  if (zeitAbgelaufen) {
    return { ok: false, mode: "interaktiv", error: "loop_zeit_erschoepft", loopSteps: decisions.length, modelCalls, decisions, recordedSteps };
  }
  return { ok: false, mode: "interaktiv", error: "loop_budget_erschoepft", loopSteps: maxLoopSteps, modelCalls, decisions, recordedSteps };
}
