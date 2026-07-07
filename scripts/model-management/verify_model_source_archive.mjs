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

async function signedS3List({ endpoint, region, accessKey, secretKey, bucket, prefix }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const method = "GET";
  const canonicalUri = `/${bucket}`;
  const queryPairs = [
    ["list-type", "2"],
    ["max-keys", "1000"],
    ["prefix", prefix],
  ];
  const canonicalQuery = queryPairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const { amzDate, dateStamp } = getDates(new Date());
  const payloadHash = sha256("");
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpoint.replace(/\/$/, "")}${canonicalUri}?${canonicalQuery}`;
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  });
  return { response, body: await response.text() };
}

function parseKeys(xml) {
  return Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (match) => match[1]);
}

loadLocalEnv(path.join(rootDir, ".env.local"));
loadLocalEnv(path.join(rootDir, ".env"));

const endpoint = requiredEnv("IDRIVE_E2_ENDPOINT");
const accessKey = requiredEnv("IDRIVE_E2_ACCESS_KEY");
const secretKey = requiredEnv("IDRIVE_E2_SECRET_KEY");
const bucket = requiredEnv("IDRIVE_E2_BUCKET");
const region = process.env.IDRIVE_E2_REGION || "us-west-2";
const prefix = (process.env.MODEL_S3_PREFIX || "model-files/glm-5-2-fp8").replace(/\/$/, "");
const requiredKeys = (process.env.MODEL_SOURCE_REQUIRED_KEYS || [
  "checksums/upstream-file-inventory.json",
  "configs/huggingface-api-metadata.json",
  "configs/source-summary.json",
  "notes/LICENSE",
  "notes/README.md",
  "notes/TRANSFER_STATUS.txt",
].join(",")).split(",").map((key) => key.trim()).filter(Boolean);

const { response, body } = await signedS3List({
  endpoint,
  region,
  accessKey,
  secretKey,
  bucket,
  prefix: `${prefix}/`,
});

if (!response.ok) {
  console.error(`IDrive e2 source archive list failed: HTTP ${response.status}`);
  console.error(body.slice(0, 500));
  process.exit(1);
}

const keys = new Set(parseKeys(body));
const missing = requiredKeys
  .map((key) => `${prefix}/${key}`)
  .filter((key) => !keys.has(key));

if (missing.length) {
  console.error(`Model source archive verification failed for s3://${bucket}/${prefix}/`);
  for (const key of missing) console.error(`- missing ${key}`);
  process.exit(1);
}

console.log(`Model source archive verification OK: s3://${bucket}/${prefix}/`);
console.log(`Required objects: ${requiredKeys.length}`);
