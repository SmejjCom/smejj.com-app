import { getProviderDefinition } from "./providerRegistry.js";

const CLINE = getProviderDefinition("cline");
const RETRYABLE = new Set([429, 500, 502, 503]);

let catalogCache = null;

export async function fetchClineModels({ fetchImpl = fetch, signal } = {}) {
  try {
    const response = await fetchImpl(CLINE.catalogUrl, {
      headers: { Accept: "application/json", "X-Title": "smejj.com" },
      signal: signal || timeoutSignal(10_000)
    });
    if (!response.ok) throw clineError(response, await safeJson(response));
    const payload = await response.json();
    const groups = ["recommended", "free", "clinePass"];
    const models = [];
    const seen = new Set();
    for (const group of groups) {
      for (const item of Array.isArray(payload?.[group]) ? payload[group] : []) {
        const id = String(item?.id || "").trim();
        if (!isModelId(id) || seen.has(id)) continue;
        seen.add(id);
        models.push({
          id,
          name: String(item.name || id).slice(0, 160),
          description: String(item.description || "").slice(0, 500),
          category: group === "clinePass" ? "cline-pass" : group,
          tags: (Array.isArray(item.tags) ? item.tags : []).map((tag) => String(tag).slice(0, 40)).slice(0, 8)
        });
      }
    }
    const result = { models, fetchedAt: new Date().toISOString(), source: CLINE.catalogUrl, stale: false };
    if (models.length > 0) catalogCache = result;
    return result;
  } catch (error) {
    if (catalogCache) return { ...catalogCache, stale: true };
    throw error;
  }
}

export function __clearClineCatalogCacheForTests() {
  catalogCache = null;
}

export async function testClineConnection(apiKey, { selectedModel = "", fetchImpl = fetch } = {}) {
  const key = normalizeApiKey(apiKey);
  const catalog = await fetchClineModels({ fetchImpl });
  // Betreiber-Befund 2026-08-17: die Gratis-Modelle liefert Cline nur noch
  // an eigene Apps aus ("Error 403: … only available via Cline product
  // surfaces") — ein Test damit scheitert IMMER. Getestet wird darum das
  // GEWAEHLTE Modell, sonst ein empfohlenes; Gratis nur als letzte Reserve.
  const testModel = (selectedModel && catalog.models.some((model) => model.id === selectedModel) ? selectedModel : "")
    || catalog.models.find((model) => model.category === "recommended")?.id
    || catalog.models.find((model) => model.category === "cline-pass")?.id
    || catalog.models[0]?.id;
  if (!testModel) throw new Error("cline_model_catalog_empty");
  const response = await clineChatCompletion({
    apiKey: key,
    model: testModel,
    messages: [{ role: "user", content: "Reply with OK." }],
    stream: false,
    // GPT-5.6 lehnte 4 ab ("max_output_tokens below minimum", live 2026-08-17):
    // Reasoning-Modelle verlangen ein hoeheres Minimum. 64 ist ueberall gueltig
    // und kostet beim Test trotzdem nur Bruchteile eines Cents.
    maxTokens: 64,
    fetchImpl
  });
  const payload = await safeJson(response);
  if (!response.ok) throw clineError(response, payload);
  return {
    ok: true,
    testedModel: testModel,
    modelCount: catalog.models.length,
    requestId: response.headers.get("x-request-id") || "",
    testedAt: new Date().toISOString()
  };
}

export async function clineChatCompletion({
  apiKey,
  model,
  messages,
  stream = true,
  tools,
  toolChoice,
  temperature,
  maxTokens,
  fetchImpl = fetch,
  taskId = ""
} = {}) {
  const key = normalizeApiKey(apiKey);
  if (!isModelId(model)) throw new Error("cline_model_id_invalid");
  const body = { model, messages, stream: stream === true };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (Number.isFinite(Number(temperature))) body.temperature = Number(temperature);
  if (Number.isFinite(Number(maxTokens))) body.max_tokens = Math.max(1, Math.min(16_000, Math.floor(Number(maxTokens))));
  let lastResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResponse = await fetchImpl(`${CLINE.baseUrl}/chat/completions`, {
      method: "POST",
      signal: timeoutSignal(stream ? 180_000 : 90_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://smejj.com",
        "X-Title": "smejj.com",
        ...(taskId ? { "X-Task-ID": String(taskId).slice(0, 160) } : {})
      },
      body: JSON.stringify(body)
    });
    if (lastResponse.ok || !RETRYABLE.has(lastResponse.status) || attempt === 2) return lastResponse;
    await delay(250 * (2 ** attempt));
  }
  return lastResponse;
}

export function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (key.length < 16 || key.length > 512 || /[\u0000-\u0020\u007f]/.test(key)) {
    throw new Error("cline_api_key_invalid");
  }
  return key;
}

export function isModelId(value) {
  const id = String(value || "").trim();
  return id.length >= 3 && id.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]+$/.test(id);
}

export async function clineResponseError(response) {
  return clineError(response, await safeJson(response));
}

function clineError(response, payload) {
  const error = new Error(String(payload?.error?.message || payload?.error || `Cline API HTTP ${response.status}`).slice(0, 500));
  error.name = "ClineApiError";
  error.status = response.status;
  error.code = String(payload?.error?.code || response.status).slice(0, 80);
  error.requestId = response.headers?.get?.("x-request-id") || "";
  return error;
}

async function safeJson(response) {
  try { return await response.clone().json(); } catch { return {}; }
}

function timeoutSignal(milliseconds) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(milliseconds) : undefined;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
