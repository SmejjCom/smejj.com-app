import {
  getModelRuntimeConfig,
  isModelEnabled
} from "../../../src/shared/modelRegistry.js";

const RUNTIME_HEALTH = new Map();
const PROBE_CACHE = new Map();
const DEFAULT_PROBE_TTL_MS = 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

export function markModelRuntimeSuccess(backend, {
  now = new Date().toISOString(),
  source = "inference"
} = {}) {
  const modelId = auditableModelId(backend?.logicalModelId);
  if (!modelId) return;
  RUNTIME_HEALTH.set(modelId, {
    status: "ready",
    available: true,
    checkedAt: now,
    source,
    provider: safeValue(backend?.name),
    runtimeModel: safeValue(backend?.model),
    consecutiveFailures: 0,
    reason: null
  });
}

export function markModelRuntimeFailure(backend, reason, {
  now = new Date().toISOString(),
  source = "inference"
} = {}) {
  const modelId = auditableModelId(backend?.logicalModelId);
  if (!modelId) return;
  const previous = RUNTIME_HEALTH.get(modelId);
  RUNTIME_HEALTH.set(modelId, {
    status: "degraded",
    available: false,
    checkedAt: now,
    source,
    provider: safeValue(backend?.name),
    runtimeModel: safeValue(backend?.model),
    consecutiveFailures: Number(previous?.consecutiveFailures || 0) + 1,
    reason: safeReason(reason)
  });
}

export function getModelRuntimeHealthSnapshot() {
  return Object.fromEntries(
    [...RUNTIME_HEALTH.entries()].map(([modelId, health]) => [modelId, { ...health }])
  );
}

export function resetModelRuntimeHealth() {
  RUNTIME_HEALTH.clear();
  PROBE_CACHE.clear();
}

export async function refreshModelRuntimeHealth(env = process.env, {
  fetchImpl = fetch,
  force = false,
  nowMs = Date.now(),
  probeTtlMs = Number(env.SMEJJ_MODEL_HEALTH_TTL_MS || DEFAULT_PROBE_TTL_MS),
  timeoutMs = Number(env.SMEJJ_MODEL_HEALTH_TIMEOUT_MS || DEFAULT_PROBE_TIMEOUT_MS)
} = {}) {
  await probeMoonshotBalance(env, { fetchImpl, force, nowMs, probeTtlMs, timeoutMs });
  return getModelRuntimeHealthSnapshot();
}

async function probeMoonshotBalance(env, options) {
  const modelId = "kimi-k2-7";
  if (!isModelEnabled(modelId, env)) return;
  const runtime = getModelRuntimeConfig(modelId, env);
  if (!runtime?.configured || !isOfficialMoonshot(runtime.baseUrl)) return;

  const cachedAt = Number(PROBE_CACHE.get(modelId) || 0);
  const ttlMs = bounded(options.probeTtlMs, 1_000, 15 * 60_000, DEFAULT_PROBE_TTL_MS);
  if (!options.force && options.nowMs - cachedAt < ttlMs) return;
  PROBE_CACHE.set(modelId, options.nowMs);

  const backend = {
    logicalModelId: modelId,
    name: runtime.provider,
    model: runtime.runtimeModel
  };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    bounded(options.timeoutMs, 500, 15_000, DEFAULT_PROBE_TIMEOUT_MS)
  );
  try {
    const response = await options.fetchImpl(`${runtime.baseUrl}/users/me/balance`, {
      method: "GET",
      signal: controller.signal,
      headers: authHeaders(runtime)
    });
    if (!response.ok) {
      markModelRuntimeFailure(backend, `balance_http_${response.status}`, { source: "balance-probe" });
      return;
    }
    const payload = await response.json();
    const availableBalance = Number(payload?.data?.available_balance);
    if (!Number.isFinite(availableBalance) || availableBalance <= 0) {
      markModelRuntimeFailure(backend, "insufficient_balance", { source: "balance-probe" });
      return;
    }
    markModelRuntimeSuccess(backend, { source: "balance-probe" });
  } catch (error) {
    markModelRuntimeFailure(
      backend,
      error?.name === "AbortError" ? "balance_probe_timeout" : "balance_probe_unreachable",
      { source: "balance-probe" }
    );
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(runtime) {
  const header = runtime.apiKeyHeader || "Authorization";
  const key = runtime.apiKeys[0];
  return {
    Accept: "application/json",
    [header]: header === "Authorization" ? `Bearer ${key}` : key
  };
}

function isOfficialMoonshot(baseUrl) {
  try {
    return new URL(baseUrl).hostname === "api.moonshot.ai";
  } catch {
    return false;
  }
}

function auditableModelId(value) {
  const modelId = String(value || "").trim();
  return modelId && modelId !== "provider-fallback" ? modelId : "";
}

function safeReason(value) {
  const reason = String(value || "runtime_failure").toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(reason) ? reason : "runtime_failure";
}

function safeValue(value) {
  return String(value || "").trim().slice(0, 120);
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
