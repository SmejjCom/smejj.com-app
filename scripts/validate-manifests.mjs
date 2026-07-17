#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  ["idrive-layout/manifests/training/provider-rights.json", "schemas/provider-training-rights.schema.json"],
  ["idrive-layout/manifests/workers/salad-worker-preflight.json", "schemas/salad-worker-preflight.schema.json"],
  ["idrive-layout/manifests/projects/example-project.json", "schemas/project-manifest.schema.json"],
  ["idrive-layout/manifests/deployments/current.json", "schemas/deployment-manifest.schema.json"]
];

export function runManifestValidation() {
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
    failures.push(...validateManifestSchema(manifest, schema, manifestFile));
    checkRelativeStrings(manifestFile, manifest, failures);
  }

  checkProviderRules(failures);
  checkModelRules(failures);
  checkGlmFirstRules(failures);
  checkTrainingManifestRules(failures);

  failAndExit("Manifest validation", failures);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runManifestValidation();
}

function checkRelativeStrings(file, value, failures) {
  walkValue(value, (child, pathParts) => {
    if (typeof child !== "string") return;
    if (/^(\/Users\/|\/home\/|file:\/\/|[A-Za-z]:\\|.*GoogleDrive|.*Meine Ablage)/.test(child)) {
      failures.push(`${file} ${pathParts.join(".")} contains a private or absolute local path.`);
    }
  });
}

function validateManifestSchema(value, schema, label) {
  const basicSchema = structuredClone(schema);
  removeUnionTypes(basicSchema);
  return [
    ...validateSchema(value, basicSchema, label),
    ...validateUnionTypes(value, schema, label)
  ];
}

function removeUnionTypes(schema) {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema.type)) delete schema.type;
  for (const value of Object.values(schema)) removeUnionTypes(value);
}

function validateUnionTypes(value, schema, label, pathParts = []) {
  if (!schema || typeof schema !== "object") return [];
  const failures = [];
  const at = pathParts.length ? pathParts.join(".") : "$";

  if (Array.isArray(schema.type) && !schema.type.some((type) => matchesSchemaType(value, type))) {
    failures.push(`${label} ${at} must be one of types ${schema.type.join(", ")}.`);
    return failures;
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      failures.push(...validateUnionTypes(item, schema.items, label, [...pathParts, String(index)]));
    });
  } else if (value && typeof value === "object") {
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) failures.push(...validateUnionTypes(value[key], childSchema, label, [...pathParts, key]));
    }
  }
  return failures;
}

function matchesSchemaType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
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
    if (!["disabled", "byok-openai-compatible", "glm-5-2-fp8-vault"].includes(provider.fallback)) {
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

function checkTrainingManifestRules(failures) {
  const files = {
    providerRights: "idrive-layout/manifests/training/provider-rights.json",
    legacyPolicy: "idrive-layout/manifests/training/legacy-capsules-policy.json",
    baseModelGate: "idrive-layout/manifests/training/smejj-1-0-base-model-gate.json"
  };
  const manifests = {};

  for (const [name, file] of Object.entries(files)) {
    try {
      manifests[name] = readJson(file);
      checkRelativeStrings(file, manifests[name], failures);
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }

  if (Object.keys(manifests).length === Object.keys(files).length) {
    failures.push(...validateTrainingManifestSemantics(manifests));
  }
}

export function validateTrainingManifestSemantics({ providerRights, legacyPolicy, baseModelGate }) {
  const failures = [];
  const entries = Array.isArray(providerRights?.entries) ? providerRights.entries : [];
  const entryById = new Map();

  if (providerRights?.defaultTrainingUse !== "denied") {
    failures.push("Provider training rights must default to denied.");
  }

  for (const entry of entries) {
    if (!entry?.id) continue;
    if (entryById.has(entry.id)) failures.push(`Provider training rights contain duplicate id ${entry.id}.`);
    entryById.set(entry.id, entry);

    if ((entry.trainingUse === "allowed" || entry.derivativeTrainingUse === "allowed") &&
        (entry.permissionStatus !== "verified" || !isEvidenceReference(entry.permissionId) || !isExactRevision(entry.artifactRevision))) {
      failures.push(`Training rights entry ${entry.id} cannot allow training without verified permission, permission evidence and an exact artifact revision.`);
    }
    if (entry.permissionStatus !== "verified" &&
        (entry.trainingUse === "allowed" || entry.derivativeTrainingUse === "allowed")) {
      failures.push(`Training rights entry ${entry.id} is fail-open while permission is not verified.`);
    }
    if (!isEvidenceReference(entry.reviewEvidenceId)) {
      failures.push(`Training rights entry ${entry.id} must reference durable review evidence.`);
    }
    if (entry.sourceType === "api" && !/^https:\/\//.test(entry.termsUrl || "")) {
      failures.push(`API training rights entry ${entry.id} must reference HTTPS provider terms.`);
    }
  }

  const zai = entries.find((entry) => entry?.sourceType === "api" && entry?.provider === "z.ai");
  const kimi = entries.find((entry) => entry?.sourceType === "api" && entry?.provider === "moonshot-ai");
  requireBlockedSource(zai, "Z.ai API GLM-5.2", failures);
  requireBlockedSource(kimi, "Moonshot API Kimi K2.7", failures);

  const legacyRights = entryById.get("legacy-task-capsules-before-training-v1");
  requireBlockedSource(legacyRights, "legacy Task Capsules", failures);
  if (legacyRights && legacyRights.reviewEvidenceId !== legacyPolicy?.policyId) {
    failures.push("Legacy Task Capsule rights must reference the active legacy-capsules policy id.");
  }

  const qwen = entries.find((entry) => entry?.sourceType === "open-weights" && entry?.provider === "qwen");
  if (!qwen) {
    failures.push("Provider training rights must contain the reviewed Qwen open-weights source.");
  }
  const glmWeights = entries.find((entry) => entry?.sourceType === "open-weights" && entry?.provider === "z.ai-open-weights");
  if (!glmWeights) {
    failures.push("Provider training rights must contain the reviewed GLM-5.2 open-weights source.");
  }
  for (const openWeights of entries.filter((entry) => entry?.sourceType === "open-weights")) {
    if (baseModelGate?.candidateUpstream?.identityConfirmedForRuntime !== true &&
        (openWeights.trainingUse === "allowed" || openWeights.derivativeTrainingUse === "allowed")) {
      failures.push(`Open-weights training rights ${openWeights.id} cannot be allowed before the base artifact identity is confirmed.`);
    }
  }

  const requiredLegacyPrefixes = ["capsules/", "task-capsules/", "jobs/"];
  const legacyPrefixes = new Set(Array.isArray(legacyPolicy?.appliesTo) ? legacyPolicy.appliesTo : []);
  for (const prefix of requiredLegacyPrefixes) {
    if (!legacyPrefixes.has(prefix)) failures.push(`Legacy training denial must cover ${prefix}.`);
  }
  if (legacyPolicy?.defaultTrainingEligible !== false) {
    failures.push("Legacy Task Capsules must default to training-ineligible.");
  }
  if (legacyPolicy?.automaticImportAllowed !== false) {
    failures.push("Legacy Task Capsules must never be imported automatically.");
  }
  if (legacyPolicy?.deletionPerformed !== false) {
    failures.push("The legacy training policy must not authorize or claim data deletion.");
  }

  const requiredPromotionGates = [
    "explicit-human-consent",
    "repository-rights-review",
    "provider-rights-review",
    "pre-persistence-sanitization",
    "all-quality-gates-passed",
    "encrypted-immutable-candidate",
    "family-split-leakage-check"
  ];
  const promotionGates = new Set(Array.isArray(legacyPolicy?.promotionRequires) ? legacyPolicy.promotionRequires : []);
  for (const gate of requiredPromotionGates) {
    if (!promotionGates.has(gate)) failures.push(`Legacy promotion policy is missing fail-closed gate ${gate}.`);
  }

  if (baseModelGate?.targetModelId !== "smejj-1-0") {
    failures.push("The Phase 1 base-model gate must target smejj-1-0.");
  }
  if (baseModelGate?.foundationFamily !== "glm-5-2") {
    failures.push("The smejj 1.0 foundation family must remain GLM-5.2 (operator decision 2026-07-17; changes need a new written decision plus rights review).");
  }
  if (baseModelGate?.trainingAllowed !== false) {
    failures.push("Phase 1 model training must remain disabled until the base artifact and all approvals are verified.");
  }
  if (!/^blocked-/.test(baseModelGate?.status || "")) {
    failures.push("The Phase 1 base-model status must remain explicitly blocked.");
  }
  if (baseModelGate?.candidateUpstream?.identityConfirmedForRuntime !== false) {
    failures.push("The candidate base-model artifact must not be marked as the active runtime until exact identity is proven.");
  }
  if (baseModelGate?.revisionSegmentRequired !== true) {
    failures.push("smejj 1.0 model storage must require a revision segment.");
  }
  if (baseModelGate?.weightsStoredInRepository !== false) {
    failures.push("Model weights must not be stored in the source repository.");
  }
  if (!/^model-files\/smejj-1-0\/base\/glm-5-2\/$/.test(baseModelGate?.targetIdrivePrefix || "")) {
    failures.push("The smejj 1.0 base-model target must use its dedicated IDrive e2 prefix.");
  }

  const requiredBaseGates = [
    "runtime-weight-repository-confirmed",
    "exact-revision-pinned",
    "license-and-notices-archived-in-idrive-e2",
    "file-inventory-and-sha256-verified",
    "tokenizer-and-chat-template-pinned",
    "quantization-and-engine-pinned",
    "trainer-image-digest-pinned",
    "dataset-rights-and-privacy-gates-passed",
    "written-cost-budget-approved"
  ];
  const baseGates = new Set(Array.isArray(baseModelGate?.requiredBeforeTraining) ? baseModelGate.requiredBeforeTraining : []);
  for (const gate of requiredBaseGates) {
    if (!baseGates.has(gate)) failures.push(`Base-model training gate is missing prerequisite ${gate}.`);
  }

  const runtime = baseModelGate?.observedRuntime || {};
  const exactRuntimeFields = [
    "exactWeightRepository",
    "exactWeightRevision",
    "imageDigest",
    "tokenizerRevision",
    "quantization"
  ];
  const runtimeIdentityComplete = exactRuntimeFields.every((key) => isEvidenceReference(runtime[key]));
  const foundationRightsReady = glmWeights?.trainingUse === "allowed" &&
    glmWeights?.derivativeTrainingUse === "allowed" &&
    glmWeights?.permissionStatus === "verified" &&
    isEvidenceReference(glmWeights?.permissionId) &&
    isExactRevision(glmWeights?.artifactRevision);
  if ((!runtimeIdentityComplete || !foundationRightsReady) && baseModelGate?.trainingAllowed !== false) {
    failures.push("Model training must fail closed while runtime identity or base-model rights evidence is incomplete.");
  }

  return failures;
}

function requireBlockedSource(entry, label, failures) {
  if (!entry) {
    failures.push(`${label} must have an explicit training-rights entry.`);
    return;
  }
  if (entry.trainingUse !== "denied" ||
      entry.derivativeTrainingUse !== "denied" ||
      entry.permissionStatus !== "blocked" ||
      entry.permissionId !== null) {
    failures.push(`${label} and its derivatives must remain explicitly denied and blocked.`);
  }
}

function isEvidenceReference(value) {
  return typeof value === "string" && value.trim().length >= 6;
}

function isExactRevision(value) {
  return isEvidenceReference(value) && !/^(latest|main|master|unknown|unresolved)$/i.test(value.trim());
}
