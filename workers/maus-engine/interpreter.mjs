// smejj.com Maus-Engine — Aktions-Interpreter (Kern, kein Modell).
// Single Responsibility: einen bereits validierten Aktionsplan
// deterministisch ausfuehren. Budget, Timeouts, Allowlist und Maskierung
// werden hier fail-closed erzwungen. Identische Plaene verhalten sich
// identisch — egal welches Modell sie erzeugt hat (das planner-Feld wird
// nie fuer Entscheidungen gelesen).
import { readFile } from "node:fs/promises";
import { validatePlan } from "./plan-validator.mjs";
import { checkUrlAllowed } from "./allowlist.mjs";
import { resolveLocator, candidateForAttempt } from "./selector.mjs";
import { withRetries, withTimeout } from "./retry.mjs";
import { createSecretVault } from "./secret-vault.mjs";
import { navActions } from "./actions/nav-actions.mjs";
import { mouseActions } from "./actions/mouse-actions.mjs";
import { inputActions } from "./actions/input-actions.mjs";
import { fileActions } from "./actions/file-actions.mjs";
import { dataActions } from "./actions/data-actions.mjs";
import { sessionActions } from "./actions/session-actions.mjs";
import { controlActions } from "./actions/control-actions.mjs";

const ACTION_REGISTRY = Object.freeze({
  ...navActions, ...mouseActions, ...inputActions,
  ...fileActions, ...dataActions, ...sessionActions, ...controlActions
});

function defaultCapsuleFiles() {
  return {
    async materialize(capsulePath) {
      throw new Error(`capsule_datei_nicht_verfuegbar: ${capsulePath}`);
    }
  };
}

function defaultSessionStore() {
  const memory = new Map();
  return {
    async save(name, state) { memory.set(name, state); },
    async load(name) { return memory.get(name) ?? null; }
  };
}

// Loggt Schritt-Parameter ohne sensible Werte: secretRef bleibt Referenz,
// aufgeloeste Secrets werden zusaetzlich per Vault maskiert.
function logSafeParams(step, vault) {
  const clone = JSON.parse(JSON.stringify(step));
  return JSON.parse(vault.mask(JSON.stringify(clone)));
}

export function createInterpreter(plan, options = {}) {
  const validation = validatePlan(plan);
  if (!validation.ok) {
    throw new Error(`plan_ungueltig: ${validation.errors.slice(0, 5).join(" | ")}`);
  }
  const {
    browserFactory,
    fetchImpl = globalThis.fetch,
    vault = createSecretVault(options.vaultOptions || {}),
    sessionStore = defaultSessionStore(),
    capsuleFiles = defaultCapsuleFiles(),
    macroStore = null,
    clock = Date,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retryDelayMs = 500,
    // Stufe B (2026-07-15, freigegeben): optionaler Beobachter fuer die
    // Live-Ansicht. Rein additiv, Default no-op — ohne ihn verhaelt sich der
    // Interpreter byte-identisch wie zuvor. Der Aufruf ist fail-safe gekapselt
    // (siehe notifyStep): ein Fehler in der Anzeige darf den Lauf nie stoeren.
    onStep = null,
    // Sitzungs-Modus (additiv 2026-07-31): sessionState ist der lebende
    // Zustand einer Sitzung aus session-registry.mjs. Mit keepAlive bleibt der
    // Browser am Ende des Laufs OFFEN — der Folgeauftrag findet die Seite so
    // vor, wie der vorige sie verlassen hat. Ohne beides verhaelt sich der
    // Interpreter exakt wie zuvor (Non-Regression).
    sessionState = null,
    keepAlive = false
  } = options;

  const budget = plan.policy.budget;
  const state = sessionState || {
    browser: null, context: null, pages: new Map(),
    activeTabId: null, downloads: [], extracted: {},
    executedActions: 0
  };
  // Budget gilt je Auftrag, nicht je Sitzung: sonst waere der zweite Auftrag
  // einer langen Sitzung schon beim Start "verbraucht".
  state.executedActions = 0;
  const artifacts = [];
  const actionLog = [];

  const ctx = {
    plan,
    policy: plan.policy,
    state,
    // nav-actions liest das: bei laufender Sitzung wird ein bereits offener
    // Browser wiederverwendet statt als Fehler gemeldet.
    keepAlive,
    vault,
    fetchImpl,
    sessionStore,
    capsuleFiles,
    sleep,
    browserFactory: browserFactory || (() => { throw new Error("browser_factory_fehlt"); }),
    readLocalFile: (path) => readFile(path),
    activePage() {
      const page = state.pages.get(state.activeTabId);
      if (!page) throw new Error("keine_aktive_seite (openBrowser fehlt?)");
      return page;
    },
    timeoutFor(step) {
      return step.timeoutMs ?? budget.defaultActionTimeoutMs;
    },
    locate(page, selectorDef, attempt = 0) {
      return resolveLocator(page, candidateForAttempt(selectorDef, attempt));
    },
    ensureUrlAllowed(url) {
      const check = checkUrlAllowed(url, plan.policy.domainAllowlist);
      if (!check.ok) throw new AllowlistError(check.error);
    },
    async enforcePageAllowed(page) {
      const url = typeof page.url === "function" ? page.url() : "";
      if (!url || url === "about:blank") return;
      const check = checkUrlAllowed(url, plan.policy.domainAllowlist);
      if (!check.ok) throw new AllowlistError(check.error);
    },
    addArtifact(name, data, contentType) {
      artifacts.push({ name, data, contentType });
    },
    macroStore,
    inMacro: false,
    // Makro-Schritte laufen durch denselben Interpreter: gleiche Allowlist,
    // gleiches Budget, gleiche Maskierung. Verschachtelung ist verboten und
    // die expandierten Schritte werden als synthetischer Plan fail-closed
    // gegen das Schema + Semantik des AKTIVEN Tasks validiert.
    async runMacroSteps(steps, macroRef) {
      if (ctx.inMacro) throw new Error("macro_verschachtelung_verboten");
      if (!Array.isArray(steps) || steps.length === 0) throw new Error("macro_leer");
      if (steps.some((step) => step.action === "runMacro")) {
        throw new Error("macro_darf_kein_runMacro_enthalten");
      }
      const synthetic = { ...plan, steps };
      const check = validatePlan(synthetic);
      if (!check.ok) throw new Error(`macro_ungueltig: ${check.errors.slice(0, 3).join(" | ")}`);
      ctx.inMacro = true;
      try {
        for (let i = 0; i < steps.length; i += 1) {
          await executeStep(steps[i], i, { macro: macroRef });
        }
      } finally {
        ctx.inMacro = false;
      }
      return { macro: macroRef, steps: steps.length };
    }
  };

  async function executeStep(step, index, meta = {}) {
    const handler = ACTION_REGISTRY[step.action];
    if (!handler) throw new Error(`aktion_unbekannt: ${step.action}`);
    state.executedActions += 1;
    if (state.executedActions > budget.maxActions) {
      throw new BudgetError(`budget_aktionen_ueberschritten: ${budget.maxActions} (inkl. Makro-Schritte)`);
    }
    // Ein Makro-Aufruf wird nie als Ganzes wiederholt (Seiteneffekte!);
    // seine Einzelschritte haben eigene lokale Retries.
    const retries = step.action === "runMacro"
      ? 0
      : Math.min(step.retries ?? budget.maxLocalRetries, budget.maxLocalRetries);
    const timeout = ctx.timeoutFor(step);
    const startedAt = clock.now();
    const result = await withRetries(
      (attempt) => withTimeout(handler(ctx, step, { attempt }), timeout + 250, step.action),
      { retries, delayMs: retryDelayMs, delayFn: options.retryDelayFn }
    );
    const entry = {
      index,
      id: step.id,
      ...meta,
      action: step.action,
      params: logSafeParams(step, vault),
      ok: result.ok,
      attempts: result.attempts,
      durationMs: clock.now() - startedAt
    };
    if (result.ok) entry.result = JSON.parse(vault.mask(JSON.stringify(result.value ?? {})));
    else entry.error = vault.mask(result.error?.message || "unbekannt");
    actionLog.push(entry);
    await notifyStep(entry, index);
    if (!result.ok) {
      const error = result.error || new Error("schritt_fehlgeschlagen");
      error.stepId = step.id;
      throw error;
    }
    return result.value;
  }

  // Fail-safe Kapselung des Live-Beobachters: Fehler und Ausnahmen werden
  // bewusst verschluckt. Die Anzeige ist Beiwerk — der Lauf bleibt die Wahrheit.
  async function notifyStep(entry, index) {
    if (typeof onStep !== "function") return;
    try {
      await onStep({ entry, index, total: plan.steps.length, artifacts });
    } catch {
      // absichtlich still: Anzeige darf den Lauf nie beeinflussen
    }
  }

  async function run() {
    const deadline = clock.now() + budget.maxDurationMs;
    let failedStep = null;
    let aborted = false;
    let abortReason = null;

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      if (clock.now() > deadline) {
        aborted = true;
        abortReason = `budget_laufzeit_ueberschritten: ${budget.maxDurationMs}ms`;
        break;
      }
      try {
        await executeStep(step, index);
        await ctx.enforcePageAllowed(safeActivePage());
      } catch (error) {
        if (error instanceof AllowlistError || error instanceof BudgetError) {
          aborted = true;
          abortReason = error.message;
          const abortEntry = { index, id: step.id, action: step.action, ok: false, error: abortReason, abort: true };
          actionLog.push(abortEntry);
          await notifyStep(abortEntry, index);
          break;
        }
        failedStep = step.id;
        if ((step.onFailure || "abort") === "abort") {
          aborted = true;
          abortReason = vault.mask(error.message);
          break;
        }
      }
    }

    // Fehlerkontext fuer budgetierte Planner-Roundtrips: Screenshot + DOM-
    // Auszug (maskiert) als Beweis und Beobachtungsmaterial — Seiteninhalt
    // bleibt untrusted und wird nur als Daten weitergegeben.
    let failureContext = null;
    if (aborted || failedStep !== null) {
      failureContext = {};
      const page = state.pages.get(state.activeTabId);
      if (page) {
        try {
          if (typeof page.screenshot === "function") {
            const buffer = await page.screenshot({ fullPage: false });
            artifacts.push({ name: "fehler/screenshot.png", data: buffer, contentType: "image/png" });
            failureContext.screenshotArtifact = "fehler/screenshot.png";
          }
        } catch { /* Beweis optional, Lauf ist ohnehin fehlgeschlagen */ }
        try {
          if (typeof page.content === "function") {
            const html = vault.mask(await page.content());
            artifacts.push({ name: "fehler/dom-snapshot.html", data: Buffer.from(html), contentType: "text/html" });
            failureContext.domExcerpt = html.slice(0, 4000);
          }
        } catch { /* Beweis optional */ }
      }
    }

    // Sitzungs-Modus: der Browser bleibt bewusst offen. Genau das laesst die
    // Seite stehen; die Registry baut die Sitzung nach Leerlauf oder Hartlimit
    // ab (session-registry.mjs), damit trotzdem nichts ewig laeuft.
    if (state.browser && !keepAlive) {
      try { await state.browser.close(); } catch { /* Worker beendet sich ohnehin */ }
      state.browser = null;
    }
    const ok = !aborted && failedStep === null;
    return {
      failureContext,
      ok,
      planId: plan.planId,
      capsuleRef: plan.capsuleRef,
      aborted,
      abortReason,
      failedStep,
      sitzungOffen: Boolean(keepAlive && state.browser),
      actionLog,
      extracted: state.extracted,
      artifacts,
      downloads: state.downloads.map((d) => d.suggestedFilename)
    };
  }

  function safeActivePage() {
    const page = state.pages.get(state.activeTabId);
    return page || { url: () => "about:blank" };
  }

  return { run, ctx };
}

export class AllowlistError extends Error {}
export class BudgetError extends Error {}
