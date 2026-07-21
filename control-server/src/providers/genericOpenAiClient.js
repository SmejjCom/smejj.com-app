// smejj.com — Generischer OpenAI-kompatibler Anbieter-Client (BYOK).
// Vorbild ist clineClient.js, verallgemeinert auf jeden OpenAI-kompatiblen
// Endpoint (/models, /chat/completions). Der Key wird pro Aufruf übergeben und
// niemals hier gespeichert oder geloggt. Fehler werden auf sichere Codes
// abgebildet (401/402/429/…), fail-closed ohne kostenpflichtige Fallbacks.

const RETRYABLE = new Set([429, 500, 502, 503]);

// Listet Modelle eines Anbieters (OpenAI-kompatibel: GET {base}/models).
export async function fetchProviderModels({ baseUrl, apiKey, fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(`${baseUrl}/models`, {
    headers: authHeaders(apiKey),
    signal: signal || timeoutSignal(12_000)
  });
  if (!response.ok) throw await providerApiError(response);
  const payload = await response.json().catch(() => ({}));
  const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const models = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item?.id || item?.name || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, name: String(item?.name || id).slice(0, 160), category: "available" });
  }
  return { models: models.slice(0, 500), fetchedAt: new Date().toISOString() };
}

// Testet einen Key gegen den Anbieter, bevor er verschlüsselt gespeichert wird.
// Bevorzugt /models (leichtgewichtig); fällt auf eine Mini-Chat-Anfrage zurück,
// falls der Anbieter kein /models anbietet.
export async function testProviderConnection({ baseUrl, apiKey, selectedModel = "", fetchImpl = fetch } = {}) {
  const key = normalizeApiKey(apiKey);
  try {
    const catalog = await fetchProviderModels({ baseUrl, apiKey: key, fetchImpl });
    return {
      ok: true,
      testedAt: new Date().toISOString(),
      method: "models",
      modelCount: catalog.models.length,
      testedModel: selectedModel || catalog.models[0]?.id || ""
    };
  } catch (error) {
    if (Number(error?.status) === 404) {
      const model = selectedModel || "gpt-4o-mini";
      const response = await providerChatCompletion({
        baseUrl, apiKey: key, model,
        messages: [{ role: "user", content: "Reply with OK." }],
        stream: false, maxTokens: 4, fetchImpl
      });
      if (!response.ok) throw await providerApiError(response);
      return { ok: true, testedAt: new Date().toISOString(), method: "chat", modelCount: 0, testedModel: model };
    }
    throw error;
  }
}

// OpenAI-kompatible Chat-Completion (Streaming oder JSON).
export async function providerChatCompletion({
  baseUrl, apiKey, model, messages, stream = false,
  temperature = 0.7, maxTokens = 8_192, fetchImpl = fetch, signal
} = {}) {
  const body = {
    model,
    messages,
    stream,
    temperature,
    max_tokens: maxTokens
  };
  return fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal || timeoutSignal(stream ? 120_000 : 45_000)
  });
}

export function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) {
    const error = new Error("provider_api_key_invalid");
    error.status = 400;
    error.code = "provider_api_key_invalid";
    throw error;
  }
  return key;
}

export function isModelId(value) {
  return /^[A-Za-z0-9._:/-]{1,160}$/.test(String(value || ""));
}

export async function providerApiError(response) {
  const payload = await response.json().catch(() => ({}));
  const error = new Error(String(payload?.error?.message || payload?.message || `provider HTTP ${response.status}`).slice(0, 400));
  error.name = "ProviderApiError";
  error.status = response.status;
  error.retryable = RETRYABLE.has(response.status);
  error.requestId = response.headers.get("x-request-id") || "";
  return error;
}

function authHeaders(apiKey) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${String(apiKey || "").trim()}`,
    "X-Title": "smejj.com",
    "HTTP-Referer": "https://smejj.com"
  };
}

function timeoutSignal(ms) {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}
