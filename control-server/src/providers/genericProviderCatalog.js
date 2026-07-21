// smejj.com — Serverseitiger Anbieter-Katalog für den generischen BYOK-Router.
// Spiegelt public/ai/providers-catalog.js (Firma über Modell) und liefert
// zusätzlich die für den Server nötige SSRF-Absicherung: nur https, keine
// Zugangsdaten in der URL, keine privaten/Loopback-Hosts bei eigenen Anbietern.
// Fail-closed: unbekannte oder unsichere Endpunkte werden abgewiesen.

export const SERVER_PROVIDER_CATALOG = Object.freeze({
  openai: { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  openrouter: { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  google: { id: "google", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  mistral: { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  deepseek: { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  zai: { id: "zai", name: "z.ai", baseUrl: "https://api.z.ai/api/paas/v4" }
});

const PRIVATE_HOST = /^(?:localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fe80:|\[?fc|\[?fd)/i;

// Genehmigt einen Anbieter-Basisendpunkt für serverseitige Aufrufe.
// requireCatalogHost=true erzwingt einen bekannten Katalog-Host (Standard);
// für "eigene Anbieter" wird ein sicherer https-Host ohne private IPs erlaubt.
export function assertSafeProviderBaseUrl(baseUrl, { allowCustom = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(baseUrl || ""));
  } catch {
    throw providerError("provider_base_url_invalid", 400);
  }
  if (parsed.protocol !== "https:") throw providerError("provider_https_required", 400);
  if (parsed.username || parsed.password) throw providerError("provider_url_credentials_not_allowed", 400);
  const host = parsed.hostname.toLowerCase();
  const catalogHosts = new Set(
    Object.values(SERVER_PROVIDER_CATALOG).map((entry) => new URL(entry.baseUrl).hostname.toLowerCase())
  );
  if (catalogHosts.has(host)) return normalizeBase(parsed);
  if (!allowCustom) throw providerError("provider_endpoint_not_allowlisted", 400);
  if (PRIVATE_HOST.test(host)) throw providerError("provider_private_host_not_allowed", 400);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw providerError("provider_host_invalid", 400);
  return normalizeBase(parsed);
}

// Liefert den serverseitig autorisierten Basisendpunkt für eine Anbieter-ID.
// Für bekannte Katalog-Anbieter aus dem Katalog; für eigene Anbieter aus dem
// (vorher geprüften) gespeicherten baseUrl.
export function resolveProviderBaseUrl(providerId, storedBaseUrl = "") {
  const known = SERVER_PROVIDER_CATALOG[String(providerId || "").trim().toLowerCase()];
  if (known) return assertSafeProviderBaseUrl(known.baseUrl);
  return assertSafeProviderBaseUrl(storedBaseUrl, { allowCustom: true });
}

export function isCatalogProvider(providerId) {
  return Boolean(SERVER_PROVIDER_CATALOG[String(providerId || "").trim().toLowerCase()]);
}

function normalizeBase(parsed) {
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function providerError(code, status) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}
