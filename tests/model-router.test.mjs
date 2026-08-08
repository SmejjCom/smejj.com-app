import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProfile,
  customBackendFromEnv,
  executeWithFallback,
  openrouterBackendFromEnv,
  registryBackendFromEnv,
  resolveChain,
  resolveModelRequest,
  saladBackendFromEnv
} from "../control-server/src/llm/modelRouter.js";
import {
  getModelRuntimeHealthSnapshot,
  refreshModelRuntimeHealth,
  resetModelRuntimeHealth
} from "../control-server/src/llm/modelRuntimeHealth.js";

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

test("explicit Kimi selection uses the registry runtime before GLM fallback", () => {
  const env = {
    SMEJJ_KIMI_K2_7_ENABLED: "YES",
    SMEJJ_LLM_KIMI_BASE_URL: "https://kimi.example/v1",
    SMEJJ_LLM_KIMI_API_KEY: "kimi-key",
    SMEJJ_LLM_KIMI_MODEL: "moonshotai/Kimi-K2.7-Code",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://glm.example/v1",
    SMEJJ_LLM_ZHIPU_API_KEY: "glm-key",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu"
  };
  const backend = registryBackendFromEnv("kimi-k2-7", env, "coding");
  const request = resolveModelRequest("coding", "Kimi K2.7", env);
  assert.equal(backend.logicalModelId, "kimi-k2-7");
  assert.deepEqual(request.chain.map((item) => item.logicalModelId), ["kimi-k2-7", "glm-5-2"]);
  assert.deepEqual(request.chain.map((item) => item.name), ["kimi", "zhipu"]);
});

test("Kimi outage falls back to GLM-5.2 with an auditable logical model id", async () => {
  resetModelRuntimeHealth();
  const env = {
    SMEJJ_KIMI_K2_7_ENABLED: "YES",
    SMEJJ_LLM_KIMI_BASE_URL: "https://kimi.example/v1",
    SMEJJ_LLM_KIMI_API_KEY: "kimi-key",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://glm.example/v1",
    SMEJJ_LLM_ZHIPU_API_KEY: "glm-key",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu"
  };
  const { chain } = resolveModelRequest("coding", "kimi-k2-7", env);
  const result = await executeWithFallback(chain, [{ role: "user", content: "fix code" }], {
    fetchImpl: async (url) => url.startsWith("https://kimi.example")
      ? { ok: false, status: 503 }
      : { ok: true, status: 200, body: "stream" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.logicalModelId, "glm-5-2");
  assert.equal(result.attempts[0].logicalModelId, "kimi-k2-7");
  const health = getModelRuntimeHealthSnapshot();
  assert.equal(health["kimi-k2-7"].status, "degraded");
  assert.equal(health["kimi-k2-7"].reason, "http_503");
  assert.equal(health["glm-5-2"].status, "ready");
  resetModelRuntimeHealth();
});

test("official Kimi balance probe is secret-free and fail-closed", async () => {
  resetModelRuntimeHealth();
  const env = {
    SMEJJ_KIMI_K2_7_ENABLED: "YES",
    SMEJJ_LLM_KIMI_BASE_URL: "https://api.moonshot.ai/v1",
    SMEJJ_LLM_KIMI_API_KEY: "never-expose-this-key",
    SMEJJ_LLM_KIMI_MODEL: "kimi-k2.7-code"
  };
  let seenAuthorization = "";
  await refreshModelRuntimeHealth(env, {
    force: true,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.moonshot.ai/v1/users/me/balance");
      seenAuthorization = options.headers.Authorization;
      return { ok: true, status: 200, json: async () => ({ data: { available_balance: 0 } }) };
    }
  });
  const degraded = getModelRuntimeHealthSnapshot()["kimi-k2-7"];
  assert.equal(seenAuthorization, "Bearer never-expose-this-key");
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.reason, "insufficient_balance");
  assert.equal(JSON.stringify(degraded).includes("never-expose-this-key"), false);

  await refreshModelRuntimeHealth(env, {
    force: true,
    nowMs: Date.now() + 1,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { available_balance: 1 } }) })
  });
  assert.equal(getModelRuntimeHealthSnapshot()["kimi-k2-7"].status, "ready");
  resetModelRuntimeHealth();
});

test("thinking parameter reaches only GLM/Z.ai backends (interactive no-think profile)", async () => {
  resetModelRuntimeHealth();
  const glm = { name: "zhipu", model: "glm-5.2", baseUrl: "https://api.z.ai/api/paas/v4", apiKey: "k", apiKeyHeader: "Authorization", logicalModelId: "glm-5-2" };
  const kimi = { name: "kimi", model: "kimi-k2.7-code", baseUrl: "https://api.moonshot.ai/v1", apiKey: "k", apiKeyHeader: "Authorization", logicalModelId: "kimi-k2-7" };
  const bodies = [];
  const fetchImpl = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, status: 200, body: "stream" };
  };
  await executeWithFallback([glm], [{ role: "user", content: "hi" }], { fetchImpl, thinking: { type: "disabled" } });
  assert.deepEqual(bodies[0].thinking, { type: "disabled" }, "GLM bekommt thinking:disabled");
  await executeWithFallback([kimi], [{ role: "user", content: "hi" }], { fetchImpl, thinking: { type: "disabled" } });
  assert.equal("thinking" in bodies[1], false, "Nicht-GLM-Backends bekommen kein thinking-Feld");
  await executeWithFallback([glm], [{ role: "user", content: "hi" }], { fetchImpl });
  assert.equal("thinking" in bodies[2], false, "Ohne Option bleibt der Request unveraendert (Non-Regression)");
  resetModelRuntimeHealth();
});

test("Coding-Profil waehlt das Coding-Modell des Anbieters, default waehlt sein Standardmodell", () => {
  // Der eigentliche Grund fuer diesen Test: bis 2026-07-29 rief /api/chat
  // streamLLM ohne `profile` auf. Jede Anfrage lief auf "default", und dieser
  // Unterschied hier — der im Katalog seit immer angelegt ist — kam nie zum
  // Tragen. Der Test haelt fest, DASS er zum Tragen kommt.
  const env = { SMEJJ_LLM_PROVIDER_ORDER: "deepseek", SMEJJ_LLM_DEEPSEEK_API_KEY: "k" };
  const coding = resolveChain("coding", env);
  const standard = resolveChain("default", env);
  assert.equal(coding[0].model, "deepseek-chat");
  assert.equal(standard[0].model, "deepseek-chat");

  // mistral zeigt den Unterschied deutlich: eigenes Coding-Modell.
  const mistralEnv = { SMEJJ_LLM_PROVIDER_ORDER: "mistral", SMEJJ_LLM_MISTRAL_API_KEY: "k" };
  assert.equal(resolveChain("coding", mistralEnv)[0].model, "codestral-latest");
  assert.equal(resolveChain("default", mistralEnv)[0].model, "mistral-small-latest");
});

test("Coding-Profil bei einem Anbieter OHNE Coding-Modell faellt auf dessen Standard zurueck, nie ins Leere", () => {
  // groq hat kein Coding-Modell. Fail-closed heisst hier: der Standard greift,
  // es wird nichts geraten und kein anderer Anbieter heimlich aktiviert.
  const env = { SMEJJ_LLM_PROVIDER_ORDER: "groq", SMEJJ_LLM_GROQ_API_KEY: "k" };
  const chain = resolveChain("coding", env);
  assert.equal(chain.length, 1);
  assert.equal(chain[0].model, "llama-3.3-70b-versatile");
});

test("classifyProfile erkennt die Coding-Absicht des fehlgeschlagenen Eval-Falls", () => {
  // Genau der Fall, der im Live-Eval als kritisch scheitert (code-esm-failclosed).
  assert.equal(classifyProfile("Schreibe eine ESM-Funktion parseBudget(text)"), "coding");
  assert.equal(classifyProfile("Implement a patch for this bug"), "coding");
});

test("das selbst gehostete Modell bekommt eine Gesundheitssonde", async () => {
  // Der Waechter fuer einen echten Befund (2026-08-06): fuer smejj-fast-1 gab
  // es GAR KEINE Sonde. Gesundheit entstand nur aus echter Inferenz — und
  // `runtimeAvailable` ist `health?.available === true`, bei fehlendem Eintrag
  // also false. Vier Tage lang meldete das Register `erreichbar: false` fuer
  // eine laufende, gesunde und bezahlte GPU, deren /health `{"status":"ok"}`
  // lieferte. Wer das liest, benutzt das Modell nicht — und ohne Benutzung
  // entsteht kein Eintrag. Diese Sonde bricht den Kreis.
  resetModelRuntimeHealth();
  const env = {
    SMEJJ_FAST_1_ENABLED: "true",
    SMEJJ_LLM_FAST_BASE_URL: "https://beispiel.salad.cloud/v1",
    SMEJJ_LLM_FAST_API_KEY: "never-expose-this-key"
  };

  let geseheneUrl = "";
  let gesehenerKopf = "";
  await refreshModelRuntimeHealth(env, {
    force: true,
    fetchImpl: async (url, options) => {
      geseheneUrl = url;
      gesehenerKopf = options.headers["Salad-Api-Key"] || "";
      return { ok: true, status: 200, json: async () => ({ status: "ok" }) };
    }
  });

  // Die Adresse endet auf /v1; die Gesundheitsanzeige liegt eine Ebene darueber.
  assert.equal(geseheneUrl, "https://beispiel.salad.cloud/health");
  // Salad verlangt den eigenen Kopf — mit `Authorization: Bearer` antwortet die
  // Vortuer 403 (live gemessen), und die Sonde haette den Ausfall erfunden.
  assert.equal(gesehenerKopf, "never-expose-this-key");

  const gesund = getModelRuntimeHealthSnapshot()["smejj-fast-1"];
  assert.equal(gesund.status, "ready");
  assert.equal(gesund.available, true);
  assert.equal(gesund.source, "health-probe");
  assert.equal(JSON.stringify(gesund).includes("never-expose-this-key"), false,
    "der Schluessel darf in keinem Gesundheitseintrag auftauchen");

  // Und der Ausfall wird als Ausfall gemeldet, nicht verschwiegen.
  await refreshModelRuntimeHealth(env, {
    force: true,
    nowMs: Date.now() + 1,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });
  const krank = getModelRuntimeHealthSnapshot()["smejj-fast-1"];
  assert.equal(krank.available, false);
  assert.equal(krank.reason, "health_http_503");
  resetModelRuntimeHealth();
});
