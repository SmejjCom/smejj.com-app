#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secureLocalEnvPath } from "../../src/shared/env.js";

const rootDir = process.cwd();
const localEnvPath = secureLocalEnvPath();

export const BOOTSTRAP_FILES = Object.freeze([
  ["docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md", "projects/smejj/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md"],
  ["docs/architecture/PHASE_1_GLM_COMPLETION_CHECKLIST.md", "projects/smejj/architecture/PHASE_1_GLM_COMPLETION_CHECKLIST.md"],
  ["docs/architecture/AI_MODEL_ROUTER_ROLES.md", "projects/smejj/architecture/AI_MODEL_ROUTER_ROLES.md"],
  ["docs/model-management/GLM_5_2_STORAGE.md", "models/glm-5-2/runtime-notes/GLM_5_2_STORAGE.md"],
  ["idrive-layout/manifests/models/glm-5-2/model-manifest.json", "models/glm-5-2/model-manifest.json"],
  ["idrive-layout/manifests/models/glm-5-2/shard-map.json", "models/glm-5-2/shard-map.json"],
  ["idrive-layout/manifests/models/glm-5-2/checksums.json", "models/glm-5-2/checksums.json"],
  ["idrive-layout/manifests/model-cache/glm-5-2/worker-cache-map.json", "model-cache-manifests/glm-5-2/worker-cache-map.json"],
  ["idrive-layout/manifests/model-cache/glm-5-2/prefix-blocks.json", "model-cache-manifests/glm-5-2/prefix-blocks.json"],
  ["idrive-layout/manifests/context-plans/example-context-plan.json", "projects/smejj/context-plans/example-context-plan.json"],
  ["idrive-layout/manifests/task-capsules/example-task-capsule.json", "projects/smejj/task-capsules/example-task-capsule.json"],
  ["idrive-layout/manifests/projects/example-project.json", "projects/smejj/current-manifest.json"],
  ["idrive-layout/manifests/providers/providers.json", "manifests/providers/providers.json"],
  ["idrive-layout/manifests/models/registry.json", "manifests/models/registry.json"],
  ["idrive-layout/manifests/workers/salad-worker-preflight.json", "workers/salad/salad-worker-preflight.json"],
  ["schemas/glm-model-manifest.schema.json", "app/schemas/glm-model-manifest.schema.json"],
  ["schemas/glm-shard-map.schema.json", "app/schemas/glm-shard-map.schema.json"],
  ["schemas/glm-checksums.schema.json", "app/schemas/glm-checksums.schema.json"],
  ["schemas/model-cache-manifest.schema.json", "app/schemas/model-cache-manifest.schema.json"],
  ["schemas/context-plan.schema.json", "app/schemas/context-plan.schema.json"],
  ["schemas/task-capsule.schema.json", "app/schemas/task-capsule.schema.json"],
  ["schemas/salad-worker-preflight.schema.json", "app/schemas/salad-worker-preflight.schema.json"]
]);

export function buildBootstrapManifest({ files = BOOTSTRAP_FILES, createdAt = new Date().toISOString() } = {}) {
  const entries = files.map(([source, key]) => {
    assertRelativeRepoPath(source);
    assertSafeObjectKey(key);
    const absolute = path.join(rootDir, source);
    const body = fs.readFileSync(absolute);
    return {
      source,
      key,
      bytes: body.length,
      sha256: sha256Buffer(body),
      contentType: contentTypeFor(source)
    };
  });
  return {
    version: 1,
    app: "smejj.com",
    type: "glm-5.2-storage-first-object-brain-bootstrap",
    createdAt,
    storage: {
      provider: "idrive-e2",
      compute: false
    },
    policy: {
      githubPaidAllowed: false,
      paidHostingAllowed: false,
      startsGpuCompute: false,
      storesSecrets: false,
      modelWeightsIncluded: false
    },
    entries
  };
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Set it in the shell or the secure local env file.`);
  return value;
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function getDates(date) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function encodeS3Path(key) {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function signedS3Request({ method, endpoint, region, accessKey, secretKey, bucket, key, body = Buffer.alloc(0), contentType }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const canonicalUri = `/${bucket}/${encodeS3Path(key)}`;
  const { amzDate, dateStamp } = getDates(new Date());
  const payloadHash = sha256Buffer(body);
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ""
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Text(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const headers = {
    Authorization: `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (contentType) headers["Content-Type"] = contentType;
  return fetch(`${endpoint.replace(/\/$/, "")}${canonicalUri}`, {
    method,
    headers,
    body: method === "PUT" ? body : undefined
  });
}

function assertRelativeRepoPath(source) {
  if (path.isAbsolute(source) || source.includes("..") || source.startsWith(".")) throw new Error(`Unsafe source path: ${source}`);
}

function assertSafeObjectKey(key) {
  if (!key || key.startsWith("/") || key.includes("..") || /[\\]/.test(key)) throw new Error(`Unsafe object key: ${key}`);
  if (/secret|token|credential/i.test(key)) throw new Error(`Secret-like object key is not allowed: ${key}`);
}

function contentTypeFor(file) {
  if (file.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function main() {
  loadLocalEnv(localEnvPath);
  const manifest = buildBootstrapManifest();
  const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const stamp = new Date(manifest.createdAt).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const manifestKeys = [
    [`bootstrap/smejj/glm-5-2-storage-first/${stamp}.json`, manifestBody],
    ["bootstrap/smejj/glm-5-2-storage-first/latest.json", manifestBody]
  ];

  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ ok: true, uploadCount: manifest.entries.length + manifestKeys.length, manifest }, null, 2));
    return;
  }

  if (process.env.CONFIRM_IDRIVE_BOOTSTRAP !== "YES") {
    console.error("Refusing to bootstrap IDrive e2. Set CONFIRM_IDRIVE_BOOTSTRAP=YES after checks and confirmation.");
    process.exit(1);
  }

  const config = {
    endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
    accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
    secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
    bucket: requiredEnv("IDRIVE_E2_BUCKET"),
    region: process.env.IDRIVE_E2_REGION || "us-west-2"
  };

  const uploads = [
    ...manifest.entries.map((entry) => [entry.key, fs.readFileSync(path.join(rootDir, entry.source)), entry.contentType, entry.sha256]),
    ...manifestKeys.map(([key, body]) => [key, body, "application/json; charset=utf-8", sha256Buffer(body)])
  ];

  const written = [];
  for (const [key, body, contentType, expectedSha] of uploads) {
    const put = await signedS3Request({ method: "PUT", ...config, key, body, contentType });
    if (!put.ok) throw new Error(`IDrive e2 bootstrap upload failed for ${key}: HTTP ${put.status} ${(await put.text()).slice(0, 500)}`);
    const get = await signedS3Request({ method: "GET", ...config, key });
    const downloaded = Buffer.from(await get.arrayBuffer());
    if (!get.ok) throw new Error(`IDrive e2 bootstrap verify failed for ${key}: HTTP ${get.status} ${downloaded.toString("utf8").slice(0, 500)}`);
    const actualSha = sha256Buffer(downloaded);
    if (actualSha !== expectedSha) throw new Error(`IDrive e2 checksum mismatch for ${key}`);
    written.push({ key, bytes: body.length, sha256: expectedSha });
  }

  console.log(JSON.stringify({ ok: true, provider: "idrive-e2", bucket: config.bucket, objectCount: written.length, written }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
