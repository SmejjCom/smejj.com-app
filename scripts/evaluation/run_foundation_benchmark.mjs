#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDATION_CHECK_ALLOWLIST,
  FOUNDATION_PROTECTED_ASSET_ALLOWLIST,
  validateBenchmarkSuite
} from "../../src/evaluation/modelPromotion.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const SUITE_FILE = path.join(
  REPO_ROOT,
  "idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json"
);
const PACKAGE_FILE = path.join(REPO_ROOT, "package.json");
const CHECK_TIMEOUT_MS = 15 * 60 * 1000;
const SAFE_ENV_KEYS = new Set(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "CI", "PNPM_HOME"]);

export function verifyPinnedPackageScripts(suite, packageScripts) {
  const failures = [];
  const scripts = packageScripts && typeof packageScripts === "object" ? packageScripts : {};
  for (const check of suite?.execution?.checks || []) {
    if (!FOUNDATION_CHECK_ALLOWLIST.includes(check.id)) {
      failures.push({ code: "package_check_not_allowlisted", checkId: check.id });
      continue;
    }
    if (typeof scripts[check.id] !== "string") {
      failures.push({ code: "package_script_missing", checkId: check.id });
      continue;
    }
    if (sha256Text(scripts[check.id]) !== check.scriptSha256) {
      failures.push({ code: "package_script_digest_mismatch", checkId: check.id });
    }
  }
  return { ok: failures.length === 0, failures };
}

export function verifyPinnedProtectedAssets(suite, actualDigests) {
  const failures = [];
  for (const asset of suite?.execution?.protectedAssets || []) {
    if (!FOUNDATION_PROTECTED_ASSET_ALLOWLIST.includes(asset.path)) {
      failures.push({ code: "protected_asset_not_allowlisted", assetPath: asset.path });
      continue;
    }
    if (actualDigests?.[asset.path] !== asset.sha256) {
      failures.push({ code: "protected_asset_digest_mismatch", assetPath: asset.path });
    }
  }
  return { ok: failures.length === 0, failures };
}

export async function loadProtectedAssetDigests({ repoRoot = REPO_ROOT } = {}) {
  const entries = await Promise.all(FOUNDATION_PROTECTED_ASSET_ALLOWLIST.map(async (assetPath) => {
    const bytes = await readFile(path.join(repoRoot, assetPath));
    return [assetPath, sha256Text(bytes)];
  }));
  return Object.fromEntries(entries);
}

export function runFoundationBenchmark({ suite, packageScripts, protectedAssetDigests, executeCheck }) {
  const suiteValidation = validateBenchmarkSuite(suite);
  if (!suiteValidation.ok) {
    return benchmarkSummary(suite, [], suiteValidation.reasons.map((code) => ({ code })));
  }
  const scriptValidation = verifyPinnedPackageScripts(suite, packageScripts);
  if (!scriptValidation.ok) return benchmarkSummary(suite, [], scriptValidation.failures);
  const assetValidation = verifyPinnedProtectedAssets(suite, protectedAssetDigests);
  if (!assetValidation.ok) return benchmarkSummary(suite, [], assetValidation.failures);
  if (typeof executeCheck !== "function") {
    return benchmarkSummary(suite, [], [{ code: "check_executor_missing" }]);
  }

  const results = [];
  for (const check of suite.execution.checks) {
    let result;
    try {
      result = executeCheck(check.id);
    } catch {
      result = { ok: false, exitCode: null, reason: "check_executor_failed" };
    }
    results.push({
      checkId: check.id,
      status: result?.ok === true ? "passed" : "failed",
      exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
      reason: result?.ok === true ? null : safeReason(result?.reason)
    });
  }

  const failures = results
    .filter((result) => result.status !== "passed")
    .map((result) => ({ code: result.reason || "check_failed", checkId: result.checkId }));
  return benchmarkSummary(suite, results, failures);
}

export function executePnpmCheck(checkId, {
  cwd = REPO_ROOT,
  sourceEnv = process.env,
  environmentAllowlist = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "CI", "PNPM_HOME"]
} = {}) {
  if (!FOUNDATION_CHECK_ALLOWLIST.includes(checkId)) {
    return { ok: false, exitCode: null, reason: "check_not_allowlisted" };
  }
  const env = buildSafeEnvironment(sourceEnv, environmentAllowlist);
  const result = spawnSync("pnpm", ["run", checkId], {
    cwd,
    env,
    shell: false,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: CHECK_TIMEOUT_MS,
    killSignal: "SIGTERM",
    windowsHide: true
  });
  if (result.error) return { ok: false, exitCode: null, reason: "process_launch_failed" };
  if (result.signal) return { ok: false, exitCode: result.status, reason: "check_terminated" };
  return {
    ok: result.status === 0,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    reason: result.status === 0 ? null : "check_failed"
  };
}

export function buildSafeEnvironment(sourceEnv, allowlist) {
  const env = {};
  for (const key of allowlist || []) {
    if (!SAFE_ENV_KEYS.has(key)) throw new Error("unsafe_environment_key_requested");
    if (typeof sourceEnv?.[key] === "string") env[key] = sourceEnv[key];
  }
  if (!env.PATH) throw new Error("safe_environment_requires_path");
  env.CI = "1";
  return env;
}

function benchmarkSummary(suite, checks, failures) {
  const ok = failures.length === 0 && checks.length === (suite?.execution?.checks?.length || 0);
  return {
    schemaVersion: 1,
    suite: suite ? {
      suiteId: suite.suiteId,
      version: suite.version,
      contentSha256: suite.integrity?.contentSha256 || null
    } : null,
    ok,
    eligibleForTraining: false,
    automaticDeploymentAllowed: false,
    runner: {
      packageManager: "pnpm",
      shell: false,
      logBodiesCaptured: false,
      outputPersistence: "none"
    },
    checks,
    failures
  };
}

function safeReason(value) {
  const allowed = new Set([
    "check_executor_failed",
    "check_not_allowlisted",
    "process_launch_failed",
    "check_terminated",
    "check_failed"
  ]);
  return allowed.has(value) ? value : "check_failed";
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function main() {
  if (process.argv.length > 2) {
    if (process.argv.length === 3 && ["--help", "-h"].includes(process.argv[2])) {
      process.stdout.write("Run the immutable smejj.com Phase 1 foundation benchmark; results are stdout-only.\n");
      return;
    }
    process.stdout.write(`${JSON.stringify({ ok: false, error: "unsupported_arguments" })}\n`);
    process.exitCode = 2;
    return;
  }

  let suite;
  let packageJson;
  let protectedAssetDigests;
  try {
    [suite, packageJson, protectedAssetDigests] = await Promise.all([
      readFile(SUITE_FILE, "utf8").then(JSON.parse),
      readFile(PACKAGE_FILE, "utf8").then(JSON.parse),
      loadProtectedAssetDigests()
    ]);
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, error: "benchmark_configuration_unreadable" })}\n`);
    process.exitCode = 1;
    return;
  }

  const summary = runFoundationBenchmark({
    suite,
    packageScripts: packageJson.scripts,
    protectedAssetDigests,
    executeCheck: (checkId) => executePnpmCheck(checkId, {
      cwd: REPO_ROOT,
      environmentAllowlist: suite.execution.environmentAllowlist
    })
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!summary.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  await main();
}
