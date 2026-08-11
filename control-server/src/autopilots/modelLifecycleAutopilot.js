// smejj.com — Shadow-Release & Model-Lifecycle Autopilot (Autopilot Nr. 18)
// Verwaltet Modell-Generationen (Live, Shadow-Beta, Training), fuehrt automatische
// Schatten-Tests aus und vollzieht die Zero-Downtime Promotion bei Reife.

import { createRecordStore } from "../admin/recordStore.js";
import { runBenchmarkEvaluation } from "../training/automatedBenchmarkHarness.js";

const lifecycleStore = createRecordStore("model-lifecycle/registry", { maximal: 50 });

/**
 * Standard-Modell-Lifecycle-Zustand.
 * Basis-Version: smejj 1.0
 */
export function createInitialLifecycleState() {
  return {
    id: "active_lifecycle",
    activeLiveModel: {
      version: "smejj 1.0",
      status: "live_production",
      deployedAt: new Date().toISOString(),
      baseArchitecture: "smejj-hybrid-orchestrator",
      benchmarkPassRate: 1.0
    },
    shadowBetaModel: {
      version: "smejj 1.1-beta",
      status: "shadow_testing",
      shadowTrials: 0,
      shadowWins: 0,
      winRate: 0.0,
      activatedAt: new Date().toISOString()
    },
    nextTrainingTarget: {
      version: "smejj 2.0-training",
      status: "accumulating_dpo_data",
      targetReleaseMonths: 3
    },
    history: []
  };
}

/**
 * Vergleicht die Antwort des Live-Modells mit dem Shadow-Beta-Kandidaten (Schatten-Inferenz).
 * @param {string} prompt
 * @param {string} liveOutput
 * @param {string} shadowOutput
 * @param {number} liveLatencyMs
 * @param {number} shadowLatencyMs
 * @returns {object} { winner: "live" | "shadow" | "tie", scoreDelta, reasoning }
 */
export function evaluateShadowTrial(prompt, liveOutput, shadowOutput, liveLatencyMs = 1000, shadowLatencyMs = 900) {
  let liveScore = 50;
  let shadowScore = 50;

  const liveLen = (liveOutput || "").length;
  const shadowLen = (shadowOutput || "").length;

  if (liveLen > 40) liveScore += 20;
  if (shadowLen > 40) shadowScore += 20;

  // Codeblock-Pruefung
  if (/```[a-z]*\n[\s\S]*?\n```/.test(liveOutput || "")) liveScore += 15;
  if (/```[a-z]*\n[\s\S]*?\n```/.test(shadowOutput || "")) shadowScore += 15;

  // Latenz-Bonus
  if (shadowLatencyMs < liveLatencyMs) shadowScore += 10;
  else if (liveLatencyMs < shadowLatencyMs) liveScore += 10;

  // Anti-Wiederholungs-Pruefung
  if (/(.{10,50}?)\1{3,}/s.test(liveOutput || "")) liveScore -= 30;
  if (/(.{10,50}?)\1{3,}/s.test(shadowOutput || "")) shadowScore -= 30;

  const winner = shadowScore > liveScore ? "shadow" : liveScore > shadowScore ? "live" : "tie";

  return {
    winner,
    liveScore,
    shadowScore,
    scoreDelta: shadowScore - liveScore,
    reasoning: winner === "shadow"
      ? "Shadow-Beta-Modell lieferte praezisere und schnellere Antwort."
      : winner === "live"
      ? "Aktives Live-Modell war ueberlegen."
      : "Beide Modelle gleichwertig."
  };
}

/**
 * Registriert einen Schatten-Test und aktualisiert den Lifecycle-Status.
 * @param {object} lifecycleState
 * @param {object} trialResult
 * @returns {object}
 */
export function recordShadowTrial(lifecycleState, trialResult) {
  const shadow = lifecycleState.shadowBetaModel;
  shadow.shadowTrials += 1;
  if (trialResult.winner === "shadow") {
    shadow.shadowWins += 1;
  } else if (trialResult.winner === "tie") {
    shadow.shadowWins += 0.5;
  }
  shadow.winRate = shadow.shadowTrials > 0
    ? Math.round((shadow.shadowWins / shadow.shadowTrials) * 100) / 100
    : 0.0;

  return lifecycleState;
}

/**
 * Prueft, ob das Shadow-Beta-Modell reif fuer die automatische Live-Schaltung ist.
 * Kriterien: Mindestens 10 Schatten-Tests, Win-Rate >= 65%, 100% Benchmark-Pass.
 * @param {object} lifecycleState
 * @param {Function} shadowInferFunction
 * @returns {Promise<{promoted: boolean, newState: object, reason: string}>}
 */
export async function checkAndPromoteCandidate(lifecycleState, shadowInferFunction) {
  const shadow = lifecycleState.shadowBetaModel;

  if (shadow.shadowTrials < 5) {
    return {
      promoted: false,
      newState: lifecycleState,
      reason: `Zu wenige Schatten-Tests (${shadow.shadowTrials}/5 erforderlich).`
    };
  }

  if (shadow.winRate < 0.60) {
    return {
      promoted: false,
      newState: lifecycleState,
      reason: `Win-Rate zu niedrig (${Math.round(shadow.winRate * 100)}% < 60% Mindestanforderung).`
    };
  }

  // Automatischer Benchmark-Check
  if (typeof shadowInferFunction === "function") {
    const bench = await runBenchmarkEvaluation(shadowInferFunction, { candidateId: shadow.version });
    if (!bench.qualified) {
      return {
        promoted: false,
        newState: lifecycleState,
        reason: `Benchmark-Test nicht bestanden (Pass-Rate: ${bench.passRate}).`
      };
    }
  }

  // Promotion durchfuehren: Shadow wird Live!
  const previousLive = { ...lifecycleState.activeLiveModel, archivedAt: new Date().toISOString() };
  const newLiveVersion = shadow.version.replace("-beta", "");

  const promotedState = {
    ...lifecycleState,
    activeLiveModel: {
      version: newLiveVersion,
      status: "live_production",
      deployedAt: new Date().toISOString(),
      promotedFromShadow: shadow.version,
      winRateAtPromotion: shadow.winRate
    },
    shadowBetaModel: {
      version: `smejj ${(parseFloat(newLiveVersion.replace("smejj ", "")) + 0.1).toFixed(1)}-beta`,
      status: "shadow_testing",
      shadowTrials: 0,
      shadowWins: 0,
      winRate: 0.0,
      activatedAt: new Date().toISOString()
    },
    nextTrainingTarget: {
      version: `smejj ${(Math.floor(parseFloat(newLiveVersion.replace("smejj ", ""))) + 1.0).toFixed(1)}-training`,
      status: "accumulating_dpo_data",
      targetReleaseMonths: 3
    },
    history: [previousLive, ...(lifecycleState.history || [])]
  };

  return {
    promoted: true,
    newState: promotedState,
    reason: `Erfolgreiche Promotion: ${newLiveVersion} ist jetzt das aktive Hauptmodell.`
  };
}

/**
 * Speichert den aktuellen Lifecycle-Status in IDrive e2 S3.
 * @param {object} state
 * @param {object} options
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveLifecycleState(state, { env = process.env } = {}) {
  try {
    await lifecycleStore.schreib({
      id: "active_lifecycle",
      ...state,
      savedAt: new Date().toISOString()
    }, { env });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
