import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODULES = [
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
];

export async function bootstrap({ sourceBase = process.env.SMEJJ_WORKER_SOURCE_BASE } = {}) {
  const base = validateSourceBase(sourceBase);
  const target = "/tmp/smejj.com-worker-runtime";
  const files = await Promise.all(MODULES.map(async (name) => {
    const response = await fetch(`${base}/${name}`, { redirect: "error" });
    if (!response.ok) throw new Error(`worker_source_fetch_failed:${name}:${response.status}`);
    return [name, await response.text()];
  }));
  await mkdir(target, { recursive: true });
  for (const [name, content] of files) await writeFile(path.join(target, name), content, "utf8");
  const runtime = await import(pathToFileURL(path.join(target, "worker.mjs")).toString());
  return runtime.startServer();
}

function validateSourceBase(value) {
  const source = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\/runtime\/smejj-worker$/i.test(source)) {
    throw new Error("worker_source_base_must_be_commit_pinned");
  }
  return source;
}

if (process.argv[1]?.endsWith("bootstrap.mjs")) await bootstrap();
