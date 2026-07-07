#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Set it in the shell or .env.local.`);
  return value;
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function sha256(data, encoding = "hex") {
  return crypto.createHash("sha256").update(data).digest(encoding);
}

function getDates(date) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function encodeS3Path(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function fetchOptionalText(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Fetch failed: ${url} HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Fetch failed: ${url} HTTP ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function signedS3Put({ endpoint, region, accessKey, secretKey, bucket, key, body, contentType }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const method = "PUT";
  const canonicalUri = `/${bucket}/${encodeS3Path(key)}`;
  const { amzDate, dateStamp } = getDates(new Date());
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256(payload);
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpoint.replace(/\/$/, "")}${canonicalUri}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authorization,
      "content-type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: payload,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IDrive e2 put failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
}

loadLocalEnv(path.join(rootDir, ".env.local"));
loadLocalEnv(path.join(rootDir, ".env"));

if (process.env.CONFIRM_ARCHIVE_MODEL_SOURCE !== "YES") {
  throw new Error("Set CONFIRM_ARCHIVE_MODEL_SOURCE=YES after checking source, license, IDrive e2 capacity, and transfer intent.");
}

const endpoint = requiredEnv("IDRIVE_E2_ENDPOINT");
const accessKey = requiredEnv("IDRIVE_E2_ACCESS_KEY");
const secretKey = requiredEnv("IDRIVE_E2_SECRET_KEY");
const bucket = requiredEnv("IDRIVE_E2_BUCKET");
const region = process.env.IDRIVE_E2_REGION || "us-west-2";
const modelRepo = requiredEnv("HF_MODEL_REPO");
const displayName = process.env.MODEL_DISPLAY_NAME || modelRepo;
const prefix = requiredEnv("MODEL_S3_PREFIX").replace(/\/$/, "");
const hfBase = `https://huggingface.co/${modelRepo}`;

const apiMetadata = await fetchJson(`https://huggingface.co/api/models/${modelRepo}?blobs=true`);
const siblings = apiMetadata.siblings || [];
const safetensors = siblings.filter((file) => file.rfilename?.endsWith(".safetensors"));
const totalBytes = siblings.reduce((sum, file) => sum + (file.size || 0), 0);
const generatedAt = new Date().toISOString();

const sourceFiles = [
  ["LICENSE", "text/plain; charset=utf-8"],
  ["THIRD_PARTY_NOTICES.md", "text/markdown; charset=utf-8"],
  ["README.md", "text/markdown; charset=utf-8"],
];

const summary = {
  generatedAt,
  displayName,
  source: hfBase,
  modelRepo,
  sha: apiMetadata.sha,
  license: apiMetadata.cardData?.license,
  licenseName: apiMetadata.cardData?.license_name,
  fileCount: siblings.length,
  safetensorsFileCount: safetensors.length,
  totalBytes,
  totalGiB: Number((totalBytes / 1024 / 1024 / 1024).toFixed(1)),
  transferStatus: "source-metadata-archived-awaiting-weight-transfer",
  storagePolicy: "IDrive e2 is authoritative storage. GitHub stays on the free tier and do not store model weights.",
};

const transferStatus = [
  `${displayName} source metadata archive`,
  "",
  `Generated: ${generatedAt}`,
  `Source: ${hfBase}`,
  `Snapshot SHA: ${apiMetadata.sha}`,
  `Files: ${siblings.length}`,
  `Safetensors files: ${safetensors.length}`,
  `Reported bytes: ${totalBytes}`,
  `Reported GiB: ${summary.totalGiB}`,
  "",
  "No model weights were downloaded or uploaded by this metadata archive step.",
  "Full weight transfer must use CONFIRM_STREAM_MODEL_UPLOAD=YES and must pass capacity, license, and network-stability checks first.",
  "GitHub must remain permanently free-tier only and must not store model weights or central data.",
  "IDrive e2 is the durable storage target.",
  "",
].join("\n");

const uploads = [
  {
    key: `${prefix}/notes/TRANSFER_STATUS.txt`,
    body: transferStatus,
    contentType: "text/plain; charset=utf-8",
  },
  {
    key: `${prefix}/configs/huggingface-api-metadata.json`,
    body: `${JSON.stringify(apiMetadata, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
  },
  {
    key: `${prefix}/configs/source-summary.json`,
    body: `${JSON.stringify(summary, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
  },
  {
    key: `${prefix}/checksums/upstream-file-inventory.json`,
    body: `${JSON.stringify({ generatedAt, source: hfBase, files: siblings }, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
  },
];

for (const [fileName, contentType] of sourceFiles) {
  const body = await fetchOptionalText(`${hfBase}/raw/main/${fileName}`);
  if (body) uploads.push({ key: `${prefix}/notes/${fileName}`, body, contentType });
}

for (const upload of uploads) {
  await signedS3Put({ endpoint, region, accessKey, secretKey, bucket, ...upload });
  console.log(`Uploaded: s3://${bucket}/${upload.key}`);
}

console.log(`${displayName} source metadata archive complete.`);
