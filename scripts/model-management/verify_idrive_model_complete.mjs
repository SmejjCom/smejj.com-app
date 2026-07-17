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

async function signedS3Request({ method, endpoint, region, accessKey, secretKey, bucket, key, query }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const canonicalUri = key ? `/${bucket}/${encodeS3Path(key)}` : `/${bucket}`;
  const queryString = canonicalQuery(query);
  const { amzDate, dateStamp } = getDates(new Date());
  const payloadHash = sha256("");
  const signedHeaderEntries = {
    host,
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
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Fetch failed: ${url} HTTP ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function headObject(config, key) {
  const response = await signedS3Request({ ...config, method: "HEAD", key });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HEAD failed for ${key}: HTTP ${response.status}`);
  return {
    size: Number(response.headers.get("content-length") || -1),
    etag: response.headers.get("etag") || "",
  };
}

async function getObjectText(config, key) {
  const response = await signedS3Request({ ...config, method: "GET", key });
  const text = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET failed for ${key}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text;
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

function selectedFiles(files, includePattern) {
  return files
    .filter((file) => file.rfilename && file.rfilename !== ".gitattributes")
    .filter((file) => includePattern.test(file.rfilename))
    .sort((a, b) => a.rfilename.localeCompare(b.rfilename));
}

loadLocalEnv(secureLocalEnvPath());

const modelRepo = requiredEnv("HF_MODEL_REPO");
const prefix = requiredEnv("MODEL_S3_PREFIX").replace(/\/$/, "");
const includeRegex = new RegExp(process.env.STREAM_INCLUDE_REGEX || ".*");
const checksumKey = process.env.MODEL_CHECKSUM_KEY || `${prefix}/checksums/streamed-checksums.sha256`;
const config = {
  endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
  secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
  bucket: requiredEnv("IDRIVE_E2_BUCKET"),
};

const metadata = await fetchJson(`https://huggingface.co/api/models/${modelRepo}?blobs=true`);
const files = selectedFiles(metadata.siblings || [], includeRegex);
const checksumText = await getObjectText(config, checksumKey);
const checksumMap = checksumText ? parseSha256Manifest(checksumText) : new Map();
const problems = [];

console.log(`Verifying ${files.length} files for ${modelRepo}`);
console.log(`IDrive prefix: s3://${config.bucket}/${prefix}/original/`);

for (const file of files) {
  const key = `${prefix}/original/${file.rfilename}`;
  const object = await headObject(config, key);
  if (!object) {
    problems.push(`missing object: ${key}`);
    continue;
  }
  if (object.size !== file.size) {
    problems.push(`size mismatch: ${key} expected ${file.size}, got ${object.size}`);
  }
  const expectedSha = file.lfs?.sha256?.toLowerCase();
  const manifestSha = checksumMap.get(file.rfilename);
  if (expectedSha && manifestSha && manifestSha !== expectedSha) {
    problems.push(`checksum mismatch in manifest for ${file.rfilename}`);
  }
  if (checksumText && expectedSha && !manifestSha) {
    problems.push(`missing checksum entry: ${file.rfilename}`);
  }
}

if (problems.length > 0) {
  console.error(`Model IDrive verification failed with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("Model IDrive verification OK.");
