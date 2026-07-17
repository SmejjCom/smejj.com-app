import { GLM_5_2_FP8_STATUS } from "../shared/platform.js";

const DEFAULT_SALAD_WORKER = Object.freeze({
  provider: "salad",
  gpuCount: 1,
  gpuVramGb: 24,
  vcpu: 16,
  ramGb: 64,
  localCacheGb: 300,
  quotaRemainingReplicas: 10,
  githubPaidAllowed: false,
  paidHostingAllowed: false,
  trialServicesAllowed: false,
  autoBillingFallbackAllowed: false
});

export function evaluateWorkerPreflight({
  worker = {},
  model = GLM_5_2_FP8_STATUS,
  liveStorage = {},
  job = {},
  request = {},
  now = new Date().toISOString()
} = {}) {
  const candidate = { ...DEFAULT_SALAD_WORKER, ...worker };
  const reasons = [];
  const warnings = [];
  const gpuRequired = request.gpuRequired === true || request.mode === "full-model" || request.mode === "gpu-coding";
  const expectedObjects = model.verification?.sourceFileCount || model.verification?.originalFileCount || model.verification?.idriveObjectCount || 0;
  const liveObjects = Number(liveStorage.objectCount ?? expectedObjects);
  const reportedGiB = Number(model.verification?.reportedGiB || 0);
  const localCacheGb = Number(candidate.localCacheGb || 0);

  if (candidate.provider !== "salad") reasons.push("worker_provider_not_salad");
  if (candidate.githubPaidAllowed) reasons.push("github_paid_not_allowed");
  if (candidate.paidHostingAllowed) reasons.push("paid_hosting_not_allowed");
  if (candidate.trialServicesAllowed) reasons.push("trial_services_not_allowed");
  if (candidate.autoBillingFallbackAllowed) reasons.push("auto_billing_fallback_not_allowed");
  if (Number(candidate.quotaRemainingReplicas || 0) < 1) reasons.push("salad_replica_quota_unavailable");
  if (gpuRequired && Number(candidate.gpuCount || 0) < 1) reasons.push("gpu_required_but_missing");
  if (gpuRequired && Number(candidate.gpuVramGb || 0) < Number(request.minGpuVramGb || 24)) reasons.push("gpu_vram_too_small");
  if (Number(candidate.ramGb || 0) < Number(request.minRamGb || 8)) reasons.push("ram_too_small");
  if (Number(candidate.vcpu || 0) < Number(request.minVcpu || 2)) reasons.push("vcpu_too_small");

  if (model.storage?.provider !== "idrive-e2") reasons.push("model_not_in_idrive_e2");
  if (model.verification?.status !== "verified-complete") reasons.push("model_not_verified_complete");
  if (expectedObjects > 0 && liveObjects < expectedObjects) reasons.push("idrive_model_objects_missing");
  if (liveStorage.ok === false) reasons.push("idrive_live_storage_not_ok");

  if (request.mode === "full-model" && reportedGiB > localCacheGb) {
    reasons.push("model_larger_than_worker_cache");
  }
  if (model.id === "glm-5-2-fp8" && request.mode === "full-model" && localCacheGb <= 300) {
    reasons.push("glm_5_2_full_run_blocked_on_300gb_salad_worker");
  }
  if (model.id === "glm-5-2-fp8" && request.mode !== "full-model") {
    warnings.push("glm_5_2_is_flagship_vault_until_larger_compute_is_approved");
  }
  if (model.id === "kimi-k2-7" && request.mode !== "full-model") {
    warnings.push("kimi_k2_7_uses_api_or_approved_large_compute_only");
  }

  const ok = reasons.length === 0;
  return {
    ok,
    checkedAt: now,
    provider: candidate.provider,
    jobId: job.id || job.jobId || null,
    modelId: model.id,
    decision: ok ? "accept" : "reject",
    nextAction: ok ? "claim_task_capsule" : fallbackAction(model, request),
    reasons,
    warnings,
    facts: {
      gpuCount: Number(candidate.gpuCount || 0),
      gpuVramGb: Number(candidate.gpuVramGb || 0),
      vcpu: Number(candidate.vcpu || 0),
      ramGb: Number(candidate.ramGb || 0),
      localCacheGb,
      modelReportedGiB: reportedGiB,
      expectedObjectCount: expectedObjects,
      liveObjectCount: liveObjects,
      quotaRemainingReplicas: Number(candidate.quotaRemainingReplicas || 0)
    }
  };
}

function fallbackAction(model, request) {
  if (["glm-5-2-fp8", "kimi-k2-7"].includes(model?.id) && request?.mode === "full-model") {
    return "use_fast_path_or_smaller_coding_model_until_larger_compute_is_approved";
  }
  return "fail_closed_and_report_preflight";
}
