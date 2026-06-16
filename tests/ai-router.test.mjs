import test from "node:test";
import assert from "node:assert/strict";
import { AI_MODES, createAiRouter, validateByokConfig, evaluateFreeDemo } from "../src/ai/index.js";

test("unknown provider is disabled", () => {
  const router = createAiRouter();
  const result = router.prepareRequest({ mode: "mystery-provider" });
  assert.equal(result.ok, false);
  assert.equal(result.mode, AI_MODES.disabled);
  assert.equal(result.reason, "unknown_provider");
});

test("paid provider marker is disabled", () => {
  const router = createAiRouter();
  const result = router.prepareRequest({ mode: "openai-paid-default" });
  assert.equal(result.ok, false);
  assert.equal(result.mode, AI_MODES.disabled);
  assert.equal(result.reason, "paid_mode_marker_blocked");
});

test("missing BYOK key is blocked", () => {
  const result = validateByokConfig({ baseUrl: "https://api.openai.com/v1", model: "demo" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_byok_key");
});

test("valid BYOK is user-owned and not stored server-side", () => {
  const result = validateByokConfig({
    apiKey: "user-session-key-placeholder",
    baseUrl: "https://api.openai.com/v1",
    model: "demo-model"
  });
  assert.equal(result.ok, true);
  assert.equal(result.costStatus, "BYOK / Nutzer-Key");
  assert.equal(result.storesKeyOnServer, false);
  assert.equal(result.persistentPlaintextStorageAllowed, false);
});

test("unknown BYOK endpoint is blocked", () => {
  const result = validateByokConfig({
    apiKey: "user-session-key-placeholder",
    baseUrl: "https://unknown-ai.example/v1",
    model: "demo-model"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "byok_endpoint_not_allowlisted");
});

test("free demo without hard limit is disabled", () => {
  const result = evaluateFreeDemo({ hardLimitAllowed: false, remaining: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "free_demo_hard_limit_missing_or_reached");
});

test("local browser without WebGPU falls back cleanly", () => {
  const router = createAiRouter({ navigatorRef: {} });
  const result = router.prepareRequest({ mode: AI_MODES.localBrowser });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "local_browser_webgpu_unavailable");
});

test("disabled mode leaves app usable", () => {
  const router = createAiRouter();
  const result = router.prepareRequest({ mode: AI_MODES.disabled, context: { task: "hello" } });
  assert.equal(result.ok, false);
  assert.equal(result.mode, AI_MODES.disabled);
  assert.match(result.message, /App bleibt/);
});
