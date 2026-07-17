#!/usr/bin/env node
import fs from "node:fs";
import { failAndExit, readJson } from "./validation-utils.mjs";

const failures = [];

const capabilities = readJson("idrive-layout/manifests/app/capabilities.json");
const providers = readJson("idrive-layout/manifests/providers/providers.json");
const models = readJson("idrive-layout/manifests/models/registry.json");
const deployment = readJson("idrive-layout/manifests/deployments/current.json");

if (capabilities.costPolicy.githubPaidAllowed) failures.push("GitHub paid is allowed in capabilities.");
if (capabilities.costPolicy.paidHostingAllowed) failures.push("Paid hosting is allowed in capabilities.");
if (capabilities.costPolicy.autoPaidFallbackAllowed) failures.push("Auto paid fallback is allowed in capabilities.");
if (capabilities.costPolicy.trialServicesAllowed) failures.push("Trial services are allowed in capabilities.");
if (capabilities.costPolicy.paidFallbackAllowed) failures.push("Paid fallback is allowed in capabilities.");
if (!capabilities.compute.failClosed) failures.push("Compute does not fail closed.");
if (capabilities.storage.primary !== "idrive-e2") failures.push("IDrive e2 is not the primary storage.");

if (providers.defaultMode !== "disabled") failures.push("Providers default mode must be disabled.");
if (!providers.policy.failClosed) failures.push("Providers policy must fail closed.");
if (providers.policy.paidFallbackAllowed) failures.push("Providers policy allows paid fallback.");

if (models.policy.paidPlatformServicesAllowed) failures.push("Models registry allows paid platform services.");
if (models.policy.storeModelWeightsInRepo) failures.push("Models registry allows model weights in repo.");
if (models.policy.primaryStorage !== "idrive-e2") failures.push("Models registry primary storage is not IDrive e2.");

for (const [key, value] of Object.entries(deployment.costPolicy)) {
  if (value !== false) failures.push(`Deployment cost policy must keep ${key} false.`);
}
if (!deployment.release.requiresWrittenApproval) failures.push("Deployment requiresWrittenApproval must be true.");
if (deployment.release.livePublished) failures.push("Deployment manifest must not mark livePublished true.");
if (!deployment.release.rollbackRequired) failures.push("Deployment rollbackRequired must be true.");

checkNoCloudflareConfig();
checkPackageScripts();

failAndExit("Cost guardrails", failures);

function checkNoCloudflareConfig() {
  for (const artifact of ["wrangler.jsonc", "wrangler.toml", ".wrangler", "cloudflare-worker", "src/worker.js", "src/edge"]) {
    if (fs.existsSync(artifact)) failures.push(`Cloudflare artifact must not exist: ${artifact}`);
  }
}

function checkPackageScripts() {
  const pkg = readJson("package.json");
  const forbiddenCommands = [
    /gh\s+codespace/i,
    /git\s+lfs/i,
    /wrangler\s+r2\b/i,
    /wrangler\s+d1\b/i,
    /wrangler\s+kv\b/i,
    /wrangler\s+queues\b/i,
    /wrangler\s+vectorize\b/i,
    /wrangler\s+pages\s+deploy/i
  ];
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    for (const pattern of forbiddenCommands) {
      if (pattern.test(command)) failures.push(`Paid-risk command in package script ${name}: ${command}`);
    }
  }
}

