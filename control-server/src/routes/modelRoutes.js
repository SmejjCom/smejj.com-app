import {
  GLM_5_2_FP8_STATUS,
  KIMI_K2_7_STATUS,
  MODEL_STATUSES,
  STORAGE
} from "../../../src/shared/platform.js";
import {
  DEFAULT_MODEL_ID,
  getModelDefinition,
  getPublicModelRegistry
} from "../../../src/shared/modelRegistry.js";
import { evaluateWorkerPreflight } from "../../../src/jobs/workerPreflight.js";
import { json } from "../http/respond.js";
import {
  getModelRuntimeHealthSnapshot,
  refreshModelRuntimeHealth
} from "../llm/modelRuntimeHealth.js";
import { parseS3Keys, signedS3List } from "../storage/s3Signer.js";

export async function handleModelStatus(res, modelId, { env = process.env } = {}) {
  const model = resolveVaultStatus(modelId);
  if (!model) return json(res, 404, { ok: false, error: "Unknown model" });
  await refreshModelRuntimeHealth(env);
  const result = await readModelStatus(model, env);
  const registry = getPublicModelRegistry(env, getModelRuntimeHealthSnapshot());
  return json(res, 200, {
    ...result,
    runtime: registry.models.find((item) => item.id === getModelDefinition(modelId)?.id) || null
  });
}

export async function handleModelsStatus(res, { env = process.env } = {}) {
  const results = await Promise.all(Object.values(MODEL_STATUSES).map((model) => readModelStatus(model, env)));
  await refreshModelRuntimeHealth(env);
  const registry = getPublicModelRegistry(env, getModelRuntimeHealthSnapshot());
  return json(res, 200, {
    ok: results.every((result) => result.ok),
    configured: results.some((result) => result.configured),
    models: results,
    registry,
    router: {
      defaultModelId: registry.defaultModelId,
      planner: registry.defaultModelId,
      coder: registry.defaultModelId,
      auto: registry.auto,
      fallback: DEFAULT_MODEL_ID
    }
  });
}

export async function handleWorkerPreflight(url, res, { env = process.env } = {}) {
  const requested = url.searchParams.get("model") || DEFAULT_MODEL_ID;
  const definition = getModelDefinition(requested) || getModelDefinition(DEFAULT_MODEL_ID);
  const model = resolveVaultStatus(definition.storage.vaultStatusId);
  const mode = url.searchParams.get("mode") || "planner-vault";
  const modelStatus = await readModelStatus(model, env);
  const preflight = evaluateWorkerPreflight({
    model,
    liveStorage: modelStatus.liveStorage || {},
    request: {
      mode,
      gpuRequired: mode === "full-model" || mode === "gpu-coding",
      minGpuVramGb: Number(url.searchParams.get("minGpuVramGb") || 24)
    },
    worker: {
      provider: "salad",
      gpuCount: Number(env.SALAD_WORKER_GPU_COUNT || 1),
      gpuVramGb: Number(env.SALAD_WORKER_GPU_VRAM_GB || 24),
      vcpu: Number(env.SALAD_WORKER_VCPU || 16),
      ramGb: Number(env.SALAD_WORKER_RAM_GB || 64),
      localCacheGb: Number(env.SALAD_WORKER_LOCAL_CACHE_GB || 300),
      quotaRemainingReplicas: Number(env.SALAD_QUOTA_REMAINING_REPLICAS || 10)
    }
  });
  return json(res, preflight.ok ? 200 : 409, { ok: preflight.ok, modelStatus, preflight });
}

export async function readModelStatus(model, env = process.env) {
  const storage = modelStorageConfig(env);
  const prefix = modelPrefix(model, env);
  if (!storage.configured) {
    return {
      ok: true,
      configured: false,
      model,
      liveStorage: { ok: false, missing: storage.missing }
    };
  }

  const { response, body } = await signedS3List({ ...storage, prefix });
  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      model,
      liveStorage: {
        ok: false,
        bucket: storage.bucket,
        prefix,
        status: response.status,
        message: body.slice(0, 300)
      }
    };
  }

  const objectCount = parseS3Keys(body).length;
  const expectedObjectCount = expectedObjectsForPrefix(model, prefix);
  return {
    ok: objectCount >= expectedObjectCount,
    configured: true,
    model,
    liveStorage: {
      ok: objectCount >= expectedObjectCount,
      provider: STORAGE.provider,
      bucket: storage.bucket,
      prefix,
      objectCount,
      expectedObjectCount,
      checkedAt: new Date().toISOString()
    }
  };
}

function resolveVaultStatus(modelId) {
  if (MODEL_STATUSES[modelId]) return MODEL_STATUSES[modelId];
  const definition = getModelDefinition(modelId);
  return definition ? MODEL_STATUSES[definition.storage.vaultStatusId] : null;
}

function modelPrefix(model, env) {
  if (model.id === KIMI_K2_7_STATUS.id) return env.KIMI_K2_7_PREFIX || model.storage.prefix;
  if (model.id === GLM_5_2_FP8_STATUS.id) return env.GLM_5_2_FP8_PREFIX || model.storage.prefix;
  return model.storage?.prefix || "";
}

function expectedObjectsForPrefix(model, prefix) {
  if (String(prefix).includes("/original/")) {
    return model.verification?.originalFileCount || model.verification?.sourceFileCount || 0;
  }
  return model.verification?.idriveObjectCount || model.verification?.sourceFileCount || 0;
}

function modelStorageConfig(env) {
  const values = {
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_MODEL_BUCKET || env.IDRIVE_E2_BUCKET
  };
  const missing = [
    !values.endpoint && "IDRIVE_E2_ENDPOINT",
    !values.accessKey && "IDRIVE_E2_ACCESS_KEY",
    !values.secretKey && "IDRIVE_E2_SECRET_KEY",
    !values.bucket && "IDRIVE_E2_MODEL_BUCKET|IDRIVE_E2_BUCKET"
  ].filter(Boolean);
  return { ...values, configured: missing.length === 0, missing };
}
