#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  failAndExit,
  isTextFile,
  listRepoFiles,
  readJson,
  readText,
  rootDir,
  walkValue
} from "./validation-utils.mjs";

const failures = [];
const files = listRepoFiles();

checkNoGitHubActions();
checkNoCloudflareArtifacts();
checkNoSecrets();
checkNoLargeBinaries();
checkNoModelWeights();
checkNoPositivePaidConfiguration();
checkNoUnsafePackageScripts();

failAndExit("Paid service and security check", failures);

function checkNoGitHubActions() {
  // ERLAUBNISLISTE (Betreiber-Entscheidung 2026-08-15, Begruendung in den
  // Dateien selbst): Das Repo ist oeffentlich, Actions kosten dort 0 EUR
  // (docs/policy/GITHUB_KOSTENFREI.md, Konto-Budgets stehen auf $0 mit
  // Stop-usage). Diese zwei Laeufe ERSETZEN den abgeschafften Zeabur-Dienst
  // smejj-autopilot-jobs — sie sparen Kosten, statt welche zu erzeugen.
  // Jede WEITERE Workflow-Datei bleibt verboten (Erlaubnisliste, keine
  // Verbotsliste): wer eine braucht, traegt sie hier mit Begruendung ein.
  const erlaubt = new Set([
    ".github/workflows/codeberg-spiegel.yml",
    ".github/workflows/qualitaets-messlauf.yml"
  ]);
  const workflows = files.filter((file) => file.startsWith(".github/workflows/") && !erlaubt.has(file));
  if (workflows.length) failures.push(`GitHub Actions workflows are not allowed: ${workflows.join(", ")}`);
}

function checkNoCloudflareArtifacts() {
  const forbidden = ["wrangler.jsonc", "wrangler.toml", ".wrangler/", "cloudflare-worker/", "src/worker.js", "src/edge/"];
  for (const marker of forbidden) {
    const hit = files.find((file) => file === marker || file.startsWith(marker));
    if (hit) failures.push(`Cloudflare artifact must not exist in the repo: ${hit}`);
  }
}

function checkNoSecrets() {
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    /IDRIVE_E2_(?:(?:TRAINING|WATCHDOG)_)?SECRET_KEY=(?!$|replace_me|<set>|\.\.\.)[^\s]+/,
    /IDRIVE_E2_(?:(?:TRAINING|WATCHDOG)_)?ACCESS_KEY=(?!$|replace_me|<set>|\.\.\.)[^\s]+/,
    /SMEJJ_LLM_API_KEY=(?!$|replace_me|local)[^\s]+/
  ];

  for (const file of files) {
    if (file.startsWith(".git/") || file.startsWith("node_modules/")) continue;
    if (file === "scripts/check-no-paid-services.mjs" || file === "scripts/release/free_tier_release_guard.mjs") continue;
    if (/^\.env($|\.)/.test(file) && file !== ".env.example") {
      failures.push(`${file} must not be tracked or staged.`);
      continue;
    }
    if (!isTextFile(file)) continue;
    const absolute = path.join(rootDir, file);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 1_000_000) continue;
    const text = readText(file);
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) failures.push(`Secret-like value found in ${file}.`);
    }
  }
}

function checkNoLargeBinaries() {
  const maxBytes = 1_000_000;
  for (const file of files) {
    if (file.startsWith("node_modules/") || file.startsWith(".git/")) continue;
    const absolute = path.join(rootDir, file);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) continue;
    if (stat.size > maxBytes) failures.push(`Large file must not be in repo: ${file} (${stat.size} bytes)`);
  }
}

function checkNoModelWeights() {
  const forbiddenExtensions = /\.(safetensors|gguf|bin|pt|pth|ckpt|onnx|parquet)$/i;
  const forbiddenDirs = /^(model-files|models|idrive-layout\/objects\/sha256\/[0-9a-f]{2}\/)/i;
  for (const file of files) {
    if (forbiddenExtensions.test(file)) failures.push(`Model/binary artifact must not be in repo: ${file}`);
    if (forbiddenDirs.test(file) && !file.endsWith(".gitkeep") && !file.endsWith("README.md")) {
      failures.push(`Storage artifact must not be committed: ${file}`);
    }
  }
}

function checkNoPositivePaidConfiguration() {
  const jsonFiles = [
    "idrive-layout/manifests/app/capabilities.json",
    "idrive-layout/manifests/providers/providers.json",
    "idrive-layout/manifests/models/registry.json",
    "idrive-layout/manifests/projects/example-project.json",
    "idrive-layout/manifests/deployments/current.json"
  ];
  const dangerousTrueKeys = /PaidAllowed|paidFallbackAllowed|autoPaidFallbackAllowed|trialServicesAllowed|autoBillingAllowed|storesSecretsInBrowser|storesSecretsInRepo|privateAbsolutePathsAllowed|storeModelWeightsInRepo|storeLargeMediaInRepo|largeMediaInRepoAllowed|secretsAllowed/i;
  for (const file of jsonFiles) {
    const json = readJson(file);
    walkValue(json, (value, pathParts) => {
      const key = pathParts[pathParts.length - 1] || "";
      if (dangerousTrueKeys.test(key) && value === true) {
        failures.push(`${file} enables forbidden policy: ${pathParts.join(".")}`);
      }
    });
  }
}

function checkNoUnsafePackageScripts() {
  const pkg = readJson("package.json");
  const scripts = pkg.scripts || {};
  const forbiddenCommands = [
    /\bnpx\b/i,
    /wrangler\s+deploy/i,
    /wrangler\s+pages\s+deploy/i,
    /pages\s+deploy/i,
    /gh\s+codespace/i,
    /git\s+lfs/i
  ];
  for (const [name, command] of Object.entries(scripts)) {
    for (const pattern of forbiddenCommands) {
      if (pattern.test(command)) {
        failures.push(`Unsafe package script command is not allowed in "${name}": ${command}`);
      }
    }
  }
}
