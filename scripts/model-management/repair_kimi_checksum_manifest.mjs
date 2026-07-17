#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { secureLocalEnvPath } from "../../src/shared/env.js";

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
  if (!value) throw new Error(`${name} is required. Set it in the shell or the secure local env file.`);
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

async function signedS3Request({ method, endpoint, region, accessKey, secretKey, bucket, key, query, body = Buffer.alloc(0), headers = {} }) {
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
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
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
    body: method === "GET" || method === "HEAD" ? undefined : payload,
  });
}

async function getObjectText(config, key) {
  const response = await signedS3Request({ ...config, method: "GET", key });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text;
}

async function putObjectText(config, key, text) {
  const response = await signedS3Request({
    ...config,
    method: "PUT",
    key,
    body: Buffer.from(text, "utf8"),
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`PUT failed for ${key}: HTTP ${response.status} ${body.slice(0, 300)}`);
}

function parseSha256Manifest(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (match) map.set(match[2], match[1].toLowerCase());
  }
  return map;
}

async function hashIdriveObject(config, key, expectedSize) {
  const response = await signedS3Request({ ...config, method: "GET", key });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    hash.update(buffer);
    bytes += buffer.length;
    if (bytes && bytes % (1024 * 1024 * 1024) < buffer.length) {
      console.log(`${key}: ${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB read`);
    }
  }
  if (bytes !== expectedSize) throw new Error(`Size read mismatch for ${key}: expected ${expectedSize}, read ${bytes}`);
  return hash.digest("hex");
}

loadLocalEnv(secureLocalEnvPath());

if (process.env.CONFIRM_REPAIR_KIMI_CHECKSUMS !== "YES") {
  throw new Error("Set CONFIRM_REPAIR_KIMI_CHECKSUMS=YES to repair the checksum manifest.");
}

const modelRepo = process.env.HF_MODEL_REPO || "moonshotai/Kimi-K2.7-Code";
const prefix = (process.env.MODEL_S3_PREFIX || "model-files/kimi-k2-7").replace(/\/$/, "");
const config = {
  endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
  secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
  bucket: requiredEnv("IDRIVE_E2_BUCKET"),
};

const checksumKey = `${prefix}/checksums/streamed-checksums.sha256`;
const sourceResponse = await fetch(`https://huggingface.co/api/models/${modelRepo}?blobs=true`);
if (!sourceResponse.ok) throw new Error(`Hugging Face metadata failed: HTTP ${sourceResponse.status}`);
const sourceMetadata = await sourceResponse.json();
const filesWithSha256 = (sourceMetadata.siblings || [])
  .filter((file) => file.rfilename && file.rfilename !== ".gitattributes")
  .filter((file) => file.lfs?.sha256)
  .sort((a, b) => a.rfilename.localeCompare(b.rfilename));

const checksumMap = parseSha256Manifest(await getObjectText(config, checksumKey));
const missing = filesWithSha256.filter((file) => !checksumMap.has(file.rfilename));
console.log(`Missing checksum entries: ${missing.length}`);

for (const file of missing) {
  const expectedSha = file.lfs?.sha256?.toLowerCase();
  if (!expectedSha) throw new Error(`No upstream sha256 for ${file.rfilename}`);
  const key = `${prefix}/original/${file.rfilename}`;
  console.log(`Hashing IDrive object ${file.rfilename}`);
  const actualSha = await hashIdriveObject(config, key, file.size);
  if (actualSha !== expectedSha) throw new Error(`SHA mismatch for ${file.rfilename}`);
  checksumMap.set(file.rfilename, actualSha);
  console.log(`Verified ${file.rfilename}: ${actualSha}`);
}

const repaired = Array.from(checksumMap.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([fileName, digest]) => `${digest}  ${fileName}`)
  .join("\n");
await putObjectText(config, checksumKey, `${repaired}\n`);
console.log(`Checksum manifest repaired: ${checksumMap.size} entries`);
