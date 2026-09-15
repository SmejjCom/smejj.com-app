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
import { maskiereModellStatusFuerAnonyme } from "../http/anonymMaske.js";
const maske = (angemeldet) => (angemeldet ? (wert) => wert : maskiereModellStatusFuerAnonyme);

// Vault-Stand 30 s halten (F26, 2026-09-14).
//
// GEMESSEN 14.09.: `/api/models/status` p50 414 / p95 951 ms; mit warmer
// Verbindung ~350 ms, davon ~200 ms Serverzeit — je Aufruf ZWEI Objektlisten
// (Kimi- und GLM-Tresor), obwohl sich die Objektzahl eines Tresors zwischen
// zwei Aufrufen nie aendert. Gehalten wird nur ein GELUNGENER Listenabruf;
// ein Fehler wird beim naechsten Aufruf sofort neu gemessen. `checkedAt`
// bleibt die echte Messzeit, die Antwort luegt also nicht ueber ihr Alter.
// Der Worker-Preflight liest mit `frisch: true` weiter live.
export const VAULT_HALTE_MS = 30_000;
const vaultGehalten = new Map(); // model.id -> { zeit, prefix, ergebnis }

/** Nur fuer Tests: gehaltene Vault-Staende vergessen. */
export function vergissVaultStand() { vaultGehalten.clear(); }

function vaultHalteMs(env) {
  const wert = Number(env.SMEJJ_MODEL_VAULT_STATUS_TTL_MS);
  return Number.isFinite(wert) && wert >= 0 ? Math.min(wert, 15 * 60_000) : VAULT_HALTE_MS;
}

// Laufzeit-Proben (Moonshot-Guthaben, Hausmodell /health) im Hintergrund wie
// bei /api/health seit 13.09.: eine abgelaufene Probe kostete den Aufrufer
// sonst bis zu 3 x 5 s. Nur beim KALTEN Start (noch kein einziger Eintrag)
// wird gewartet, damit die erste Antwort nach einem Deploy das Hausmodell
// nicht faelschlich als unerreichbar zeigt.
async function laufzeitGesundheitAuffrischen(env) {
  const lauf = refreshModelRuntimeHealth(env).catch(() => {});
  if (Object.keys(getModelRuntimeHealthSnapshot()).length === 0) await lauf;
}

export async function handleModelStatus(res, modelId, { env = process.env, angemeldet = false } = {}) {
  const model = resolveVaultStatus(modelId);
  if (!model) return json(res, 404, { ok: false, error: "Unknown model" });
  await laufzeitGesundheitAuffrischen(env);
  const result = await readModelStatus(model, env);
  const registry = getPublicModelRegistry(env, getModelRuntimeHealthSnapshot());
  return json(res, 200, maske(angemeldet)({
    ...result,
    runtime: registry.models.find((item) => item.id === getModelDefinition(modelId)?.id) || null
  }));
}

export async function handleModelsStatus(res, { env = process.env, angemeldet = false } = {}) {
  const results = await Promise.all(Object.values(MODEL_STATUSES).map((model) => readModelStatus(model, env)));
  await laufzeitGesundheitAuffrischen(env);
  const registry = getPublicModelRegistry(env, getModelRuntimeHealthSnapshot());
  return json(res, 200, maske(angemeldet)({
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
  }));
}

export async function handleWorkerPreflight(url, res, { env = process.env, live = false } = {}) {
  const requested = url.searchParams.get("model") || DEFAULT_MODEL_ID;
  const definition = getModelDefinition(requested) || getModelDefinition(DEFAULT_MODEL_ID);
  const model = resolveVaultStatus(definition.storage?.vaultStatusId);
  // Nur Vault-Modelle (GLM-5.2, K2.7) haben einen e2-Abzug fuer den Worker-Start.
  // Reine API-Modelle wie Kimi K3 und selbst gehostete wie smejj fast 1.0 haben
  // keinen — sauber ablehnen statt am fehlenden Vault-Status abzustuerzen.
  if (!model) {
    return json(res, 409, {
      ok: false,
      error: "model_not_vault_backed",
      modelId: definition.id
    });
  }
  const mode = url.searchParams.get("mode") || "planner-vault";
  // Vor einem Worker-Start zaehlt der Tresor live, nie aus dem Haltespeicher —
  // aber NUR fuer angemeldete Aufrufer (E2E-Sicherheitspruefung 14.09.2026: die
  // Route steht auf der offenen Liste, und JEDER fremde Aufruf loeste eine
  // e2-Zaehlung aus). Ohne Anmeldung gilt der Haltespeicher (vaultHalteMs).
  const modelStatus = await readModelStatus(model, env, { frisch: live === true });
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
  // Anonyme: gleiche Entscheidung, ohne Bucket/Praefix/Worker-Fakten (S6, 15.09.2026).
  return json(res, preflight.ok ? 200 : 409, maske(live)({ ok: preflight.ok, modelStatus, preflight }));
}

export async function readModelStatus(model, env = process.env, { frisch = false, jetztMs = Date.now(), fetchImpl = fetch } = {}) {
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

  const gehalten = frisch ? null : vaultGehalten.get(model.id);
  if (gehalten && gehalten.prefix === prefix && jetztMs - gehalten.zeit < vaultHalteMs(env)) return gehalten.ergebnis;

  const { response, body } = await signedS3List({ ...storage, prefix, fetchImpl });
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
  const ergebnis = {
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
      checkedAt: new Date(jetztMs).toISOString()
    }
  };
  vaultGehalten.set(model.id, { zeit: jetztMs, prefix, ergebnis });
  return ergebnis;
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
