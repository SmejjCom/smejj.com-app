import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { privateJson, readJson } from "../http/respond.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import {
  clineChatCompletion,
  clineResponseError,
  fetchClineModels,
  isModelId,
  normalizeApiKey,
  testClineConnection
} from "../providers/clineClient.js";
import {
  disableProviderCredential,
  getProviderCredential,
  providerCredentialEncryptionConfig,
  putProviderCredential
} from "../providers/providerCredentialVault.js";
import { neueMessung, notiere } from "../llm/tokenMesser.js";

const PREFIX = "/api/providers/cline";
// ZWEI Bremsen statt einer (Betreiber-Befund 2026-08-17: "manchmal kommen
// komplette Modelle und manchmal nur 2, 3").
//
// Vorher teilten sich ALLE Wege einen Eimer mit Kapazitaet 12 und 0,2/s
// Nachfuellung. /chat kostet 2 — nach sechs Nachrichten in einer Minute war
// der Eimer leer, und dann bekam auch das Modell-MENUE ein 429. Fuer den
// Betreiber sah das aus wie "die Liste ist kaputt".
//
// Das Lesen (status, models) belastet Cline gar nicht — der Katalog kommt
// aus dem Server-Cache, der Status aus dem eigenen Tresor. Es braucht also
// keine scharfe Bremse, nur einen Schutz gegen Dauerfeuer.
const requestGate = createRateLimiter({ capacity: 12, refillPerSec: 0.2, maxKeys: 20_000 });
const leseGate = createRateLimiter({ capacity: 60, refillPerSec: 1, maxKeys: 20_000 });
const LESEWEGE = new Set([`${PREFIX}/status`, `${PREFIX}/models`]);

export async function handleProviderRoute(req, url, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (!url.pathname.startsWith(PREFIX)) return false;
  const subjectId = authenticatedUserId(req.authUser);
  if (!subjectId) {
    privateJson(res, 401, { ok: false, error: "authentication_required" });
    return true;
  }
  const lesend = req.method === "GET" && LESEWEGE.has(url.pathname);
  const limit = lesend
    ? leseGate.take(subjectId, 1)
    : requestGate.take(subjectId, url.pathname.endsWith("/chat") ? 2 : 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "provider_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === `${PREFIX}/status`) {
      await status(subjectId, res, env);
      return true;
    }
    if (req.method === "GET" && url.pathname === `${PREFIX}/models`) {
      const catalog = await fetchClineModels({ fetchImpl });
      privateJson(res, 200, { ok: true, provider: "cline", ...catalog });
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/credentials`) {
      await saveCredential(subjectId, req, res, env, fetchImpl);
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/select`) {
      await selectModel(subjectId, req, res, env, fetchImpl);
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/test`) {
      await testStoredCredential(subjectId, res, env, fetchImpl);
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/remove`) {
      await disableProviderCredential(subjectId, "cline", env);
      privateJson(res, 200, { ok: true, provider: "cline", configured: false });
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/chat`) {
      await streamChat(subjectId, req, res, env, fetchImpl);
      return true;
    }
    privateJson(res, 404, { ok: false, error: "provider_route_not_found" });
    return true;
  } catch (error) {
    const mapped = mapError(error);
    privateJson(res, mapped.status, mapped.body);
    return true;
  }
}

async function status(subjectId, res, env) {
  const encryption = providerCredentialEncryptionConfig(env);
  if (!encryption.ready) {
    return privateJson(res, 503, {
      ok: false,
      provider: "cline",
      configured: false,
      error: "provider_credential_encryption_not_configured"
    });
  }
  const record = await getProviderCredential(subjectId, "cline", env);
  return privateJson(res, 200, {
    ok: true,
    provider: "cline",
    configured: record?.enabled === true && Boolean(record.apiKey),
    selectedModel: record?.selectedModel || "",
    keyHint: record?.keyLast4 ? `••••${record.keyLast4}` : "",
    lastTestedAt: record?.lastTestedAt || null,
    storage: record?.storage || "encrypted",
    capabilities: ["streaming", "tools", "reasoning", "images", "autonomous-coding"]
  });
}

async function saveCredential(subjectId, req, res, env, fetchImpl) {
  const body = await readJson(req);
  const apiKey = normalizeApiKey(body.apiKey);
  const catalog = await fetchClineModels({ fetchImpl });
  const selectedModel = resolveCatalogModel(body.selectedModel, catalog.models);
  const connection = await testClineConnection(apiKey, { selectedModel, fetchImpl });
  const storageResult = await putProviderCredential(subjectId, "cline", {
    enabled: true,
    apiKey,
    selectedModel,
    keyLast4: apiKey.slice(-4),
    lastTestedAt: connection.testedAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, env);
  return privateJson(res, 201, {
    ok: true,
    provider: "cline",
    configured: true,
    selectedModel,
    keyHint: `••••${apiKey.slice(-4)}`,
    connection,
    storage: storageResult.storage
  });
}

async function selectModel(subjectId, req, res, env, fetchImpl) {
  const body = await readJson(req);
  const record = await requireCredential(subjectId, env);
  const catalog = await fetchClineModels({ fetchImpl });
  const selectedModel = resolveCatalogModel(body.model, catalog.models, { requireInput: true });
  await putProviderCredential(subjectId, "cline", {
    ...record,
    selectedModel,
    updatedAt: new Date().toISOString()
  }, env);
  return privateJson(res, 200, { ok: true, provider: "cline", selectedModel, restartRequired: false });
}

async function testStoredCredential(subjectId, res, env, fetchImpl) {
  const record = await requireCredential(subjectId, env);
  const connection = await testClineConnection(record.apiKey, { selectedModel: record.selectedModel, fetchImpl });
  await putProviderCredential(subjectId, "cline", {
    ...record,
    lastTestedAt: connection.testedAt,
    updatedAt: new Date().toISOString()
  }, env);
  return privateJson(res, 200, { ok: true, provider: "cline", connection });
}

async function streamChat(subjectId, req, res, env, fetchImpl) {
  const record = await requireCredential(subjectId, env);
  const body = await readJson(req);
  const messages = sanitizeMessages(body.messages);
  if (messages.length === 0) return privateJson(res, 400, { ok: false, error: "messages_required" });
  const messgeraet = neueMessung({ spur: "cline", backend: "cline", modell: record.selectedModel, nutzer: subjectId });
  messgeraet.zaehleEingabe(messages);
  const messenAn = String(env.SMEJJ_USAGE_MESSUNG || "an").trim().toLowerCase() !== "aus";
  const anfrage = (includeUsage) => clineChatCompletion({
    apiKey: record.apiKey,
    model: record.selectedModel,
    messages,
    stream: true,
    temperature: 0.7,
    maxTokens: 8_192,
    fetchImpl,
    taskId: body.taskId,
    includeUsage
  });
  let response = await anfrage(messenAn);
  // Lehnt der Anbieter stream_options ab, wird EINMAL ohne wiederholt. Der Chat
  // geht vor der Messung — dieselbe Regel wie im Modell-Router.
  if (messenAn && response.status === 400) response = await anfrage(false);
  if (!response.ok || !response.body) throw await clineResponseError(response);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    Connection: "keep-alive",
    "x-smejj-model-backend": `cline:${record.selectedModel}`,
    "x-smejj-provider-request-id": response.headers.get("x-request-id") || ""
  });
  const reader = response.body.getReader();
  // Mitlesen, nicht eingreifen: die Bytes gehen unveraendert an den Client, ein
  // Abgriff sucht nur den usage-Block. Ein Fehler beim Messen darf den Chat
  // niemals stoeren — deshalb steckt das Parsen in seinem eigenen try.
  const abgriff = neuerUsageAbgriff(messgeraet);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
      abgriff.lies(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
    notiere(messgeraet.fertig(), { env });
  }
}

/**
 * Liest einen SSE-Bytestrom mit und meldet gefundene usage-Bloecke ans
 * Messgeraet. Reiner Beobachter: er schreibt nichts und wirft nichts.
 */
function neuerUsageAbgriff(messgeraet) {
  const decoder = new TextDecoder();
  let puffer = "";
  return {
    lies(bytes) {
      try {
        puffer += decoder.decode(bytes, { stream: true });
        let trenner = puffer.indexOf("\n\n");
        while (trenner !== -1) {
          const ereignis = puffer.slice(0, trenner);
          puffer = puffer.slice(trenner + 2);
          const zeile = ereignis.split("\n").find((eintrag) => eintrag.startsWith("data: "));
          const nutzlast = zeile ? zeile.slice(6) : "";
          if (nutzlast && nutzlast !== "[DONE]" && nutzlast.includes("\"usage\"")) {
            messgeraet.lies(JSON.parse(nutzlast));
          }
          trenner = puffer.indexOf("\n\n");
        }
        // Der Puffer waechst sonst unbegrenzt, wenn ein Anbieter andere Trenner nutzt.
        if (puffer.length > 64_000) puffer = puffer.slice(-8_000);
      } catch {
        // Messen ist Beiwerk. Ein kaputtes Ereignis bleibt ungezaehlt.
      }
    }
  };
}

async function requireCredential(subjectId, env) {
  const record = await getProviderCredential(subjectId, "cline", env);
  if (!record?.enabled || !record.apiKey || !isModelId(record.selectedModel)) {
    const error = new Error("cline_not_configured");
    error.status = 409;
    throw error;
  }
  return record;
}

function resolveCatalogModel(value, models, { requireInput = false } = {}) {
  const requested = String(value || "").trim();
  if (requested && models.some((model) => model.id === requested)) return requested;
  if (requested || requireInput) {
    const error = new Error("cline_model_not_in_catalog");
    error.status = 400;
    throw error;
  }
  const fallback = models.find((model) => model.category === "cline-pass")?.id
    || models.find((model) => model.category === "free")?.id
    || models[0]?.id;
  if (!fallback) throw new Error("cline_model_catalog_empty");
  return fallback;
}

function sanitizeMessages(value) {
  const input = Array.isArray(value) ? value.slice(-32) : [];
  let textBudget = 120_000;
  let imageBudget = 8_000_000;
  const result = [];
  for (const message of input) {
    const role = String(message?.role || "");
    if (!["system", "user", "assistant", "tool"].includes(role)) continue;
    const item = { role };
    if (typeof message.content === "string") {
      item.content = message.content.slice(0, textBudget);
      textBudget -= item.content.length;
    } else if (Array.isArray(message.content)) {
      item.content = [];
      for (const part of message.content.slice(0, 12)) {
        if (part?.type === "text") {
          const text = String(part.text || "").slice(0, textBudget);
          textBudget -= text.length;
          if (text) item.content.push({ type: "text", text });
        }
        if (part?.type === "image_url") {
          const imageUrl = String(part.image_url?.url || "");
          if (isSafeImageDataUrl(imageUrl) && imageUrl.length <= imageBudget) {
            imageBudget -= imageUrl.length;
            item.content.push({ type: "image_url", image_url: { url: imageUrl } });
          }
        }
      }
    } else continue;
    if (role === "tool") item.tool_call_id = String(message.tool_call_id || "").slice(0, 160);
    result.push(item);
    if (textBudget <= 0 || imageBudget <= 0) break;
  }
  return result;
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function mapError(error) {
  const status = Number(error?.status || 0);
  if (error?.name === "ClineApiError") {
    const safeStatus = [400, 401, 402, 403, 404, 429, 500, 502, 503].includes(status) ? status : 502;
    return {
      status: safeStatus,
      body: {
        ok: false,
        error: status === 401 ? "cline_api_key_rejected"
          : status === 402 ? "cline_insufficient_credits"
            : status === 429 ? "cline_rate_limit"
              : "cline_api_error",
        providerStatus: status,
        code: error.code || "",
        message: String(error.message || "Cline API error").slice(0, 500),
        requestId: error.requestId || ""
      }
    };
  }
  const safeStatus = [400, 409, 429, 503].includes(status) ? status : 503;
  return {
    status: safeStatus,
    body: { ok: false, error: String(error?.message || "provider_unavailable").slice(0, 160) }
  };
}
