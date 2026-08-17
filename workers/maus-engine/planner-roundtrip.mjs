// smejj.com Maus-Engine — budgetierter Planner-Roundtrip (modellneutral).
// Single Responsibility: Aufgabe -> Plan -> Ausfuehrung; bei Fehlschlag
// maximal budget.maxPlannerRoundtrips Rueckfragen an den Planer. Der
// plannerClient wird vom AI Router injiziert (prompt -> Antworttext);
// dieses Modul kennt kein Modell. Lokale Retries passieren VORHER in der
// Engine — hier zaehlt nur der teure Modell-Aufruf (Kostenregel: kein
// Modell-Aufruf pro Klick, nur ein Plan pro Aufgabe plus Budget).
//
// Additiv (2026-07-15, schriftlich freigegeben): Stufenreihenfolge
//   Stufe 0 Makro-Treffer (0 Modell-Aufrufe, nur mit injiziertem macroStore)
//   Stufe 1 Plan-Modus (BESTEHEND, Standard, unveraendert)
//   Stufe 2 Loop-Modus (nur mit injiziertem runLoop UND (task.mode ===
//           "interaktiv" ODER Plan-Modus gescheitert)) — hart budgetiert.
// Ohne macroStore/runLoop und ohne task.mode verhaelt sich dieses Modul
// exakt wie zuvor (Non-Regression-Pflicht).
import { buildPlannerPrompt, buildRetryPrompt, PROMPT_TEMPLATE_VERSION } from "./prompt-template.mjs";
import { normalizePlannerOutput } from "./plan-normalizer.mjs";
import { validatePlan } from "./plan-validator.mjs";
import { ungepruefteSchritte } from "./schritt-pruefer.mjs";
import { deriveMacroName } from "./macro-store.mjs";

function taskTextOf(task) {
  return typeof task === "object" && task !== null ? String(task.text ?? "") : String(task ?? "");
}

function taskModeOf(task) {
  return typeof task === "object" && task !== null ? String(task.mode ?? "") : "";
}

// Stufe 0: gespeichertes Makro als synthetischen Plan abspielen.
// Fail-closed: nur wenn der synthetische Plan gegen Schema + Semantik des
// AKTIVEN Tasks validiert. Fehlschlag => normaler Weg (Stufe 1/2).
async function tryMacroStage({ task, policyInput, macroStore, runPlan, meldePlan = null }) {
  const name = deriveMacroName(task);
  let macro = null;
  try {
    macro = await macroStore.load(name);
  } catch {
    return null;
  }
  if (!macro || !Array.isArray(macro.steps) || macro.steps.length === 0) return null;
  const plan = {
    schemaVersion: 1,
    planId: `makro-${name}`.slice(0, 128),
    createdAt: new Date().toISOString(),
    capsuleRef: policyInput.capsuleRef,
    planner: { modelId: "makro", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: {
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      ...(policyInput.files ? { files: policyInput.files } : {}),
      ...(policyInput.visionAllowed === true ? { visionAllowed: true } : {})
    },
    steps: macro.steps
  };
  const validation = validatePlan(plan);
  if (!validation.ok) return null;
  if (meldePlan) await meldePlan(plan, "makro");
  const result = await runPlan(plan);
  if (!result.ok) return null; // Makro veraltet? -> normal weiterplanen
  return { ok: true, mode: "makro", macroName: name, plan, result, plannerCalls: 0, modelCalls: 0, loopSteps: 0, history: [{ phase: "makro", ok: true, macroName: name }] };
}

// Erfolgreichen Loop-Lauf als Makro speichern (Makro-Recorder, Phase 4):
// ausgefuehrte Schritte mit openBrowser/closeBrowser rahmen, damit das
// Makro kuenftig als eigenstaendiger deterministischer Lauf spielbar ist.
async function recordLoopMacro({ task, policyInput, macroStore, loopResult }) {
  const steps = Array.isArray(loopResult.recordedSteps) ? loopResult.recordedSteps : [];
  if (steps.length === 0) return null;
  const name = deriveMacroName(task);
  const framed = [
    { id: "l-open", action: "openBrowser" },
    ...steps,
    { id: "l-close", action: "closeBrowser" }
  ];
  try {
    const saved = await macroStore.save(name, {
      planId: `loop-aufzeichnung-${name}`.slice(0, 128),
      capsuleRef: policyInput.capsuleRef,
      steps: framed
    });
    return { name, ...saved };
  } catch {
    return null; // Recorder ist Beiwerk: Speichern darf den Erfolg nie kippen
  }
}

// Trennt "die Maus hat es versucht und es ging schief" von "die Maus kam nie
// zum Zug". Bewusst KEINE Heuristik: der Dispatcher markiert Infrastruktur-
// Abbrueche (toter Worker, HTTP-Fehler, Zeitueberschreitung) selbst mit
// `infra: true`. Ein abgelehnter Plan traegt die Markierung nicht — das ist
// ein Planungsfehler und gehoert weiter unter "Budget erschoepft".
// Raten waere hier gefaehrlich: eine Regel, die "abgebrochen" mit "kaputte
// Infrastruktur" verwechselt, erzeugt Fehlalarm genau bei den Faellen, in
// denen der Planer korrekt fail-closed abgelehnt hat.
export function infrastrukturFehler(lastFailure) {
  if (lastFailure?.infra !== true) return null;
  const grund = lastFailure.error ?? lastFailure.abortReason;
  return grund ? String(grund) : null;
}

// task: Aufgabentext ODER { text, mode }; policyInput: { capsuleRef,
// domainAllowlist, budget, files?, visionAllowed? }; plannerClient:
// async (prompt) => Antworttext; runPlan: async (plan) => Engine-Ergebnis;
// optional (additiv): runLoop: async ({ task, policyInput }) => Loop-
// Ergebnis (interactive-loop.observeDecideAct-Vertrag); macroStore:
// createMacroStore(...) fuer Stufe 0 und den Makro-Recorder.
/**
 * @param {object} p
 * @param {Function} [p.onPlan] Additiv (2026-07-31): wird aufgerufen, sobald ein
 *   Plan gueltig ist — VOR der Ausfuehrung. Damit kennt der Aufrufer die planId
 *   bereits waehrend des Laufs und die Wiedergabe kann live mitlaufen, statt
 *   bis zum Ende zu warten. Fail-safe gekapselt: ein Fehler hier darf den Lauf
 *   niemals stoeren (dieselbe Regel wie beim Live-Publisher).
 */
export async function planAndExecute({ task, policyInput, plannerClient, runPlan, runLoop = null, macroStore = null, onPlan = null }) {
  if (typeof plannerClient !== "function" || typeof runPlan !== "function") {
    throw new Error("planner_roundtrip_parameter_fehlen");
  }
  const meldePlan = async (plan, modus) => {
    if (typeof onPlan !== "function") return;
    try {
      await onPlan({ planId: plan.planId, capsuleRef: plan.capsuleRef, modus });
    } catch {
      // absichtlich still: die Anzeige darf den Lauf nie beeinflussen
    }
  };

  // Stufe 0: Makro-Treffer -> 0 Modell-Aufrufe.
  if (macroStore) {
    const macroOutcome = await tryMacroStage({ task, policyInput, macroStore, runPlan, meldePlan });
    if (macroOutcome) return macroOutcome;
  }

  // Stufe 2 direkt, wenn ausdruecklich interaktiv angefordert.
  const interactive = taskModeOf(task) === "interaktiv";
  if (interactive && typeof runLoop === "function") {
    const loopResult = await runLoop({ task, policyInput });
    const macroSaved = loopResult.ok && macroStore ? await recordLoopMacro({ task, policyInput, macroStore, loopResult }) : null;
    return {
      ok: loopResult.ok === true,
      mode: "interaktiv",
      plannerCalls: 0,
      modelCalls: loopResult.modelCalls ?? 0,
      loopSteps: loopResult.loopSteps ?? 0,
      result: loopResult,
      ...(macroSaved ? { macroSaved } : {}),
      ...(loopResult.ok === true ? {} : { error: loopResult.error ?? loopResult.abortReason ?? "loop_fehlgeschlagen" }),
      history: [{ phase: "loop", ok: loopResult.ok === true }]
    };
  }

  const taskText = taskTextOf(task);
  const maxRoundtrips = policyInput?.budget?.maxPlannerRoundtrips ?? 0;
  const history = [];
  let prompt = buildPlannerPrompt({ task: taskText, ...policyInput });
  let previousPlan = null;
  let lastFailure = null;

  // Aufruf 0 = Erstplan; danach bis zu maxRoundtrips Korrekturen.
  for (let call = 0; call <= maxRoundtrips; call += 1) {
    const rawAnswer = await plannerClient(prompt);
    const normalized = normalizePlannerOutput(rawAnswer);
    if (!normalized.ok) {
      lastFailure = { errors: [normalized.error] };
      history.push({ call, phase: "normalize", ok: false, error: normalized.error });
    } else {
      const plan = normalized.plan;
      const validation = validatePlan(plan);
      // SCHRITT-PRUEFER (2026-08-17): veraendernde Schritte ohne Nachweis.
      //
      // Warum erst ab dem ZWEITEN Versuch scharf: Beim Erstplan waere eine
      // Ablehnung riskant. Sie kostete einen Modellaufruf aus demselben
      // knappen Budget, mit dem der Lauf spaeter echte Fehler korrigieren
      // muss — ein Plan, der einwandfrei durchgelaufen waere, koennte daran
      // scheitern. Beim Korrekturplan ist die Lage umgekehrt: dort ist bereits
      // etwas schiefgegangen, und ein Plan, der wieder nicht nachweist, ob
      // seine Schritte wirken, wiederholt genau den Fehler, der hierher
      // gefuehrt hat. Der Hinweis geht in JEDEM Fall in den Prompt — scharf
      // ist nur die Ablehnung.
      const offeneNachweise = validation.ok ? ungepruefteSchritte(plan) : [];
      const nachweisFehlt = call > 0 && offeneNachweise.length > 0;
      if (!validation.ok || nachweisFehlt) {
        lastFailure = {
          errors: validation.ok
            ? [`Nachweis fehlt fuer: ${offeneNachweise.map((s) => `${s.id} (${s.action})`).join(", ")}`]
            : validation.errors.slice(0, 10),
          ungepruefteSchritte: offeneNachweise
        };
        history.push({
          call,
          phase: "validate",
          ok: false,
          errors: lastFailure.errors,
          ...(nachweisFehlt ? { ungeprueft: offeneNachweise.length } : {})
        });
        previousPlan = plan;
      } else {
        history.push({ call, phase: "validate", ok: true, planId: plan.planId });
        // planId JETZT melden, nicht erst am Ende: nur so kann die Wiedergabe
        // waehrend des Laufs zuschauen (sie braucht capsuleRef + planId fuer
        // den Live-Pfad in der Capsule).
        await meldePlan(plan, "plan");
        const result = await runPlan(plan);
        if (result.ok) {
          return { ok: true, plan, result, plannerCalls: call + 1, history, mode: "plan", modelCalls: call + 1, loopSteps: 0 };
        }
        lastFailure = {
          failedStep: result.failedStep,
          aborted: result.aborted,
          abortReason: result.abortReason,
          infra: result.infra === true,
          error: result.error ?? null,
          actionLog: result.actionLog,
          // Bedienbaum statt Roh-HTML (2026-08-17). domExcerpt bleibt in der
          // Form erhalten, damit aeltere Aufrufer und Attrappen nichts brechen
          // — der Interpreter fuellt es nicht mehr.
          observation: result.failureContext?.observation,
          domExcerpt: result.failureContext?.domExcerpt,
          // Auch nach einem LAUF-Fehler: fehlende Nachweise sind oft der Grund,
          // warum der Fehler ueberhaupt erst so spaet auffiel.
          ungepruefteSchritte: offeneNachweise
        };
        history.push({ call, phase: "run", ok: false, failedStep: result.failedStep ?? null, aborted: result.aborted === true });
        previousPlan = plan;
      }
    }
    if (call === maxRoundtrips) break;
    prompt = buildRetryPrompt({
      previousPlan: previousPlan ?? { planId: "kein-plan", hinweis: "vorherige Antwort war kein gueltiger Plan" },
      failure: lastFailure,
      roundtrip: call + 1
    });
  }

  // Stufe 2: Plan-Modus gescheitert -> budgetierter Loop (nur wenn verdrahtet).
  const plannerCalls = maxRoundtrips + 1;
  if (typeof runLoop === "function" && (policyInput?.budget?.maxLoopSteps ?? 0) > 0) {
    history.push({ phase: "loop", grund: "plan_modus_gescheitert" });
    const loopResult = await runLoop({ task, policyInput });
    const macroSaved = loopResult.ok && macroStore ? await recordLoopMacro({ task, policyInput, macroStore, loopResult }) : null;
    return {
      ok: loopResult.ok === true,
      mode: "interaktiv",
      plannerCalls,
      modelCalls: plannerCalls + (loopResult.modelCalls ?? 0),
      loopSteps: loopResult.loopSteps ?? 0,
      result: loopResult,
      ...(macroSaved ? { macroSaved } : {}),
      ...(loopResult.ok === true ? {} : { error: loopResult.error ?? loopResult.abortReason ?? "loop_fehlgeschlagen", lastFailure }),
      planPhase: { error: infrastrukturFehler(lastFailure) ?? "planner_budget_erschoepft", lastFailure },
      history
    };
  }

  // Budget erschoepft: fail-closed, keine weiteren Modell-Aufrufe.
  // ABER: ein Infrastruktur-Abbruch (z. B. 401 der Engine, toter Worker) ist
  // KEIN erschoepftes Planungsbudget. Wer dann "planner_budget_erschoepft"
  // meldet, schickt die Fehlersuche ans falsche Ende — genau das hat hier
  // mehrere Runden gekostet. Der echte Grund steht vorn, das Budget dahinter.
  return {
    ok: false,
    error: infrastrukturFehler(lastFailure) ?? "planner_budget_erschoepft",
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    plannerCalls,
    modelCalls: plannerCalls,
    mode: "plan",
    loopSteps: 0,
    lastFailure,
    history
  };
}
