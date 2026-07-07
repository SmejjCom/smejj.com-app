// smejj.com — Multi-Modell-Router: EIN einheitlicher OpenAI-kompatibler Adapter
// fuer alle Backends. Prioritaetskette pro Aufgabenprofil, Fallback bei Fehlern,
// fail-closed ohne Konfiguration. Keine Keys im Code — alles aus der Umgebung.
//
// Backends (in Prioritaetsreihenfolge, nur wenn konfiguriert):
//   1. salad      — eigener GPU-Endpoint (SaladCloud Container Gateway, z. B. Qwen3 8B/TGI)
//   2. openrouter — Multi-Modell-Router (GPT, Claude, Gemini, DeepSeek, Kimi, GLM, ...)
//   3. custom     — generischer OpenAI-kompatibler Endpoint (SMEJJ_LLM_* / lokaler GLM-Server)
//
// Profile: coding | reasoning | fast | default — steuern nur die Modellwahl je Backend.
// GLM-5.2 bleibt laut Konzept das Qualitaetsmodell; dieser Router macht smejj.com
// unabhaengig von einem einzelnen Anbieter, ersetzt aber nicht die GLM-Strategie.

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const ROUTING_PROFILES = Object.freeze(["coding", "reasoning", "fast", "default"]);

// Konservative, jederzeit per Env uebersteuerbare Modell-Defaults fuer OpenRouter.
const OPENROUTER_DEFAULT_MODELS = Object.freeze({
  coding: "deepseek/deepseek-chat",
  reasoning: "deepseek/deepseek-reasoner",
  fast: "google/gemini-2.5-flash",
  default: "deepseek/deepseek-chat"
});

function trimUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function secretList(primary, listValue) {
  const values = [
    String(primary || "").trim(),
    ...String(listValue || "").split(/[\n,]+/).map((value) => value.trim())
  ].filter(Boolean);
  return [...new Set(values)];
}

function withKeyPool(backend, keys) {
  return keys.map((apiKey, index) => ({
    ...backend,
    apiKey,
    keyIndex: index + 1
  }));
}

export function saladBackendFromEnv(env = process.env) {
  const baseUrl = trimUrl(env.SMEJJ_LLM_SALAD_BASE_URL);
  const [apiKey] = secretList(env.SMEJJ_LLM_SALAD_API_KEY, env.SMEJJ_LLM_SALAD_API_KEYS);
  if (!baseUrl || !apiKey) return null;
  return {
    name: "salad",
    baseUrl,
    apiKey,
    apiKeyHeader: "Salad-Api-Key", // Salad Gateway erwartet diesen Header statt Bearer.
    model: String(env.SMEJJ_LLM_SALAD_MODEL || "tgi").trim()
  };
}

export function saladBackendsFromEnv(env = process.env) {
  const baseUrl = trimUrl(env.SMEJJ_LLM_SALAD_BASE_URL);
  const keys = secretList(env.SMEJJ_LLM_SALAD_API_KEY, env.SMEJJ_LLM_SALAD_API_KEYS);
  if (!baseUrl || keys.length === 0) return [];
  return withKeyPool({
    name: "salad",
    baseUrl,
    apiKeyHeader: "Salad-Api-Key",
    model: String(env.SMEJJ_LLM_SALAD_MODEL || "tgi").trim()
  }, keys);
}

export function openrouterBackendFromEnv(env = process.env, profile = "default") {
  const [apiKey] = secretList(env.SMEJJ_LLM_OPENROUTER_API_KEY, env.SMEJJ_LLM_OPENROUTER_API_KEYS);
  if (!apiKey) return null;
  const overrideKey = `SMEJJ_LLM_OPENROUTER_MODEL_${profile.toUpperCase()}`;
  return {
    name: "openrouter",
    baseUrl: trimUrl(env.SMEJJ_LLM_OPENROUTER_BASE_URL) || OPENROUTER_BASE_URL,
    apiKey,
    apiKeyHeader: "Authorization",
    model: String(env[overrideKey] || OPENROUTER_DEFAULT_MODELS[profile] || OPENROUTER_DEFAULT_MODELS.default).trim(),
    extraHeaders: { "HTTP-Referer": "https://smejj.com", "X-Title": "smejj.com" }
  };
}

export function openrouterBackendsFromEnv(env = process.env, profile = "default") {
  const keys = secretList(env.SMEJJ_LLM_OPENROUTER_API_KEY, env.SMEJJ_LLM_OPENROUTER_API_KEYS);
  if (keys.length === 0) return [];
  const overrideKey = `SMEJJ_LLM_OPENROUTER_MODEL_${profile.toUpperCase()}`;
  return withKeyPool({
    name: "openrouter",
    baseUrl: trimUrl(env.SMEJJ_LLM_OPENROUTER_BASE_URL) || OPENROUTER_BASE_URL,
    apiKeyHeader: "Authorization",
    model: String(env[overrideKey] || OPENROUTER_DEFAULT_MODELS[profile] || OPENROUTER_DEFAULT_MODELS.default).trim(),
    extraHeaders: { "HTTP-Referer": "https://smejj.com", "X-Title": "smejj.com" }
  }, keys);
}

export function customBackendFromEnv(env = process.env) {
  const baseUrl = trimUrl(env.SMEJJ_LLM_BASE_URL || env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL);
  const [apiKey] = secretList(
    env.SMEJJ_LLM_API_KEY || env.OPENAI_COMPATIBLE_API_KEY || env.OPENAI_API_KEY,
    env.SMEJJ_LLM_API_KEYS || env.OPENAI_COMPATIBLE_API_KEYS || env.OPENAI_API_KEYS
  );
  const model = String(env.SMEJJ_LLM_MODEL || env.OPENAI_COMPATIBLE_MODEL || env.OPENAI_MODEL || "").trim();
  if (!baseUrl || baseUrl === "disabled" || !model || model === "disabled" || !apiKey) return null;
  return { name: "custom", baseUrl, apiKey, apiKeyHeader: "Authorization", model };
}

export function customBackendsFromEnv(env = process.env) {
  const baseUrl = trimUrl(env.SMEJJ_LLM_BASE_URL || env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL);
  const keys = secretList(
    env.SMEJJ_LLM_API_KEY || env.OPENAI_COMPATIBLE_API_KEY || env.OPENAI_API_KEY,
    env.SMEJJ_LLM_API_KEYS || env.OPENAI_COMPATIBLE_API_KEYS || env.OPENAI_API_KEYS
  );
  const model = String(env.SMEJJ_LLM_MODEL || env.OPENAI_COMPATIBLE_MODEL || env.OPENAI_MODEL || "").trim();
  if (!baseUrl || baseUrl === "disabled" || !model || model === "disabled" || keys.length === 0) return [];
  return withKeyPool({ name: "custom", baseUrl, apiKeyHeader: "Authorization", model }, keys);
}

/** Liefert die Fallback-Kette fuer ein Profil — leer, wenn nichts konfiguriert (fail-closed). */
export function resolveChain(profile = "default", env = process.env) {
  const safeProfile = ROUTING_PROFILES.includes(profile) ? profile : "default";
  return [
    ...saladBackendsFromEnv(env),
    ...openrouterBackendsFromEnv(env, safeProfile),
    ...customBackendsFromEnv(env)
  ];
}

// Ein Aufgabentext wird grob einem Profil zugeordnet (leichtgewichtig, deterministisch).
export function classifyProfile(task = "") {
  const text = String(task).toLowerCase();
  if (/\b(code|coding|bug|patch|refactor|implement|funktion|klasse|test|typescript|javascript|python)\b/.test(text)) return "coding";
  if (/\b(warum|analyse|plan|architektur|begruende|vergleiche|reasoning|beweis)\b/.test(text)) return "reasoning";
  if (text.length < 80) return "fast";
  return "default";
}

function buildHeaders(backend) {
  const headers = { "Content-Type": "application/json", ...(backend.extraHeaders || {}) };
  headers[backend.apiKeyHeader] = backend.apiKeyHeader === "Authorization" ? `Bearer ${backend.apiKey}` : backend.apiKey;
  return headers;
}

/**
 * Fuehrt die Anfrage gegen die Kette aus: erster erreichbarer Kandidat gewinnt,
 * bei HTTP-/Netzfehler wird der naechste versucht. Liefert die ROHE fetch-Response
 * des Gewinners (Streaming bleibt erhalten) plus Metadaten fuer Logging/Capsule.
 */
export async function executeWithFallback(chain, messages, { fetchImpl = fetch, stream = true, temperature } = {}) {
  const attempts = [];
  for (const backend of chain) {
    try {
      const response = await fetchImpl(`${backend.baseUrl}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(backend),
        body: JSON.stringify({
          model: backend.model,
          messages,
          stream,
          ...(temperature === undefined ? {} : { temperature })
        })
      });
      if (response.ok) {
        return { ok: true, backend: backend.name, model: backend.model, response, attempts };
      }
      attempts.push({ backend: backend.name, model: backend.model, error: `http_${response.status}` });
    } catch (error) {
      attempts.push({ backend: backend.name, model: backend.model, error: String(error?.message || error).slice(0, 120) });
    }
  }
  return { ok: false, attempts };
}
