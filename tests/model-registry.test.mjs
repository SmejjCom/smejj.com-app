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
  assert.deepEqual(
    registry.models.map((model) => model.name),
    ["GLM-5.2", "Kimi K2.7", "Kimi K3", "smejj fast 1.0"]
  );
  assert.equal(registry.models[0].active, true);
  assert.equal(registry.models[1].active, false);
  assert.equal(registry.models[2].active, false);
  assert.equal(registry.models[3].active, false);
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

// --- Kimi K3 (reines API-Modell, kein Vault in IDrive e2) ---
// Schutz-Tests: K3 ist kostenpflichtig und darf niemals ohne ausdrueckliches
// Flag + Key greifen; GLM-5.2 bleibt Standard und Fallback.

const K3_ENV_COMPLETE = Object.freeze({
  SMEJJ_KIMI_K3_ENABLED: "YES",
  SMEJJ_LLM_KIMI_K3_API_KEY: "secret-k3"
});

test("Kimi K3 ist ohne Konfiguration inaktiv (fail-closed)", () => {
  const model = getModelDefinition("Kimi K3");
  assert.equal(model.enabledByDefault, false);
  assert.equal(model.fallbackModelId, DEFAULT_MODEL_ID);
  assert.equal(isModelEnabled(model, {}), false);
  assert.equal(getModelRuntimeConfig(model, {}).configured, false);
});

test("Kimi K3 nutzt den Moonshot-Endpunkt und die Modell-ID kimi-k3", () => {
  const runtime = getModelRuntimeConfig("kimi-k3", K3_ENV_COMPLETE);
  assert.equal(runtime.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(runtime.runtimeModel, "kimi-k3");
  assert.equal(runtime.apiKeyHeader, "Authorization");
  assert.equal(runtime.provider, "kimi");
  assert.equal(runtime.configured, true);
});

test("Kimi K3 greift NICHT ohne API-Key, auch wenn das Flag gesetzt ist", () => {
  const env = { ...K3_ENV_COMPLETE, SMEJJ_LLM_KIMI_K3_API_KEY: "" };
  assert.equal(getModelRuntimeConfig("kimi-k3", env).configured, false);
});

test("Kimi K3 hat keinen e2-Vault", () => {
  assert.equal(getModelDefinition("kimi-k3").storage, null);
});

// K2.7 und K3 liegen auf demselben Moonshot-Konto. Der bereits ausgerollte
// K2.7-Key darf K3 versorgen, damit derselbe Wert nicht ein zweites Mal von
// Hand in die Umgebung getippt werden muss. Die Richtung gilt nur so herum.
test("Kimi K3 erbt den K2.7-Key, wenn kein eigener gesetzt ist", () => {
  const runtime = getModelRuntimeConfig("kimi-k3", { ...KIMI_ENV, SMEJJ_KIMI_K3_ENABLED: "YES" });
  assert.deepEqual(runtime.apiKeys, ["secret-kimi"]);
  assert.equal(runtime.keySource, "KIMI");
  assert.equal(runtime.configured, true);
  // Der Endpunkt bleibt der von K3 — nur der Key wird geerbt, nicht die URL.
  assert.equal(runtime.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(runtime.runtimeModel, "kimi-k3");
});

test("ein eigener K3-Key hat Vorrang vor dem geerbten", () => {
  const runtime = getModelRuntimeConfig("kimi-k3", { ...KIMI_ENV, ...K3_ENV_COMPLETE });
  assert.deepEqual(runtime.apiKeys, ["secret-k3"]);
  assert.equal(runtime.keySource, "KIMI_K3");
});

test("das Erben ist einseitig: der K3-Key konfiguriert K2.7 NICHT", () => {
  assert.equal(getModelRuntimeConfig("kimi-k2-7", K3_ENV_COMPLETE).configured, false);
});

test("der geerbte Key aktiviert K3 NICHT ohne Feature-Flag (fail-closed)", () => {
  // KIMI_ENV traegt einen gueltigen Key, aber kein SMEJJ_KIMI_K3_ENABLED.
  assert.equal(isModelEnabled("kimi-k3", KIMI_ENV), false);
  const selection = resolveModelSelection({ requestedModel: "kimi-k3", profile: "coding", env: KIMI_ENV });
  assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID);
  assert.equal(selection.reason, "requested_model_inactive");
});

test("Kimi K3 verdraengt GLM-5.2 nicht als Standard und nicht im Auto-Modus", () => {
  const env = { ...K3_ENV_COMPLETE, SMEJJ_MODEL_AUTO_ENABLED: "YES" };
  assert.equal(getPublicModelRegistry(env).defaultModelId, DEFAULT_MODEL_ID);
  for (const profile of ["coding", "reasoning", "fast", "default", "web"]) {
    const selection = resolveModelSelection({ requestedModel: "auto", profile, env });
    assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID, `Profil ${profile} muss bei GLM-5.2 bleiben`);
  }
});

test("Kimi K3 wird ausgewaehlt, wenn der Nutzer es ausdruecklich anfragt", () => {
  const selection = resolveModelSelection({ requestedModel: "Kimi K3", profile: "coding", env: K3_ENV_COMPLETE });
  assert.equal(selection.selectedModelId, "kimi-k3");
  assert.deepEqual(selection.candidateIds, ["kimi-k3", DEFAULT_MODEL_ID]);
});

test("inaktives Kimi K3 faellt auf GLM-5.2 zurueck", () => {
  const selection = resolveModelSelection({ requestedModel: "kimi-k3", profile: "coding", env: {} });
  assert.equal(selection.requestedModelId, "kimi-k3");
  assert.equal(selection.selectedModelId, DEFAULT_MODEL_ID);
  assert.equal(selection.reason, "requested_model_inactive");
});

test("Kimi K3 leakt keinen Key in die oeffentliche Registry", () => {
  const registry = getPublicModelRegistry(K3_ENV_COMPLETE);
  const k3 = registry.models.find((model) => model.id === "kimi-k3");
  assert.equal(k3.runtimeConfigured, true);
  assert.equal(k3.contextTokens, 1_000_000);
  assert.equal(JSON.stringify(registry).includes("secret-k3"), false);
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

// --- Live-Ausfall vom 2026-08-02: Kette mit genau einem Eintrag ---------------

const KETTEN_ENV = Object.freeze({
  SMEJJ_GLM_5_2_ENABLED: "YES",
  SMEJJ_KIMI_K2_7_ENABLED: "YES",
  SMEJJ_MODEL_DEFAULT: "glm-5-2",
  SMEJJ_LLM_ZHIPU_API_KEY: "test",
  SMEJJ_LLM_KIMI_API_KEY: "test",
  SMEJJ_LLM_KIMI_BASE_URL: "https://api.moonshot.ai/v1"
});

test("das Standardmodell ist nie der einzige Kandidat, wenn Fallback erlaubt ist", () => {
  // Genau dieser Fall stand am 2026-08-02 live: gewaehltes Modell == Standard,
  // Kette hatte einen Eintrag, das Modell war tot -> jeder Nutzer bekam HTTP 502.
  const selection = resolveModelSelection({ profile: "coding", env: KETTEN_ENV });
  assert.ok(selection.candidateIds.length > 1,
    `Kette muss einen Ersatz enthalten, war: ${selection.candidateIds.join(",")}`);
  assert.equal(selection.candidateIds[0], "glm-5-2", "ohne Gesundheitsdaten bleibt die Reihenfolge unveraendert");
  assert.ok(selection.candidateIds.includes("kimi-k2-7"));
});

test("ein bekannt ausgefallenes Modell rutscht ans Ende der Kette", () => {
  const selection = resolveModelSelection({
    profile: "coding",
    env: KETTEN_ENV,
    health: { "glm-5-2": { available: false } }
  });
  assert.equal(selection.candidateIds[0], "kimi-k2-7");
  assert.equal(selection.candidateIds[selection.candidateIds.length - 1], "glm-5-2");
  assert.equal(selection.selectedModelId, "kimi-k2-7", "gewaehlt wird der erste gesunde Kandidat");
});

test("abgeschalteter Fallback bleibt abgeschaltet", () => {
  // Der Schalter muss weiter gelten — sonst waere die Korrektur eine
  // Umgehung der Betreiber-Einstellung statt einer Verbesserung.
  const selection = resolveModelSelection({
    profile: "coding",
    env: { ...KETTEN_ENV, SMEJJ_MODEL_FALLBACK_ENABLED: "NO" }
  });
  assert.deepEqual(selection.candidateIds, ["glm-5-2"]);
});

test("ohne Gesundheitsdaten aendert sich die Reihenfolge nicht", () => {
  const ohne = resolveModelSelection({ profile: "coding", env: KETTEN_ENV });
  const leer = resolveModelSelection({ profile: "coding", env: KETTEN_ENV, health: {} });
  assert.deepEqual(leer.candidateIds, ohne.candidateIds);
});

test("nur einsatzbereite Modelle kommen als Ersatz in die Kette", () => {
  // Kimi ohne Basis-Adresse ist nicht konfiguriert und darf nicht auftauchen —
  // ein unkonfigurierter Ersatz waere ein zweiter Ausfall statt einer Rettung.
  const selection = resolveModelSelection({
    profile: "coding",
    env: { ...KETTEN_ENV, SMEJJ_LLM_KIMI_BASE_URL: "" }
  });
  assert.ok(!selection.candidateIds.includes("kimi-k2-7"));
});

test("keine Modellangabe ist keine Wahl — SMEJJ_MODEL_DEFAULT greift", () => {
  // Live-Befund 2026-08-02: normalizeModelId("") liefert das fest eingebaute
  // glm-5-2. Wurde das ungeprueft weitergereicht, sah eine Anfrage OHNE
  // Modellangabe aus wie die ausdrueckliche Wahl von glm-5-2 — und der
  // konfigurierte Standard war ausgerechnet im haeufigsten Fall wirkungslos.
  const env = { ...KETTEN_ENV, SMEJJ_MODEL_DEFAULT: "kimi-k2-7" };
  for (const angabe of ["", "   ", null, undefined]) {
    const selection = resolveModelSelection({ requestedModel: angabe, profile: "coding", env });
    assert.equal(selection.selectedModelId, "kimi-k2-7", `Angabe ${JSON.stringify(angabe)}`);
    assert.equal(selection.reason, "default_model", `Angabe ${JSON.stringify(angabe)}`);
  }
});

test("eine ausdrueckliche Wahl schlaegt den Standard weiterhin", () => {
  const env = { ...KETTEN_ENV, SMEJJ_MODEL_DEFAULT: "kimi-k2-7" };
  const selection = resolveModelSelection({ requestedModel: "glm-5.2", profile: "coding", env });
  assert.equal(selection.selectedModelId, "glm-5-2");
  assert.equal(selection.reason, "explicit_model");
});
