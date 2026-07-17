#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILE_BYTES = 1_000_000;
const BOOTSTRAP_URL = /^https:\/\/raw\.githubusercontent\.com\/SmejjCom\/smejj-control\/([a-f0-9]{40})\/runtime\/bootstrap-control-release\.mjs$/i;

export async function verifyControlOverlayBaseline({
  manifest,
  manifestPath,
  bootstrapUrl,
  fetchImpl = fetch
}) {
  const release = manifest || JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  if (!Array.isArray(release.files) || release.files.length < 1) throw new Error("control_overlay_manifest_invalid");
  const runtime = parseBootstrapUrl(bootstrapUrl);
  const results = [];
  for (const item of release.files) {
    if (!/^runtime\/[a-zA-Z0-9._/-]+$/.test(String(item.path || "")) || item.path.includes("..")) {
      throw new Error("control_overlay_manifest_path_invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(String(item.baselineSha256 || ""))) {
      throw new Error(`control_overlay_baseline_sha_invalid:${item.path}`);
    }
    const url = `${runtime.repositoryBase}/${item.path}`;
    const response = await fetchImpl(url, { redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error(`control_overlay_baseline_fetch_failed:${item.path}:${response.status}`);
    const declaredLength = Number(response.headers?.get?.("content-length") || 0);
    if (declaredLength > MAX_FILE_BYTES) throw new Error(`control_overlay_baseline_too_large:${item.path}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0 || body.length > MAX_FILE_BYTES) throw new Error(`control_overlay_baseline_size_invalid:${item.path}`);
    const actualSha256 = sha256(body);
    if (actualSha256 !== item.baselineSha256) {
      throw new Error(`control_overlay_baseline_mismatch:${item.path}:${actualSha256}`);
    }
    results.push({ path: item.path, bytes: body.length, sha256: actualSha256 });
  }
  return {
    ok: true,
    provider: "github-raw-commit-pinned",
    commit: runtime.commit,
    fileCount: results.length,
    files: results
  };
}

export function parseBootstrapUrl(value) {
  const url = String(value || "").trim();
  const match = BOOTSTRAP_URL.exec(url);
  if (!match) throw new Error("control_bootstrap_url_not_approved_or_commit_pinned");
  return {
    url,
    commit: match[1].toLowerCase(),
    repositoryBase: url.slice(0, -"/runtime/bootstrap-control-release.mjs".length)
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function main() {
  const manifestPath = process.argv[2];
  const bootstrapUrl = process.argv[3] || process.env.SMEJJ_CONTROL_BOOTSTRAP_URL;
  if (!manifestPath || !bootstrapUrl) {
    throw new Error("Usage: verify_control_overlay_baseline.mjs <manifest.json> <commit-pinned-bootstrap-url>");
  }
  console.log(JSON.stringify(await verifyControlOverlayBaseline({ manifestPath, bootstrapUrl }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
