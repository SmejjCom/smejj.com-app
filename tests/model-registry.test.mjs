import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MODEL_ID,
  getModelDefinition,
  getModelRuntimeConfig,
  getPublicModelRegistry,
  isModelEnabled,
  normalizeModelId,
  resolveModelSelection
} from "../src/shared/modelRegistry.js";

const KIMI_ENV = {
  SMEJJ_KIMI_K2_7_ENABLED: "YES",
  SMEJJ_LLM_KIMI_BASE_URL: "https://kimi.example/v1",
  SMEJJ_LLM_KIMI_API_KEY: "secret-kimi",
  SMEJJ_LLM_KIMI_MODEL: "moonshotai/Kimi-K2.7-Code"
};

test("registry keeps GLM-5.2 primary and Kimi K2.7 feature-flagged", () => {
  const registry = getPublicModelRegistry({});
  assert.equal(registry.defaultModelId, DEFAULT_MODEL_ID);
  assert.deepEqual(registry.models.map((model) => model.name), ["GLM-5.2", "Kimi K2.7", "smejj fast 1.0"]);
  assert.equal(registry.models[0].active, true);
  assert.equal(registry.models[1].active, false);
  assert.equal(registry.models[2].active, false);
  assert.equal(registry.models[0].contextTokens, 1_000_000);
  assert.equal(registry.models[1].contextTokens, 262_144);
  assert.equal(JSON.stringify(registry).includes("secret"), false);
});

test("registry normalizes UI names and storage vault aliases", () => {
  assert.equal(normalizeModelId("GLM-5.2"), "glm-5-2");
  assert.equal(normalizeModelId("glm-5-2-fp8"), "glm-5-2");
  assert.equal(normalizeModelId("Kimi K2.7"), "kimi-k2-7");
  assert.equal(normalizeModelId("unknown-model"), null);
  assert.equal(getModelDefinition("Kimi K2.7").storage.provider, "idrive-e2");
});

test("Kimi runtime requires explicit feature flag, endpoint and key", () => {
  const partial = getModelRuntimeConfig("kimi-k2-7", { SMEJJ_KIMI_K2_7_ENABLED: "YES" });
  assert.equal(partial.configured, false);
  const runtime = getModelRuntimeConfig("kimi-k2-7", KIMI_ENV, "coding");
  assert.equal(runtime.configured, true);
  assert.equal(runtime.provider, "kimi");
  assert.equal(runtime.runtimeModel, "moonshotai/Kimi-K2.7-Code");
  assert.deepEqual(runtime.apiKeys, ["secret-kimi"]);
});

test("public runtime status distinguishes configured, ready and degraded", () => {
  const unverified = getPublicModelRegistry(KIMI_ENV).models.find((model) => model.id === "kimi-k2-7");
  const ready = getPublicModelRegistry(KIMI_ENV, {
    "kimi-k2-7": { status: "ready", available: true, source: "inference" }
  }).models.find((model) => model.id === "kimi-k2-7");
  const degraded = getPublicModelRegistry(KIMI_ENV, {
    "kimi-k2-7": { status: "degraded", available: false, reason: "insufficient_balance" }
  }).models.find((model) => model.id === "kimi-k2-7");

  assert.equal(unverified.status, "configured-unverified");
  assert.equal(unverified.runtimeConfigured, true);
  assert.equal(unverified.runtimeAvailable, false);
  assert.equal(ready.status, "ready");
  assert.equal(ready.runtimeAvailable, true);
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.runtimeAvailable, false);
  assert.equal(degraded.runtime.health.reason, "insufficient_balance");
  assert.equal(JSON.stringify(degraded).includes("secret-kimi"), false);
});

test("inactive Kimi selection falls back to GLM-5.2", () => {
  const selection = resolveModelSelection({ requestedModel: "Kimi K2.7", profile: "coding", env: {} });
  assert.equal(selection.requestedModelId, "kimi-k2-7");
  assert.equal(selection.selectedModelId, "glm-5-2");
  assert.deepEqual(selection.candidateIds, ["glm-5-2"]);
  assert.equal(selection.reason, "requested_model_inactive");
});

test("auto mode is prepared and selects configured Kimi only for coding", () => {
  const env = { ...KIMI_ENV, SMEJJ_MODEL_AUTO_ENABLED: "YES" };
  const coding = resolveModelSelection({ requestedModel: "auto", profile: "coding", env });
  const chat = resolveModelSelection({ requestedModel: "auto", profile: "default", env });
  assert.equal(coding.selectedModelId, "kimi-k2-7");
  assert.equal(chat.selectedModelId, "glm-5-2");
});

// --- smejj fast 1.0 (eigenes, selbst gehostetes Modell auf Salad-GPU) ---
// Schutz-Tests: Das Modell darf NIEMALS ohne vollstaendige Konfiguration greifen
// und darf GLM-5.2 als Qualitaets-/Coding-Fundament nicht verdraengen.

const FAST_ENV_COMPLETE = Object.freeze({
  SMEJJ_MODEL_AUTO_ENABLED: "true",
  SMEJJ_FAST_1_ENABLED: "true",
  SMEJJ_LLM_FAST_BASE_URL: "https://example-gpu.salad.cloud/v1",
  SMEJJ_LLM_FAST_API_KEY: "test-key"
});

test("smejj fast 1.0 ist ohne Konfiguration inaktiv (fail-closed)", () => {
  const model = getModelDefinition("smejj-fast-1");
  assert.equal(model.enabledByDefault, false);
  assert.equal(model.fallbackModelId, DEFAULT_MODEL_ID);
  assert.equal(isModelEnabled(model, {}), false);
  assert.equal(getModelRuntimeConfig(model, {}).configured, false);
});

test("smejj fast 1.0 greift NICHT ohne BASE_URL, auch wenn Flag gesetzt ist", () => {
  const env = { ...FAST_ENV_COMPLETE, SMEJJ_LLM_FAST_BASE_URL: "" };
  assert.equal(getModelRuntimeConfig("smejj-fast-1", env).configured, false);
  const selection = resolveModelSelection({ requestedModel: "auto", profile: "fast", env });
  assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID);
});

test("smejj fast 1.0 greift NICHT ohne API-Key, auch wenn Flag + URL gesetzt sind", () => {
  const env = { ...FAST_ENV_COMPLETE, SMEJJ_LLM_FAST_API_KEY: "" };
  assert.equal(getModelRuntimeConfig("smejj-fast-1", env).configured, false);
  const selection = resolveModelSelection({ requestedModel: "auto", profile: "fast", env });
  assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID);
});

test("smejj fast 1.0 uebernimmt Profil fast nur wenn Flag UND Runtime vollstaendig sind", () => {
  const selection = resolveModelSelection({ requestedModel: "auto", profile: "fast", env: FAST_ENV_COMPLETE });
  assert.equal(selection.selectedModelId, "smejj-fast-1");
  assert.equal(selection.reason, "auto_profile_selection");
  // GLM-5.2 bleibt als Fallback in der Kette — kein Single Point of Failure.
  assert.ok(selection.candidateIds.includes(DEFAULT_MODEL_ID));
});

test("smejj fast 1.0 verdraengt GLM-5.2 NICHT bei coding/reasoning/default", () => {
  for (const profile of ["coding", "reasoning", "default", "web"]) {
    const selection = resolveModelSelection({ requestedModel: "auto", profile, env: FAST_ENV_COMPLETE });
    assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID, `Profil ${profile} muss bei GLM-5.2 bleiben`);
  }
});

test("smejj fast 1.0 nutzt Salad-Header und Apache-2.0-Basismodell", () => {
  const runtime = getModelRuntimeConfig("smejj-fast-1", FAST_ENV_COMPLETE);
  assert.equal(runtime.apiKeyHeader, "Salad-Api-Key");
  assert.equal(runtime.provider, "salad");
  assert.equal(runtime.runtimeModel, "smejj-fast-1"); // muss == LLAMA_ARG_ALIAS der Container Group sein
  assert.equal(runtime.configured, true);
});

test("smejj fast 1.0 bleibt aus, wenn das Feature-Flag ausgeschaltet ist", () => {
  const env = { ...FAST_ENV_COMPLETE, SMEJJ_FAST_1_ENABLED: "false" };
  const selection = resolveModelSelection({ requestedModel: "auto", profile: "fast", env });
  assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID);
});
