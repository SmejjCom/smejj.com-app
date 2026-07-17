import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EPHEMERAL_WORKER_FILES = Object.freeze([
  "allowlist.mjs",
  "path-policy.mjs",
  "safe-search.mjs",
  "sandbox.mjs",
  "repository.mjs",
  "verification.mjs",
  "model-client.mjs",
  "browser-verification.mjs",
  "publish.mjs",
  "role-registry.mjs",
  "agentloop.mjs",
  "worker.mjs"
]);

export async function buildEphemeralRuntimeManifest({ projectRoot = process.cwd() } = {}) {
  const files = [];
  for (const name of EPHEMERAL_WORKER_FILES) {
    const source = await readFile(path.join(projectRoot, "workers/smejj-worker", name), "utf8");
    if (!source || Buffer.byteLength(source, "utf8") > 1_000_000) throw new Error(`ephemeral_runtime_source_size_invalid:${name}`);
    files.push({ path: `smejj-worker/${name}`, sha256: sha256(source) });
  }
  const manifest = { schemaVersion: 1, files };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const bootstrap = await readFile(path.join(projectRoot, "scripts/deploy/bootstrap-ephemeral-worker.mjs"), "utf8");
  return {
    manifest,
    text,
    manifestSha256: sha256(text),
    bootstrapSha256: sha256(bootstrap),
    fileCount: files.length
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

const directPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (directPath) {
  const result = await buildEphemeralRuntimeManifest();
  console.log(JSON.stringify({
    ok: true,
    fileCount: result.fileCount,
    manifestSha256: result.manifestSha256,
    bootstrapSha256: result.bootstrapSha256,
    manifest: result.manifest
  }, null, 2));
}
