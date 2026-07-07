#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readText(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(rootDir, file));
}

function git(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
}

function repoFiles() {
  const output = git(["ls-files", "--cached", "--others", "--exclude-standard"]);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => exists(file));
}

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walkObject(value, visit, pathParts = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkObject(item, visit, [...pathParts, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    visit(key, child, nextPath);
    walkObject(child, visit, nextPath);
  }
}

function checkNoGitHubActions(files) {
  const workflows = files.filter((file) => file.startsWith(".github/workflows/"));
  if (workflows.length) {
    fail(`GitHub Actions workflows are not allowed as core architecture: ${workflows.join(", ")}`);
  }
}

function checkNoGitLfs(files) {
  if (!exists(".gitattributes")) return;
  const text = readText(".gitattributes");
  if (/filter\s*=\s*lfs/i.test(text) || /git-lfs/i.test(text)) {
    fail("Git LFS is not allowed because it can create paid storage/bandwidth risk.");
  }
}

function checkNoCloudflareArtifacts() {
  const forbiddenPaths = [
    "wrangler.jsonc",
    "wrangler.toml",
    ".wrangler",
    "cloudflare-worker",
    "src/worker.js",
    "src/edge"
  ];
  for (const artifact of forbiddenPaths) {
    if (exists(artifact)) {
      fail(`Cloudflare artifact is no longer allowed in the repo: ${artifact} (hosting is GitHub Pages, see docs/deployment/GITHUB_PAGES_DEPLOY.md).`);
    }
  }
}

function checkPackageScripts() {
  const pkg = JSON.parse(readText("package.json"));
  const scripts = pkg.scripts || {};
  if (!scripts["release:guard"]) fail("package.json must expose release:guard.");
  if (!scripts["release:preflight"]) fail("package.json must expose release:preflight.");
  if (!scripts["idrive:artifact"]) fail("package.json must expose idrive:artifact for IDrive deployment artifacts.");

  const forbidden = [
    /gh\s+codespace/i,
    /git\s+lfs/i,
    /\bnpx\b/i,
    /wrangler\s+deploy/i,
    /wrangler\s+r2\b/i,
    /wrangler\s+d1\b/i,
    /wrangler\s+kv\b/i,
    /wrangler\s+queues\b/i,
    /wrangler\s+vectorize\b/i,
    /wrangler\s+pages\s+deploy/i,
    /pages\s+deploy/i
  ];
  for (const [name, command] of Object.entries(scripts)) {
    for (const pattern of forbidden) {
      if (pattern.test(command)) fail(`Paid-risk command is not allowed in package script "${name}": ${command}`);
    }
  }
}

function checkEnvExample() {
  if (!exists(".env.example")) {
    fail(".env.example is required and must document IDrive e2 variables.");
    return;
  }
  const text = readText(".env.example");
  for (const name of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_REGION", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) {
    if (!new RegExp(`^${name}=`, "m").test(text)) fail(`.env.example is missing ${name}.`);
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^(IDRIVE_E2_ACCESS_KEY|IDRIVE_E2_SECRET_KEY|SMEJJ_LLM_API_KEY)=\S+/.test(line) && !line.endsWith("replace_me")) {
      fail(`.env.example must not contain real secret values: ${line.split("=")[0]}`);
    }
  }
}

function checkTrackedSecrets(files) {
  const safeTextExtensions = new Set([".js", ".mjs", ".json", ".jsonc", ".html", ".css", ".md", ".sh", ".webmanifest", ".example"]);
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /IDRIVE_E2_SECRET_KEY=(?!$|replace_me|<set>)[^\s]+/,
    /IDRIVE_E2_ACCESS_KEY=(?!$|replace_me|<set>)[^\s]+/,
    /SMEJJ_LLM_API_KEY=(?!$|replace_me|local)[^\s]+/
  ];

  for (const file of files) {
    if (file.startsWith("docs/")) continue;
    if (file === "scripts/release/free_tier_release_guard.mjs") continue;
    if (file === "scripts/check-no-paid-services.mjs") continue;
    if (file.startsWith(".git/") || file.startsWith("node_modules/")) continue;
    if (/^\.env($|\.)/.test(file) && file !== ".env.example") fail(`${file} must not be tracked or staged.`);
    const ext = path.extname(file);
    if (!safeTextExtensions.has(ext) && !file.endsWith(".env.example")) continue;
    const absolute = path.join(rootDir, file);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 1_000_000) continue;
    const text = fs.readFileSync(absolute, "utf8");
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) fail(`Secret-like value found in ${file}.`);
    }
  }
}

function checkControlServerFreeSafety() {
  const server = exists("src/server.js") ? readText("src/server.js") : "";
  if (!server.includes("./shared/platform.js")) {
    fail("Control server must use the central platform configuration.");
  }
  const forbiddenRuntimeBindings = [
    /env\.[A-Z0-9_]+\.(prepare|put|get|send)\(/,
    /env\.[A-Z0-9_]*(R2|KV|D1|QUEUE|VECTOR|IMAGE|STREAM)[A-Z0-9_]*/
  ];
  for (const pattern of forbiddenRuntimeBindings) {
    if (pattern.test(server)) {
      fail("Control server code appears to use a paid-risk storage/queue/database binding.");
    }
  }
  if (!server.includes("IDRIVE_E2_ENDPOINT")) {
    fail("Control server must keep IDrive e2 as the storage status backend.");
  }
}

function checkDocsExist() {
  for (const file of [
    "docs/FREE_ARCHITECTURE.md",
    "docs/architecture/CENTRAL_ARCHITECTURE.md",
    "docs/architecture/FREE_TIER_IDRIVE_GUARDRAILS.md",
    "docs/architecture/NO_BIG_SERVER_KIMI_STRATEGY.md",
    "docs/architecture/CONNECTION_AUDIT_2026-06-16.md",
    "docs/architecture/RELEASE_PROTECTION.md",
    "src/shared/platform.js",
    "public/config.js",
    "public/robots.txt",
    "public/llms.txt",
    "public/sitemap.xml"
  ]) {
    if (!exists(file)) fail(`Required architecture or platform file is missing: ${file}`);
  }
}

const files = repoFiles();
checkNoGitHubActions(files);
checkNoGitLfs(files);
checkNoCloudflareArtifacts();
checkPackageScripts();
checkEnvExample();
checkTrackedSecrets(files);
checkControlServerFreeSafety();
checkDocsExist();

for (const message of warnings) console.warn(`WARN: ${message}`);

if (failures.length) {
  console.error("Free-tier release guard failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Free-tier release guard OK: GitHub Free, GitHub Pages hosting, IDrive e2 primary storage, Salad pay-per-use.");
