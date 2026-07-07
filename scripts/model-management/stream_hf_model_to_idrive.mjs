#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const FIVE_MIB = 5 * 1024 * 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, operation, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      console.log(`  retry ${attempt}/${attempts - 1} for ${label} after ${error.message}`);
      await sleep(delayMs);
    }
  }
  throw lastError;
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

function canonicalQuery(query = {}) {
  return Object.entries(query)
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function signedS3Request({
  method,
  endpoint,
  region,
  accessKey,
  secretKey,
  bucket,
  key,
  query,
  body = Buffer.alloc(0),
  headers = {},
  retryAttempts = 5,
}) {
  return withRetry(`${method} ${key || bucket}`, async () => {
    const endpointUrl = new URL(endpoint);
    const host = endpointUrl.host;
    const canonicalUri = key ? `/${bucket}/${encodeS3Path(key)}` : `/${bucket}`;
    const queryString = canonicalQuery(query);
    const { amzDate, dateStamp } = getDates(new Date());
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payloadHash = sha256(payload);
    const signedHeaderEntries = {
      host,
      ...Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value).trim()])),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const signedHeaderNames = Object.keys(signedHeaderEntries).sort();
    const canonicalHeaders = `${signedHeaderNames.map((name) => `${name}:${signedHeaderEntries[name]}`).join("\n")}\n`;
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      queryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [algorithm, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign, "hex");
    const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const url = `${endpoint.replace(/\/$/, "")}${canonicalUri}${queryString ? `?${queryString}` : ""}`;
    return fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      body: method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : payload,
    });
  }, retryAttempts);
}

function parseUploadId(xml) {
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) throw new Error(`Multipart upload id missing: ${xml.slice(0, 300)}`);
  return match[1];
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchJson(url, retryAttempts = 5) {
  return withRetry(`json ${url}`, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${url} HTTP ${response.status}`);
    return response.json();
  }, retryAttempts);
}

async function fetchRange(url, start, end, hfToken, retryAttempts) {
  const headers = { Range: `bytes=${start}-${end}` };
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
  return withRetry(`range ${start}-${end}`, async () => {
    const response = await fetch(url, { headers, redirect: "follow" });
    if (!(response.status === 206 || response.status === 200)) {
      const text = await response.text();
      throw new Error(`Range fetch failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }, retryAttempts);
}

async function initiateMultipart(config, key) {
  const response = await signedS3Request({
    ...config,
    method: "POST",
    key,
    query: { uploads: "" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Multipart initiate failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return parseUploadId(text);
}

async function uploadPart(config, key, uploadId, partNumber, body) {
  const response = await signedS3Request({
    ...config,
    method: "PUT",
    key,
    query: { partNumber: String(partNumber), uploadId },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Multipart part ${partNumber} failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  const etag = response.headers.get("etag");
  if (!etag) throw new Error(`Multipart part ${partNumber} for ${key} returned no ETag.`);
  return etag;
}

async function completeMultipart(config, key, uploadId, parts) {
  const body = [
    "<CompleteMultipartUpload>",
    ...parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`),
    "</CompleteMultipartUpload>",
  ].join("");
  const response = await signedS3Request({
    ...config,
    method: "POST",
    key,
    query: { uploadId },
    body,
    headers: { "content-type": "application/xml" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Multipart complete failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
}

async function abortMultipart(config, key, uploadId) {
  await signedS3Request({
    ...config,
    method: "DELETE",
    key,
    query: { uploadId },
  });
}

async function putSmallObject(config, key, body, contentType) {
  const response = await signedS3Request({
    ...config,
    method: "PUT",
    key,
    body,
    headers: { "content-type": contentType },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Put failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
}

async function headObject(config, key) {
  const response = await signedS3Request({
    ...config,
    method: "HEAD",
    key,
    retryAttempts: 2,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Head failed for ${key}: HTTP ${response.status}`);
  return {
    size: Number(response.headers.get("content-length") || -1),
    etag: response.headers.get("etag") || "",
  };
}

function selectedFiles(files, includePattern) {
  return files
    .filter((file) => file.rfilename && file.rfilename !== ".gitattributes")
    .filter((file) => includePattern.test(file.rfilename))
    .sort((a, b) => a.rfilename.localeCompare(b.rfilename));
}

loadLocalEnv(path.join(rootDir, ".env.local"));
loadLocalEnv(path.join(rootDir, ".env"));

if (process.env.CONFIRM_STREAM_MODEL_UPLOAD !== "YES") {
  console.error("Refusing streaming upload. Set CONFIRM_STREAM_MODEL_UPLOAD=YES after confirming IDrive e2 capacity, source, license, and network stability.");
  process.exit(1);
}

const modelRepo = process.env.HF_MODEL_REPO || "moonshotai/Kimi-K2.7-Code";
const prefix = (process.env.MODEL_S3_PREFIX || "model-files/kimi-k2-7").replace(/\/$/, "");
const includeRegex = new RegExp(process.env.STREAM_INCLUDE_REGEX || ".*");
const partSize = Number(process.env.STREAM_PART_SIZE_BYTES || 64 * 1024 * 1024);
const retryAttempts = Number(process.env.STREAM_RETRY_ATTEMPTS || 5);
const skipExisting = process.env.STREAM_SKIP_EXISTING !== "NO";
if (!Number.isSafeInteger(partSize) || partSize < FIVE_MIB) throw new Error("STREAM_PART_SIZE_BYTES must be at least 5242880.");
if (!Number.isSafeInteger(retryAttempts) || retryAttempts < 1) throw new Error("STREAM_RETRY_ATTEMPTS must be a positive integer.");

const config = {
  endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
  secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
  bucket: requiredEnv("IDRIVE_E2_BUCKET"),
  retryAttempts,
};

const hfToken = process.env.HF_TOKEN || "";
const metadata = await fetchJson(`https://huggingface.co/api/models/${modelRepo}?blobs=true`, retryAttempts);
const files = selectedFiles(metadata.siblings || [], includeRegex);
const generatedAt = new Date().toISOString();
const checksums = [];

console.log(`Streaming ${files.length} files from ${modelRepo} to s3://${config.bucket}/${prefix}/original/`);
console.log(`Part size: ${Math.round(partSize / 1024 / 1024)} MiB`);
console.log(`Retry attempts per network operation: ${retryAttempts}`);
console.log(`Skip existing completed objects: ${skipExisting ? "yes" : "no"}`);

for (const file of files) {
  const size = file.size;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Missing size for ${file.rfilename}; cannot stream safely.`);
  const key = `${prefix}/original/${file.rfilename}`;
  const sourceUrl = `https://huggingface.co/${modelRepo}/resolve/main/${file.rfilename}`;
  if (skipExisting) {
    const existing = await headObject(config, key);
    if (existing?.size === size) {
      console.log(`Skipping existing ${file.rfilename} (${(size / 1024 / 1024 / 1024).toFixed(2)} GiB)`);
      continue;
    }
  }
  const uploadId = await initiateMultipart(config, key);
  const hash = crypto.createHash("sha256");
  const parts = [];
  let uploaded = 0;
  let partNumber = 1;

  console.log(`Uploading ${file.rfilename} (${(size / 1024 / 1024 / 1024).toFixed(2)} GiB)`);
  try {
    while (uploaded < size || (size === 0 && partNumber === 1)) {
      const end = size === 0 ? 0 : Math.min(uploaded + partSize, size) - 1;
      const body = size === 0 ? Buffer.alloc(0) : await fetchRange(sourceUrl, uploaded, end, hfToken, retryAttempts);
      if (body.length && body.length !== end - uploaded + 1) {
        throw new Error(`Unexpected byte count for ${file.rfilename} part ${partNumber}: ${body.length}`);
      }
      hash.update(body);
      const etag = await uploadPart(config, key, uploadId, partNumber, body);
      parts.push({ partNumber, etag });
      uploaded += body.length;
      console.log(`  part ${partNumber}: ${(uploaded / 1024 / 1024 / 1024).toFixed(2)} / ${(size / 1024 / 1024 / 1024).toFixed(2)} GiB`);
      partNumber += 1;
      if (size === 0) break;
    }
    await completeMultipart(config, key, uploadId, parts);
  } catch (error) {
    await abortMultipart(config, key, uploadId).catch(() => {});
    throw error;
  }

  const digest = hash.digest("hex");
  checksums.push(`${digest}  ${file.rfilename}`);
  console.log(`Finished ${file.rfilename}: ${digest}`);
}

const checksumBody = `${checksums.join("\n")}\n`;
await putSmallObject(
  config,
  `${prefix}/checksums/streamed-checksums.sha256`,
  checksumBody,
  "text/plain; charset=utf-8"
);
await putSmallObject(
  config,
  `${prefix}/notes/STREAM_TRANSFER_STATUS.json`,
  `${JSON.stringify({
    generatedAt,
    modelRepo,
    source: `https://huggingface.co/${modelRepo}`,
    prefix,
    fileCount: files.length,
    includeRegex: includeRegex.source,
    checksumManifest: `${prefix}/checksums/streamed-checksums.sha256`,
  }, null, 2)}\n`,
  "application/json; charset=utf-8"
);

console.log("Streaming upload complete.");
