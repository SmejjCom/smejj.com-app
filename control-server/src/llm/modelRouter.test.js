// smejj.com — Unit-Tests fuer den Multi-Modell-Router.
// Ausfuehren: node --test control-server/src/llm/modelRouter.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUTING_PROFILES, PROVIDER_CATALOG,
  saladBackendFromEnv, openrouterBackendFromEnv, providerBackendFromEnv,
  customBackendFromEnv, providerOrderFromEnv, resolveChain,
  classifyProfile, executeWithFallback
} from "./modelRouter.js";

test("fail-closed: ohne Keys ist die Kette leer", () => {
  assert.deepEqual(resolveChain("default", {}), []);
});

test("Salad-Backend nur mit BaseUrl UND Key aktiv (Bestandsverhalten)", () => {
  assert.equal(saladBackendFromEnv({}), null);
  assert.equal(saladBackendFromEnv({ SMEJJ_LLM_SALAD_BASE_URL: "https://x" }), null);
  const b = saladBackendFromEnv({ SMEJJ_LLM_SALAD_BASE_URL: "https://x/", SMEJJ_LLM_SALAD_API_KEY: "k" });
  assert.equal(b.name, "salad");
  assert.equal(b.baseUrl, "https://x");
  assert.equal(b.apiKeyHeader, "Salad-Api-Key");
  assert.equal(b.model, "tgi");
});

test("Katalog-Anbieter aktivieren sich nur per Key und respektieren Profil-Overrides", () => {
  assert.equal(providerBackendFromEnv("groq", {}), null);
  const g = providerBackendFromEnv("groq", { SMEJJ_LLM_GROQ_API_KEY: "k" }, "fast");
  assert.equal(g.name, "groq");
  assert.equal(g.model, "openai/gpt-oss-20b");
  assert.ok(g.baseUrl.includes("api.groq.com"));
  const gOverride = providerBackendFromEnv("groq", {
    SMEJJ_LLM_GROQ_API_KEY: "k",
    SMEJJ_LLM_GROQ_MODEL_FAST: "custom-fast",
    SMEJJ_LLM_GROQ_MODEL: "custom-default"
  }, "fast");
  assert.equal(gOverride.model, "custom-fast");
  const gDefaultOverride = providerBackendFromEnv("groq", {
    SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_GROQ_MODEL: "custom-default"
  }, "reasoning");
  assert.equal(gDefaultOverride.model, "custom-default");
  assert.equal(providerBackendFromEnv("unbekannt", { SMEJJ_LLM_UNBEKANNT_API_KEY: "k" }), null);
});

test("zhipu-Default ist glm-5.2 (GLM bleibt Qualitaetsmodell)", () => {
  const z = providerBackendFromEnv("zhipu", { SMEJJ_LLM_ZHIPU_API_KEY: "k" }, "coding");
  assert.equal(z.model, "glm-5.2");
});

test("Reihenfolge: Standard beginnt mit salad,openrouter; Env-Order uebersteuert", () => {
  const def = providerOrderFromEnv({});
  assert.equal(def[0], "salad");
  assert.equal(def[1], "openrouter");
  assert.ok(def.includes("groq") && def.includes("custom"));
  const custom = providerOrderFromEnv({ SMEJJ_LLM_PROVIDER_ORDER: "groq, openrouter, quatsch, salad" });
  assert.deepEqual(custom, ["groq", "openrouter", "salad"]);
});

test("resolveChain baut Kette in konfigurierter Reihenfolge, nur aktive Anbieter", () => {
  const env = {
    SMEJJ_LLM_PROVIDER_ORDER: "groq,openrouter,salad",
    SMEJJ_LLM_GROQ_API_KEY: "k1",
    SMEJJ_LLM_OPENROUTER_API_KEY: "k2"
    // salad ohne Key -> fehlt
  };
  const chain = resolveChain("web", env);
  assert.deepEqual(chain.map((b) => b.name), ["groq", "openrouter"]);
  assert.equal(chain[1].model, "google/gemini-2.5-flash"); // web-Profil Default
});

test("web ist gueltiges Profil; unbekannte Profile fallen auf default", () => {
  assert.ok(ROUTING_PROFILES.includes("web"));
  const env = { SMEJJ_LLM_OPENROUTER_API_KEY: "k", SMEJJ_LLM_PROVIDER_ORDER: "openrouter" };
  const chain = resolveChain("gibtsnicht", env);
  assert.equal(chain[0].model, "deepseek/deepseek-chat");
});

test("classifyProfile bleibt deterministisch (Bestandsverhalten)", () => {
  assert.equal(classifyProfile("Bitte den Bug im Code fixen"), "coding");
  assert.equal(classifyProfile("Warum ist diese Architektur besser? Bitte eine ausfuehrliche Analyse mit Begruendung und Vergleich."), "reasoning");
  assert.equal(classifyProfile("Hi"), "fast");
});

test("executeWithFallback: Fallback bei HTTP-Fehler, Gewinner liefert rohe Response", async () => {
  const chain = [
    { name: "a", baseUrl: "https://a", apiKey: "k", apiKeyHeader: "Authorization", model: "m1" },
    { name: "b", baseUrl: "https://b", apiKey: "k", apiKeyHeader: "Authorization", model: "m2" }
  ];
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith("https://a")) return { ok: false, status: 429 };
    return { ok: true, status: 200, body: "STREAM" };
  };
  const result = await executeWithFallback(chain, [{ role: "user", content: "x" }], { fetchImpl, timeoutMs: 5000 });
  assert.equal(result.ok, true);
  assert.equal(result.backend, "b");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].error, "http_429");
  assert.equal(calls.length, 2);
});

test("executeWithFallback: alle scheitern -> ok:false mit Versuchsliste", async () => {
  const chain = [{ name: "a", baseUrl: "https://a", apiKey: "k", apiKeyHeader: "Authorization", model: "m" }];
  const fetchImpl = async () => { throw new Error("netzfehler"); };
  const result = await executeWithFallback(chain, [], { fetchImpl, timeoutMs: 5000 });
  assert.equal(result.ok, false);
  assert.equal(result.attempts[0].error.includes("netzfehler"), true);
});

test("Katalog: alle Anbieter haben https-BaseUrl und ein default-Modell", () => {
  for (const [name, entry] of Object.entries(PROVIDER_CATALOG)) {
    assert.ok(entry.baseUrl.startsWith("https://"), name + " baseUrl");
    assert.ok(entry.models.default && entry.models.default.length > 0, name + " default model");
  }
});

test("custom-Backend: Bestandsverhalten unveraendert", () => {
  assert.equal(customBackendFromEnv({}), null);
  const c = customBackendFromEnv({ SMEJJ_LLM_BASE_URL: "https://x/v1/", SMEJJ_LLM_API_KEY: "k", SMEJJ_LLM_MODEL: "m" });
  assert.equal(c.name, "custom");
  assert.equal(c.baseUrl, "https://x/v1");
});
