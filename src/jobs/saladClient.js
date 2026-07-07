const SALAD_API_BASE = "https://api.salad.com/api/public";

export function getSaladConfig(env = {}) {
  const organization = safeName(env.SALAD_ORGANIZATION_NAME || "", "SALAD_ORGANIZATION_NAME");
  const project = safeName(env.SALAD_PROJECT_NAME || "", "SALAD_PROJECT_NAME");
  const apiKey = String(env.SALAD_API_KEY || "").trim();
  const containerGroupName = safeName(env.SALAD_CONTAINER_GROUP_NAME || "smejj-glm-worker", "SALAD_CONTAINER_GROUP_NAME");
  const image = String(env.SALAD_GLM_WORKER_IMAGE || "").trim();
  const gpuClasses = String(env.SALAD_GPU_CLASS_IDS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    configured: Boolean(organization && project && apiKey),
    missing: [
      !organization && "SALAD_ORGANIZATION_NAME",
      !project && "SALAD_PROJECT_NAME",
      !apiKey && "SALAD_API_KEY"
    ].filter(Boolean),
    organization,
    project,
    apiKey,
    containerGroupName,
    image,
    gpuClasses,
    apiBase: String(env.SALAD_API_BASE || SALAD_API_BASE).replace(/\/$/, "")
  };
}

export function buildSaladGlmWorkerPlan({ job = {}, env = {} } = {}) {
  const config = getSaladConfig(env);
  const capsule = job.taskCapsule || {};
  const reasons = [];
  if (!config.configured) reasons.push("salad_api_not_configured");
  if (!config.image) reasons.push("salad_worker_image_missing");
  if (!config.gpuClasses.length) reasons.push("salad_gpu_class_ids_missing");

  const payload = {
    name: config.containerGroupName,
    display_name: "smejj GLM-5.2 Worker",
    autostart_policy: false,
    restart_policy: "always",
    replicas: 0,
    container: {
      image: config.image || "registry.example/smejj-glm-worker:pending",
      image_caching: true,
      command: ["node", "/app/worker.js"],
      resources: {
        cpu: Number(env.SALAD_WORKER_VCPU || 16),
        memory: Number(env.SALAD_WORKER_MEMORY_MB || 65536),
        gpu_classes: config.gpuClasses,
        storage_amount: Number(env.SALAD_WORKER_STORAGE_BYTES || 805306368000)
      },
      environment_variables: {
        SMEJJ_JOB_ID: job.id || "",
        SMEJJ_PROJECT_ID: job.projectId || "",
        SMEJJ_TASK_CAPSULE_PREFIX: capsule.rootPrefix || "",
        SMEJJ_MODEL_ID: "glm-5-2",
        SMEJJ_MODEL_VAULT_ID: "glm-5-2-fp8",
        SMEJJ_WORKER_MODE: env.SALAD_WORKER_MODE || "planner-vault",
        SMEJJ_GLM_RUNTIME: env.SMEJJ_GLM_RUNTIME || "sglang",
        SMEJJ_MODEL_CACHE_DIR: env.SMEJJ_MODEL_CACHE_DIR || "/cache/glm-5-2-fp8",
        GLM_5_2_FP8_PREFIX: env.GLM_5_2_FP8_PREFIX || "model-files/glm-5-2-fp8/original/",
        SMEJJ_CONTROL_ROUTER_URL: env.SMEJJ_CONTROL_ROUTER_URL || "https://smejj.com"
      }
    },
    networking: {
      protocol: "http",
      auth: true,
      port: Number(env.SALAD_WORKER_PORT || 8080)
    }
  };

  return {
    ok: reasons.length === 0,
    provider: "salad",
    configured: config.configured,
    missing: config.missing,
    reasons,
    endpoint: `/organizations/${config.organization}/projects/${config.project}/containers`,
    containerGroupName: config.containerGroupName,
    autostart: false,
    replicas: 0,
    startsCompute: false,
    secretsInPayload: false,
    payload
  };
}

export async function saladListGpuClasses(env = {}) {
  const config = getSaladConfig(env);
  if (!config.configured) return blocked("salad_api_not_configured", config);
  return saladRequest(config, "GET", `/organizations/${config.organization}/gpu-classes`);
}

export async function saladGetContainerGroup(env = {}) {
  const config = getSaladConfig(env);
  if (!config.configured) return blocked("salad_api_not_configured", config);
  return saladRequest(config, "GET", `/organizations/${config.organization}/projects/${config.project}/containers/${config.containerGroupName}`);
}

export async function saladCreateContainerGroup({ env = {}, plan } = {}) {
  const config = getSaladConfig(env);
  if (env.CONFIRM_SALAD_CREATE !== "YES") return blocked("confirm_salad_create_required", config);
  const safePlan = plan || buildSaladGlmWorkerPlan({ env });
  if (!safePlan.ok) return { ok: false, reason: "salad_plan_not_ready", plan: safePlan };
  return saladRequest(config, "POST", safePlan.endpoint, safePlan.payload);
}

export async function saladStartContainerGroup(env = {}) {
  const config = getSaladConfig(env);
  if (env.CONFIRM_SALAD_START !== "YES") return blocked("confirm_salad_start_required", config);
  return saladRequest(config, "POST", `/organizations/${config.organization}/projects/${config.project}/containers/${config.containerGroupName}/start`);
}

export async function saladStopContainerGroup(env = {}) {
  const config = getSaladConfig(env);
  if (env.CONFIRM_SALAD_STOP !== "YES") return blocked("confirm_salad_stop_required", config);
  return saladRequest(config, "POST", `/organizations/${config.organization}/projects/${config.project}/containers/${config.containerGroupName}/stop`);
}

async function saladRequest(config, method, path, body) {
  if (!config.configured) return blocked("salad_api_not_configured", config);
  const response = await fetch(`${config.apiBase}${path}`, {
    method,
    headers: {
      "Salad-Api-Key": config.apiKey,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function blocked(reason, config = {}) {
  return {
    ok: false,
    reason,
    configured: Boolean(config.configured),
    missing: config.missing || []
  };
}

function safeName(value, label) {
  const name = String(value || "").trim();
  if (!name) return "";
  if (!/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(name)) throw new Error(`${label} must be a Salad-safe name`);
  return name;
}
