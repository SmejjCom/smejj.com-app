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
  // Seit 84d9f185 (18.08.): Groqs Llama-Eintraege sind beim Anbieter tot (404),
  // Katalog steht gemessen auf openai/gpt-oss-20b fuer das fast-Profil.
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

test("zhipu-Default ist ein Modell, das der Anbieter auch bedient", () => {
  // Bis 2026-09-07 stand hier fest "glm-5.2". Live gemessen lehnt der Anbieter
  // genau das ab: 429 "Insufficient balance or no resource package", und im
  // Klartext "Weekly/Monthly Limit Exhausted. Your limit will reset at
  // 2026-09-10 17:06:51". Dasselbe gilt fuer glm-4.6 und glm-4.5-air. Weil
  // kein anderer Anbieter Schluessel hat, war die tiefe Spur damit komplett
  // tot — der Test war gruen, das Produkt kaputt.
  //
  // Darum prueft er jetzt die Zusicherung, auf die es ankommt: der Default
  // muss aus der Liste der Modelle stammen, die der Anbieter TATSAECHLICH
  // bedient. glm-4.5-flash laeuft im Freikontingent. Kommt das Kontingent
  // zurueck (fruehestens 10.09.), darf glm-5.2 wieder eingetragen werden —
  // dann bleibt der Test gruen, ohne dass jemand ihn anfassen muss.
  const BEDIENT = new Set(["glm-4.5-flash", "glm-5.2", "glm-4.6", "glm-4.5-air"]);
  const z = providerBackendFromEnv("zhipu", { SMEJJ_LLM_ZHIPU_API_KEY: "k" }, "coding");
  assert.ok(BEDIENT.has(z.model), `unbekanntes zhipu-Modell: ${z.model}`);
  // Der heutige Stand, damit eine stille Ruecknahme auffaellt.
  assert.equal(z.model, "glm-4.5-flash");
  // Und alle drei Profile ziehen gleich — sonst faellt eine Spur still zurueck.
  for (const profil of ["default", "coding", "reasoning"]) {
    const b = providerBackendFromEnv("zhipu", { SMEJJ_LLM_ZHIPU_API_KEY: "k" }, profil);
    assert.ok(BEDIENT.has(b.model), `${profil}: ${b.model}`);
  }
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

test("Groq-Kette bekommt das Standardmodell als zweiten Versuch, wenn das Profil ein anderes Modell fuehrt (429 je Modell, 2026-09-02)", () => {
  const env = { SMEJJ_LLM_PROVIDER_ORDER: "groq", SMEJJ_LLM_GROQ_API_KEY: "k" };
  const fast = resolveChain("fast", env);
  assert.deepEqual(fast.map((b) => b.model), ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
  // Gleiches Modell fuer Profil und Standard: kein zweiter Eintrag (kein doppelter Aufruf).
  assert.deepEqual(resolveChain("default", env).map((b) => b.model), ["openai/gpt-oss-120b"]);
  // Ein Anbieter mit nur einem Modell bleibt bei einem Eintrag.
  const zhipu = resolveChain("fast", { SMEJJ_LLM_PROVIDER_ORDER: "zhipu", SMEJJ_LLM_ZHIPU_API_KEY: "k" });
  assert.equal(zhipu.length, 1);
});
