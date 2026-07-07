#!/usr/bin/env node
import {
  failAndExit,
  readJson,
  validateSchema,
  walkValue
} from "./validation-utils.mjs";

const manifestSchemas = [
  ["idrive-layout/manifests/app/capabilities.json", "schemas/capabilities.schema.json"],
  ["idrive-layout/manifests/providers/providers.json", "schemas/providers.schema.json"],
  ["idrive-layout/manifests/models/registry.json", "schemas/models-registry.schema.json"],
  ["idrive-layout/manifests/models/glm-5-2/model-manifest.json", "schemas/glm-model-manifest.schema.json"],
  ["idrive-layout/manifests/models/glm-5-2/shard-map.json", "schemas/glm-shard-map.schema.json"],
  ["idrive-layout/manifests/models/glm-5-2/checksums.json", "schemas/glm-checksums.schema.json"],
  ["idrive-layout/manifests/model-cache/glm-5-2/worker-cache-map.json", "schemas/model-cache-manifest.schema.json"],
  ["idrive-layout/manifests/model-cache/glm-5-2/prefix-blocks.json", "schemas/model-cache-manifest.schema.json"],
  ["idrive-layout/manifests/context-plans/example-context-plan.json", "schemas/context-plan.schema.json"],
  ["idrive-layout/manifests/task-capsules/example-task-capsule.json", "schemas/task-capsule.schema.json"],
  ["idrive-layout/manifests/workers/salad-worker-preflight.json", "schemas/salad-worker-preflight.schema.json"],
  ["idrive-layout/manifests/projects/example-project.json", "schemas/project-manifest.schema.json"],
  ["idrive-layout/manifests/deployments/current.json", "schemas/deployment-manifest.schema.json"]
];

const failures = [];

for (const [manifestFile, schemaFile] of manifestSchemas) {
  let manifest;
  let schema;
  try {
    manifest = readJson(manifestFile);
    schema = readJson(schemaFile);
  } catch (error) {
    failures.push(`${manifestFile} or ${schemaFile}: ${error.message}`);
    continue;
  }
  failures.push(...validateSchema(manifest, schema, manifestFile));
  checkRelativeStrings(manifestFile, manifest, failures);
}

checkProviderRules(failures);
checkModelRules(failures);
checkGlmFirstRules(failures);

failAndExit("Manifest validation", failures);

function checkRelativeStrings(file, value, failures) {
  walkValue(value, (child, pathParts) => {
    if (typeof child !== "string") return;
    if (/^(\/Users\/|\/home\/|file:\/\/|[A-Za-z]:\\|.*GoogleDrive|.*Meine Ablage)/.test(child)) {
      failures.push(`${file} ${pathParts.join(".")} contains a private or absolute local path.`);
    }
  });
}

function checkProviderRules(failures) {
  const providers = readJson("idrive-layout/manifests/providers/providers.json");
  const allowedProviderIds = new Set([
    "local-browser",
    "byok-openai-compatible",
    "free-demo-hardlimit",
    "kimi-k2-7-vault",
    "glm-5-2-fp8-vault",
    "nex-n2-pro-idrive-lite",
    "disabled",
    "later-partner-compute"
  ]);
  for (const provider of providers.providers) {
    if (!allowedProviderIds.has(provider.id)) failures.push(`Unexpected provider id: ${provider.id}`);
    if (!["disabled", "byok-openai-compatible"].includes(provider.fallback)) {
      failures.push(`Provider ${provider.id} has unsafe fallback ${provider.fallback}.`);
    }
    if (/paid|trial|billing/i.test(`${provider.id} ${provider.type} ${provider.costRisk}`)) {
      failures.push(`Provider ${provider.id} contains a paid/trial/billing marker.`);
    }
  }
}

function checkModelRules(failures) {
  const registry = readJson("idrive-layout/manifests/models/registry.json");
  for (const model of registry.models) {
    if (model.storage?.provider !== "idrive-e2") failures.push(`Model ${model.id} is not stored in IDrive e2.`);
    if (model.inference?.default !== "disabled") failures.push(`Model ${model.id} must default to disabled inference.`);
    for (const blocked of model.inference?.notAllowedAsDefault || []) {
      if (!/paid|trial|workers-ai|browser-free-full-model|unverified|large-model/i.test(blocked)) {
        failures.push(`Model ${model.id} notAllowedAsDefault entry should document blocked paid/trial risk: ${blocked}`);
      }
    }
  }
}

function checkGlmFirstRules(failures) {
  const registry = readJson("idrive-layout/manifests/models/registry.json");
  const glm = registry.models.find((model) => model.id === "glm-5-2-fp8");
  if (!glm) failures.push("GLM-5.2 FP8 must remain in the model registry.");
  if (glm && !/flagship-coding/.test(glm.role || "")) {
    failures.push("GLM-5.2 FP8 must be the flagship coding and planning vault target.");
  }

  const taskCapsule = readJson("idrive-layout/manifests/task-capsules/example-task-capsule.json");
  if (taskCapsule.model?.id !== "glm-5-2") failures.push("Task Capsules must route quality-critical work to GLM-5.2.");
  if (taskCapsule.policy?.blindFullRepoLoadAllowed !== false) failures.push("Task Capsules must forbid blind full-repo loading.");
  if (taskCapsule.memory?.learnDirectlyFromModelOutput !== false) failures.push("Memory must not learn directly from model output.");

  const contextPlan = readJson("idrive-layout/manifests/context-plans/example-context-plan.json");
  if (contextPlan.planner?.blindFullRepoLoadAllowed !== false) failures.push("Context Planner must forbid blind full-repo loading.");

  const cacheManifest = readJson("idrive-layout/manifests/model-cache/glm-5-2/worker-cache-map.json");
  if (cacheManifest.validation?.trustPathOnly !== false) failures.push("Worker cache must never trust path alone.");
  if (cacheManifest.validation?.requiresSha256 !== true) failures.push("Worker cache must require sha256 validation.");
}
