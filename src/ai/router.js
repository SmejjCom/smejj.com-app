import { AI_MODES, getProvider } from "./providers.js";
import { validateByokConfig } from "./byok.js";
import { detectLocalBrowserAi } from "./localBrowser.js";
import { evaluateFreeDemo } from "./freeDemoHardlimit.js";
import { disabledMode } from "./disabledMode.js";
import { containsPaidRisk, evaluateAiCost } from "./costGuard.js";
import { buildPromptContext } from "./promptContextBuilder.js";

export function createAiRouter({ navigatorRef = globalThis.navigator } = {}) {
  function resolveMode({ mode = AI_MODES.disabled, byok = {}, freeDemo = {} } = {}) {
    if (containsPaidRisk(mode)) return disabledMode("paid_mode_marker_blocked");
    const provider = getProvider(mode);
    if (!provider) return disabledMode("unknown_provider");

    if (mode === AI_MODES.localBrowser) return detectLocalBrowserAi({ navigatorRef });
    if (mode === AI_MODES.byok) return validateByokConfig(byok);
    if (mode === AI_MODES.freeDemo) return evaluateFreeDemo(freeDemo);
    if (mode === AI_MODES.laterPartnerCompute) return evaluateAiCost({ mode });
    if (provider.type === "model-vault") return disabledMode("model_vault_requires_approved_compute");
    return disabledMode("disabled_selected");
  }

  function selectModelRole({
    prompt = "",
    taskType = "",
    contextTokens = 0,
    fileCount = 0,
    critical = false
  } = {}) {
    const text = `${taskType} ${prompt}`.toLowerCase();
    const codingSignal = /\b(code|coding|bug|fix|test|repo|refactor|javascript|typescript|node|frontend|backend|api)\b/.test(text);
    const longContextSignal = contextTokens >= 180_000 || fileCount >= 20 || /\b(architektur|architecture|plan|strategie|strategy|long|grosse|große|komplex|complex)\b/.test(text);

    if (critical || longContextSignal || codingSignal) {
      return {
        providerId: AI_MODES.glm52Vault,
        role: codingSignal ? "flagship-coding-brain" : "flagship-long-context-brain",
        reason: critical
          ? "critical_or_fable_level_task"
          : codingSignal
            ? "glm_first_coding_task"
            : "large_context_or_planning_task",
        fallbackProviderId: AI_MODES.disabled
      };
    }

    return {
      providerId: AI_MODES.disabled,
      role: "free-safe-default",
      reason: "no_approved_compute_needed",
      fallbackProviderId: AI_MODES.disabled
    };
  }

  function prepareRequest({ mode, byok, freeDemo, context } = {}) {
    const resolved = resolveMode({ mode, byok, freeDemo });
    if (!resolved.ok) return resolved;
    return {
      ok: true,
      mode: resolved.mode,
      costStatus: resolved.costStatus,
      context: buildPromptContext(context),
      provider: resolved.provider
    };
  }

  return { resolveMode, prepareRequest, selectModelRole };
}

export { AI_MODES };
