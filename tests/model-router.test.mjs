import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProfile,
  customBackendFromEnv,
  executeWithFallback,
  openrouterBackendFromEnv,
  resolveChain,
  saladBackendFromEnv
} from "../control-server/src/llm/modelRouter.js";

test("router is fail-closed without any configuration", () => {
  assert.deepEqual(resolveChain("coding", {}), []);
  assert.equal(saladBackendFromEnv({}), null);
  assert.equal(openrouterBackendFromEnv({}), null);
  assert.equal(customBackendFromEnv({ SMEJJ_LLM_BASE_URL: "disabled", SMEJJ_LLM_MODEL: "disabled" }), null);
});

test("salad backend uses the Salad-Api-Key header and comes first in the chain", () => {
  const env = {
    SMEJJ_LLM_SALAD_BASE_URL: "https://example.salad.cloud/",
    SMEJJ_LLM_SALAD_API_KEY: "k",
    SMEJJ_LLM_OPENROUTER_API_KEY: "o",
    SMEJJ_LLM_BASE_URL: "http://127.0.0.1:8000/v1",
    SMEJJ_LLM_API_KEY: "local",
    SMEJJ_LLM_MODEL: "glm-5.2"
  };
  const chain = resolveChain("coding", env);
  assert.deepEqual(chain.map((b) => b.name), ["salad", "openrouter", "custom"]);
  assert.equal(chain[0].apiKeyHeader, "Salad-Api-Key");
  assert.equal(chain[0].baseUrl, "https://example.salad.cloud");
  assert.equal(chain[0].model, "tgi");
});

test("router expands server-side API key pools without exposing keys to clients", () => {
  const chain = resolveChain("coding", {
    SMEJJ_LLM_SALAD_BASE_URL: "https://salad.example",
    SMEJJ_LLM_SALAD_API_KEY: "salad-a",
    SMEJJ_LLM_SALAD_API_KEYS: "salad-b,\nsalad-a",
    SMEJJ_LLM_OPENROUTER_API_KEYS: "or-a,or-b",
    SMEJJ_LLM_BASE_URL: "https://custom.example/v1",
    SMEJJ_LLM_MODEL: "glm-5.2",
    SMEJJ_LLM_API_KEYS: "custom-a,custom-b"
  });
  assert.deepEqual(chain.map((backend) => `${backend.name}:${backend.keyIndex}`), [
    "salad:1",
    "salad:2",
    "openrouter:1",
    "openrouter:2",
    "custom:1",
    "custom:2"
  ]);
  assert.equal(chain[0].apiKey, "salad-a");
  assert.equal(chain[1].apiKey, "salad-b");
});

test("openrouter models are profile-specific and env-overridable", () => {
  const env = { SMEJJ_LLM_OPENROUTER_API_KEY: "o", SMEJJ_LLM_OPENROUTER_MODEL_CODING: "z-ai/glm-5.2" };
  assert.equal(openrouterBackendFromEnv(env, "coding").model, "z-ai/glm-5.2");
  assert.ok(openrouterBackendFromEnv(env, "fast").model.length > 0);
  assert.equal(openrouterBackendFromEnv(env, "reasoning").extraHeaders["X-Title"], "smejj.com");
});

test("profile classification is deterministic", () => {
  assert.equal(classifyProfile("Bitte fixe den Bug im JavaScript Code"), "coding");
  assert.equal(classifyProfile("Warum ist diese Architektur besser? Bitte begruende ausfuehrlich und im Detail mit einem Vergleich."), "reasoning");
  assert.equal(classifyProfile("Hallo"), "fast");
});

test("fallback chain: first backend fails, second wins; all failing reports attempts", async () => {
  const chain = resolveChain("default", {
    SMEJJ_LLM_SALAD_BASE_URL: "https://a.salad.cloud",
    SMEJJ_LLM_SALAD_API_KEY: "k",
    SMEJJ_LLM_OPENROUTER_API_KEY: "o"
  });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith("https://a.salad.cloud")) return { ok: false, status: 503 };
    return { ok: true, status: 200, body: "stream" };
  };
  const win = await executeWithFallback(chain, [{ role: "user", content: "hi" }], { fetchImpl });
  assert.equal(win.ok, true);
  assert.equal(win.backend, "openrouter");
  assert.equal(win.attempts[0].error, "http_503");
  assert.equal(calls.length, 2);

  const lose = await executeWithFallback(chain, [], { fetchImpl: async () => { throw new Error("netz weg"); } });
  assert.equal(lose.ok, false);
  assert.equal(lose.attempts.length, 2);
  assert.ok(lose.attempts.every((attempt) => attempt.error.includes("netz weg")));
});

test("auth headers are built correctly per backend type", async () => {
  const chain = resolveChain("default", { SMEJJ_LLM_SALAD_BASE_URL: "https://a.salad.cloud", SMEJJ_LLM_SALAD_API_KEY: "sk" });
  let seenHeaders = null;
  await executeWithFallback(chain, [], { fetchImpl: async (url, options) => { seenHeaders = options.headers; return { ok: true, body: "x" }; } });
  assert.equal(seenHeaders["Salad-Api-Key"], "sk");
  assert.equal(seenHeaders.Authorization, undefined);
});
