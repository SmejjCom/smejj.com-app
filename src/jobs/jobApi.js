import { GLM_5_2_FP8_STATUS } from "../shared/platform.js";
import { buildCodingFlowPlan } from "./codingFlowPlan.js";
import { buildAutonomousCodingLoop } from "./autonomousLoop.js";
import { buildFreeCodingExecutionPlan } from "./freeCodingPlan.js";
import { buildIdriveJobQueuePlan } from "./idriveQueue.js";
import { buildTaskCapsuleWritePlan } from "./taskCapsuleWriter.js";
import { createIdriveLiteCodingJob } from "./idriveLiteJob.js";
import { evaluateWorkerPreflight } from "./workerPreflight.js";

export function createStorageFirstJobEnvelope({ body = {}, env = {}, now = new Date().toISOString() } = {}) {
  const job = createIdriveLiteCodingJob({
    jobId: safeId(body.jobId || `job_${randomJobSuffix()}`, "jobId"),
    projectId: safeId(body.projectId || "project_smejj", "projectId"),
    userId: body.userId ? safeId(body.userId, "userId") : "",
    task: String(body.task || "").trim(),
    modelId: "glm-5-2",
    createdAt: now,
    contextPaths: body.contextPaths || {},
    limits: body.limits || {}
  });

  const idriveConfigured = hasIdriveConfig(env);
  const preflight = evaluateWorkerPreflight({
    job,
    model: GLM_5_2_FP8_STATUS,
    liveStorage: idriveConfigured
      ? { ok: true, objectCount: GLM_5_2_FP8_STATUS.verification.idriveObjectCount }
      : { ok: false, objectCount: 0 },
    request: {
      mode: body.workerMode || "planner-vault",
      gpuRequired: body.workerMode === "full-model" || body.workerMode === "gpu-coding",
      minGpuVramGb: Number(body.minGpuVramGb || 24)
    },
    worker: {
      provider: "salad",
      gpuCount: Number(env.SALAD_WORKER_GPU_COUNT || 1),
      gpuVramGb: Number(env.SALAD_WORKER_GPU_VRAM_GB || 24),
      vcpu: Number(env.SALAD_WORKER_VCPU || 16),
      ramGb: Number(env.SALAD_WORKER_RAM_GB || 64),
      localCacheGb: Number(env.SALAD_WORKER_LOCAL_CACHE_GB || 300),
      quotaRemainingReplicas: Number(env.SALAD_QUOTA_REMAINING_REPLICAS || 10)
    },
    now
  });
  const codingFlow = buildCodingFlowPlan({ job, body, env, preflight, now });
  const autonomousLoop = buildAutonomousCodingLoop({
    job,
    uiChange: codingFlow.verification?.uiChange === true,
    now
  });
  const freeCodingPlan = buildFreeCodingExecutionPlan({ job, body, codingFlow, now });
  const taskCapsuleWritePlan = buildTaskCapsuleWritePlan(job, { now, freeCodingPlan });
  const queueWritePlan = buildIdriveJobQueuePlan(job, { status: "open", now });

  return {
    ok: true,
    mode: "glm-5.2-storage-first-job",
    inferenceStarted: false,
    idriveConfigured,
    idriveWrite: {
      requested: body.persistToIdrive === true,
      mode: body.persistToIdrive === true ? "server-side-put-when-configured" : "write-plan-only"
    },
    job,
    codingFlow,
    autonomousLoop,
    freeCodingPlan,
    taskCapsuleWritePlan,
    queueWritePlan,
    preflight
  };
}

export function hasIdriveConfig(env = {}) {
  return Boolean(env.IDRIVE_E2_ENDPOINT && env.IDRIVE_E2_ACCESS_KEY && env.IDRIVE_E2_SECRET_KEY && env.IDRIVE_E2_BUCKET);
}

function safeId(value, label) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(id)) throw new Error(`${label} must be a relative safe id`);
  return id;
}

function randomJobSuffix() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid.replace(/-/g, "").slice(0, 16);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
