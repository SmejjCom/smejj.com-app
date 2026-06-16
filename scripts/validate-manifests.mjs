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
    "disabled",
    "later-partner-compute"
  ]);
  for (const provider of providers.providers) {
    if (!allowedProviderIds.has(provider.id)) failures.push(`Unexpected provider id: ${provider.id}`);
    if (provider.fallback !== "disabled" && provider.fallback !== "byok-openai-compatible") {
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
      if (!/paid|trial|workers-ai|browser-free-full-model/i.test(blocked)) {
        failures.push(`Model ${model.id} notAllowedAsDefault entry should document blocked paid/trial risk: ${blocked}`);
      }
    }
  }
}
