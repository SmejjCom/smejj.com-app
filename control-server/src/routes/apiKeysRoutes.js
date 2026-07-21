// smejj.com — Generische Multi-Anbieter-API-Keys (BYOK, OpenRouter-Stil).
// Mehrere Keys pro Nutzer, AES-256-GCM verschlüsselt im bestehenden
// Credential-Vault, maskierte Anzeige, Test vor dem Speichern, Modellwahl ohne
// Neustart. Additiv neben /api/providers/cline — bricht dessen Routen nicht.
// Fail-closed: ohne Auth/Encryption/gültigen Key wird sauber abgewiesen.
import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { privateJson, readJson } from "../http/respond.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import {
  disableProviderCredential,
  getProviderCredential,
  providerCredentialEncryptionConfig,
  putProviderCredential
} from "../providers/providerCredentialVault.js";
import {
  assertSafeProviderBaseUrl,
  isCatalogProvider,
  resolveProviderBaseUrl
} from "../providers/genericProviderCatalog.js";
import {
  fetchProviderModels,
  isModelId,
  normalizeApiKey,
  providerApiError,
  providerChatCompletion,
  testProviderConnection
} from "../providers/genericOpenAiClient.js";

const PREFIX = "/api/keys";
const INDEX_ID = "smejj-key-index"; // reservierte ID: nur nutzerinterner Anbieter-Index
const requestGate = createRateLimiter({ capacity: 20, refillPerSec: 0.25, maxKeys: 20_000 });

export async function handleApiKeysRoute(req, url, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
  const subjectId = authenticatedUserId(req.authUser);
  if (!subjectId) {
    privateJson(res, 401, { ok: false, error: "authentication_required" });
    return true;
  }
  const cost = url.pathname.endsWith("/chat") ? 2 : 1;
  const limit = requestGate.take(subjectId, cost);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "provider_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  try {
    const encryption = providerCredentialEncryptionConfig(env);
    if (!encryption.ready) {
      privateJson(res, 503, { ok: false, error: "provider_credential_encryption_not_configured" });
      return true;
    }
    const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");
    const [segment, action] = rest.split("/");

    if (req.method === "GET" && rest === "") return await listKeys(subjectId, res, env), true;
    if (req.method === "POST" && rest === "") return await addKey(subjectId, req, res, env, fetchImpl), true;
    if (req.method === "POST" && rest === "active") return await setActive(subjectId, req, res, env), true;

    const providerId = safeRouteProviderId(segment);
    if (!providerId) return privateJson(res, 404, { ok: false, error: "provider_route_not_found" }), true;

    if (req.method === "GET" && action === "models") return await listModels(subjectId, providerId, res, env, fetchImpl), true;
    if (req.method === "POST" && action === "test") return await testStored(subjectId, providerId, res, env, fetchImpl), true;
    if (req.method === "POST" && action === "select") return await selectModel(subjectId, providerId, req, res, env), true;
    if (req.method === "POST" && action === "remove") return await removeKey(subjectId, providerId, res, env), true;
    if (req.method === "POST" && action === "chat") return await streamChat(subjectId, providerId, req, res, env, fetchImpl), true;

    privateJson(res, 404, { ok: false, error: "provider_route_not_found" });
    return true;
  } catch (error) {
    const mapped = mapError(error);
    privateJson(res, mapped.status, mapped.body);
    return true;
  }
}

// ---- Anbieter-Index (nutzerintern, ohne Secrets) -----------------------------

async function readIndex(subjectId, env) {
  const record = await getProviderCredential(subjectId, INDEX_ID, env).catch(() => null);
  const providers = Array.isArray(record?.providers) ? record.providers : [];
  return { providers, activeProviderId: record?.activeProviderId || "", activeModel: record?.activeModel || "" };
}

async function writeIndex(subjectId, index, env) {
  await putProviderCredential(subjectId, INDEX_ID, {
    enabled: true,
    apiKey: "",
    providers: index.providers.slice(0, 60),
    activeProviderId: index.activeProviderId || "",
    activeModel: index.activeModel || "",
    updatedAt: new Date().toISOString()
  }, env);
}

function upsertIndexEntry(index, entry) {
  const others = index.providers.filter((item) => item.id !== entry.id);
  return { ...index, providers: [...others, entry] };
}

// ---- Routen-Handler ----------------------------------------------------------

async function listKeys(subjectId, res, env) {
  const index = await readIndex(subjectId, env);
  return privateJson(res, 200, {
    ok: true,
    activeProviderId: index.activeProviderId,
    activeModel: index.activeModel,
    providers: index.providers.map(maskEntry)
  });
}

async function addKey(subjectId, req, res, env, fetchImpl) {
  const body = await readJson(req);
  const providerId = deriveProviderId(body);
  const custom = !isCatalogProvider(providerId);
  const storedBaseUrl = custom ? assertSafeProviderBaseUrl(body.baseUrl, { allowCustom: true }) : "";
  const baseUrl = resolveProviderBaseUrl(providerId, storedBaseUrl);
  const apiKey = normalizeApiKey(body.apiKey);
  const selectedModel = normalizeSelectedModel(body.selectedModel);
  const connection = await testProviderConnection({ baseUrl, apiKey, selectedModel, fetchImpl });
  const nowIso = new Date().toISOString();
  await putProviderCredential(subjectId, providerId, {
    enabled: true,
    apiKey,
    baseUrl: storedBaseUrl,
    custom,
    selectedModel: selectedModel || connection.testedModel || "",
    keyLast4: apiKey.slice(-4),
    lastTestedAt: connection.testedAt,
    createdAt: nowIso,
    updatedAt: nowIso
  }, env);

  let index = await readIndex(subjectId, env);
  index = upsertIndexEntry(index, {
    id: providerId,
    name: safeName(body.name) || defaultName(providerId, body.name),
    custom,
    baseUrl: storedBaseUrl,
    keyLast4: apiKey.slice(-4),
    selectedModel: selectedModel || connection.testedModel || "",
    status: "active",
    lastTestedAt: connection.testedAt,
    modelCount: connection.modelCount,
    createdAt: nowIso
  });
  if (!index.activeProviderId) { index.activeProviderId = providerId; index.activeModel = selectedModel || connection.testedModel || ""; }
  await writeIndex(subjectId, index, env);

  return privateJson(res, 201, {
    ok: true,
    provider: providerId,
    configured: true,
    keyHint: `••••${apiKey.slice(-4)}`,
    selectedModel: selectedModel || connection.testedModel || "",
    connection
  });
}

async function listModels(subjectId, providerId, res, env, fetchImpl) {
  const record = await requireCredential(subjectId, providerId, env);
  const baseUrl = resolveProviderBaseUrl(providerId, record.baseUrl);
  const catalog = await fetchProviderModels({ baseUrl, apiKey: record.apiKey, fetchImpl });
  return privateJson(res, 200, { ok: true, provider: providerId, models: catalog.models, selectedModel: record.selectedModel || "" });
}

async function testStored(subjectId, providerId, res, env, fetchImpl) {
  const record = await requireCredential(subjectId, providerId, env);
  const baseUrl = resolveProviderBaseUrl(providerId, record.baseUrl);
  const connection = await testProviderConnection({ baseUrl, apiKey: record.apiKey, selectedModel: record.selectedModel, fetchImpl });
  await putProviderCredential(subjectId, providerId, { ...record, lastTestedAt: connection.testedAt, updatedAt: new Date().toISOString() }, env);
  let index = await readIndex(subjectId, env);
  index = upsertIndexEntry(index, { ...(index.providers.find((p) => p.id === providerId) || { id: providerId }), status: "active", lastTestedAt: connection.testedAt });
  await writeIndex(subjectId, index, env);
  return privateJson(res, 200, { ok: true, provider: providerId, connection });
}

async function selectModel(subjectId, providerId, req, res, env) {
  const body = await readJson(req);
  const model = normalizeSelectedModel(body.model);
  if (!model) return privateJson(res, 400, { ok: false, error: "model_required" });
  const record = await requireCredential(subjectId, providerId, env);
  await putProviderCredential(subjectId, providerId, { ...record, selectedModel: model, updatedAt: new Date().toISOString() }, env);
  let index = await readIndex(subjectId, env);
  const entry = index.providers.find((p) => p.id === providerId) || { id: providerId };
  index = upsertIndexEntry(index, { ...entry, selectedModel: model });
  index.activeProviderId = providerId;
  index.activeModel = model;
  await writeIndex(subjectId, index, env);
  return privateJson(res, 200, { ok: true, provider: providerId, selectedModel: model, restartRequired: false });
}

async function setActive(subjectId, req, res, env) {
  const body = await readJson(req);
  const providerId = safeRouteProviderId(body.provider);
  const model = normalizeSelectedModel(body.model);
  if (!providerId || !model) return privateJson(res, 400, { ok: false, error: "provider_and_model_required" });
  const index = await readIndex(subjectId, env);
  if (!index.providers.some((p) => p.id === providerId)) return privateJson(res, 404, { ok: false, error: "provider_not_configured" });
  index.activeProviderId = providerId;
  index.activeModel = model;
  await writeIndex(subjectId, index, env);
  return privateJson(res, 200, { ok: true, activeProviderId: providerId, activeModel: model, restartRequired: false });
}

async function removeKey(subjectId, providerId, res, env) {
  await disableProviderCredential(subjectId, providerId, env);
  const index = await readIndex(subjectId, env);
  index.providers = index.providers.filter((p) => p.id !== providerId);
  if (index.activeProviderId === providerId) { index.activeProviderId = ""; index.activeModel = ""; }
  await writeIndex(subjectId, index, env);
  return privateJson(res, 200, { ok: true, provider: providerId, configured: false });
}

async function streamChat(subjectId, providerId, req, res, env, fetchImpl) {
  const record = await requireCredential(subjectId, providerId, env);
  const baseUrl = resolveProviderBaseUrl(providerId, record.baseUrl);
  const body = await readJson(req);
  const messages = sanitizeMessages(body.messages);
  if (messages.length === 0) return privateJson(res, 400, { ok: false, error: "messages_required" });
  const model = normalizeSelectedModel(body.model) || record.selectedModel;
  if (!isModelId(model)) return privateJson(res, 409, { ok: false, error: "provider_model_not_selected" });
  const response = await providerChatCompletion({ baseUrl, apiKey: record.apiKey, model, messages, stream: true, fetchImpl });
  if (!response.ok || !response.body) throw await providerApiError(response);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    Connection: "keep-alive",
    "x-smejj-model-backend": `${providerId}:${model}`
  });
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

// ---- Helfer ------------------------------------------------------------------

async function requireCredential(subjectId, providerId, env) {
  const record = await getProviderCredential(subjectId, providerId, env);
  if (!record?.enabled || !record.apiKey) {
    const error = new Error("provider_not_configured");
    error.status = 409;
    throw error;
  }
  return record;
}

function maskEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    custom: entry.custom === true,
    keyHint: entry.keyLast4 ? `••••${entry.keyLast4}` : "",
    selectedModel: entry.selectedModel || "",
    status: entry.status || "active",
    lastTestedAt: entry.lastTestedAt || null,
    modelCount: entry.modelCount || 0,
    baseUrl: entry.custom ? entry.baseUrl || "" : ""
  };
}

function deriveProviderId(body) {
  const requested = String(body?.providerId || "").trim().toLowerCase();
  if (isCatalogProvider(requested)) return requested;
  // Eigener Anbieter: sichere, kollisionsfreie ID aus dem Namen ableiten.
  const slug = String(body?.name || body?.providerId || "custom")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "custom";
  const id = `custom-${slug}-${Date.now().toString(36).slice(-5)}`;
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) return `custom-${Date.now().toString(36).slice(-8)}`;
  return id;
}

function safeRouteProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (id === INDEX_ID) return "";
  return /^[a-z][a-z0-9-]{1,40}$/.test(id) ? id : "";
}

function normalizeSelectedModel(value) {
  const model = String(value || "").trim();
  return isModelId(model) ? model : "";
}

function safeName(value) {
  const name = String(value || "").trim().slice(0, 60);
  return /[<>]/.test(name) ? "" : name;
}

function defaultName(providerId, rawName) {
  const base = safeName(rawName) || providerId;
  const date = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${base} · ${date}`;
}

function sanitizeMessages(value) {
  const input = Array.isArray(value) ? value.slice(-32) : [];
  let textBudget = 120_000;
  const result = [];
  for (const message of input) {
    const role = String(message?.role || "");
    if (!["system", "user", "assistant", "tool"].includes(role)) continue;
    const item = { role };
    if (typeof message.content === "string") {
      item.content = message.content.slice(0, textBudget);
      textBudget -= item.content.length;
    } else continue;
    if (role === "tool") item.tool_call_id = String(message.tool_call_id || "").slice(0, 160);
    result.push(item);
    if (textBudget <= 0) break;
  }
  return result;
}

function mapError(error) {
  const status = Number(error?.status || 0);
  if (error?.name === "ProviderApiError") {
    const safeStatus = [400, 401, 402, 403, 404, 429, 500, 502, 503].includes(status) ? status : 502;
    return {
      status: safeStatus,
      body: {
        ok: false,
        error: status === 401 ? "provider_api_key_rejected"
          : status === 402 ? "provider_insufficient_credits"
            : status === 429 ? "provider_rate_limit"
              : "provider_api_error",
        providerStatus: status,
        message: String(error.message || "provider error").slice(0, 400),
        requestId: error.requestId || ""
      }
    };
  }
  const safeStatus = [400, 403, 409, 429, 503].includes(status) ? status : 503;
  return { status: safeStatus, body: { ok: false, error: String(error?.code || error?.message || "provider_unavailable").slice(0, 160) } };
}
