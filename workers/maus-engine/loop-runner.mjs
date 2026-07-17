// smejj.com Maus-Engine — Loop-Runner (Worker-seitige Verdrahtung).
// Single Responsibility: einen interaktiven Loop-Lauf im stateless Worker
// ausfuehren: Browser oeffnen, observeDecideAct fahren, jeden Schritt ueber
// den BESTEHENDEN Interpreter ausfuehren (gleiche Allowlist, gleiches
// Aktions-Budget, gleiche Maskierung wie der Plan-Modus), Beweise sammeln
// (Screenshot pro Schritt + jede Modell-Entscheidung mit Begruendung),
// Browser schliessen. Kein Modellwissen: der plannerClient ist ein
// generischer, env-konfigurierter JSON-Endpunkt (fail-closed ohne Config).
import { createInterpreter } from "./interpreter.mjs";
import { observeDecideAct } from "./interactive-loop.mjs";
import { deriveMacroName } from "./macro-store.mjs";
import { PROMPT_TEMPLATE_VERSION } from "./prompt-template.mjs";

// Modellneutraler Planer-Zugang des Workers ueber den Control-Server.
// Bewusste Architekturentscheidung (2026-07-15): Der Worker ruft NIE ein
// Modell direkt. Er fragt den Planer-Proxy des Control Servers
// (POST /api/maus/run mit {plannerPrompt}) und authentifiziert sich mit dem
// Engine-Token, das er ohnehin besitzt. Damit
//   - bleibt der zentrale Modell-Router die einzige Stelle, die Modelle kennt
//     (Master-Prompt: alle Modelle ausschliesslich ueber den Router, BYOK),
//   - wird KEIN zweiter API-Key in den Worker dupliziert (Secret-Policy),
//   - bleibt die Engine modellneutral: sie sieht nur Prompt rein, Text raus.
// Fail-closed ohne Konfiguration. SMEJJ_MAUS_PLANNER_MODEL ist optional und
// wird nur als requestedModel durchgereicht (Router entscheidet).
export function buildEnvPlannerClient(env = process.env, fetchImpl = globalThis.fetch) {
  const url = String(env.SMEJJ_MAUS_PLANNER_URL || "").trim();
  const token = String(env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
  const model = String(env.SMEJJ_MAUS_PLANNER_MODEL || "").trim();
  if (!url || !token) {
    throw new Error("loop_planner_nicht_konfiguriert (SMEJJ_MAUS_PLANNER_URL + SMEJJ_MAUS_ENGINE_TOKEN, fail-closed)");
  }
  return async (prompt) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ plannerPrompt: prompt, ...(model ? { plannerModel: model } : {}) })
    });
    if (!response?.ok) throw new Error(`loop_planner_http_${response?.status ?? "fehler"}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("loop_planner_leere_antwort");
    return content;
  };
}

function basePlanFor(task, policyInput) {
  return {
    schemaVersion: 1,
    planId: `loop-lauf-${deriveMacroName(task)}`.slice(0, 128),
    createdAt: new Date().toISOString(),
    capsuleRef: policyInput.capsuleRef,
    planner: { modelId: "loop", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: {
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      ...(policyInput.files ? { files: policyInput.files } : {}),
      ...(policyInput.visionAllowed === true ? { visionAllowed: true } : {})
    },
    // Der Basisplan wird NIE per run() gefahren; er traegt nur Policy und
    // Validierungskontext. Ausfuehrung laeuft schrittweise ueber
    // ctx.runMacroSteps (identische Budget-/Allowlist-/Maskierungspfade).
    steps: [
      { id: "b1", action: "openBrowser" },
      { id: "b2", action: "closeBrowser" }
    ]
  };
}

// Interaktiven Loop-Lauf ausfuehren. Rueckgabe im Ergebnisformat der
// Engine (kompatibel zu artifact-uploader.uploadRunArtifacts), zusaetzlich
// mode/loopSteps/modelCalls/recordedSteps fuer den Roundtrip/Recorder.
export async function runLoopTask({ task, policyInput, plannerClient, browserFactory, observer, vaultOptions, retryDelayFn } = {}) {
  if (typeof plannerClient !== "function" || typeof browserFactory !== "function") {
    throw new Error("loop_runner_parameter_fehlen");
  }
  const plan = basePlanFor(task, policyInput);
  const interpreter = createInterpreter(plan, { browserFactory, vaultOptions, retryDelayFn });
  const ctx = interpreter.ctx;
  const artifacts = [];
  const decisionLog = [];

  await ctx.runMacroSteps([{ id: "l-open", action: "openBrowser" }], "loop-init");
  const page = ctx.activePage();

  const runAction = async (step, iteration) => {
    await ctx.runMacroSteps([step], `loop-${iteration}`);
    await ctx.enforcePageAllowed(ctx.activePage());
    try {
      if (typeof ctx.activePage().screenshot === "function") {
        const buffer = await ctx.activePage().screenshot({ fullPage: false });
        artifacts.push({ name: `loop/schritt-${iteration}.png`, data: buffer, contentType: "image/png" });
      }
    } catch { /* Beweis-Screenshot ist Beiwerk, nie Abbruchgrund */ }
  };

  let loopResult;
  try {
    loopResult = await observeDecideAct({
      task,
      policyInput,
      page,
      plannerClient,
      runAction,
      ...(observer ? { observer } : {}),
      onDecision: (entry) => { decisionLog.push(entry); }
    });
  } finally {
    try {
      await ctx.runMacroSteps([{ id: "l-close", action: "closeBrowser" }], "loop-ende");
    } catch { /* Browser-Schliessen fail-safe; Worker beendet sich ohnehin */ }
  }

  // Entscheidungsprotokoll als eigenes Artefakt (jede Modell-Entscheidung
  // mit Begruendung — reproduzierbar und replaybar).
  artifacts.push({
    name: "loop/entscheidungen.json",
    data: Buffer.from(JSON.stringify(decisionLog, null, 2)),
    contentType: "application/json"
  });

  return {
    ok: loopResult.ok === true,
    mode: "interaktiv",
    planId: plan.planId,
    capsuleRef: policyInput.capsuleRef,
    aborted: loopResult.aborted === true,
    abortReason: loopResult.abortReason ?? null,
    failedStep: null,
    error: loopResult.error ?? null,
    reason: loopResult.reason ?? null,
    result: loopResult.result ?? null,
    loopSteps: loopResult.loopSteps ?? 0,
    modelCalls: loopResult.modelCalls ?? 0,
    recordedSteps: loopResult.recordedSteps ?? [],
    actionLog: decisionLog,
    extracted: {},
    artifacts,
    downloads: []
  };
}
