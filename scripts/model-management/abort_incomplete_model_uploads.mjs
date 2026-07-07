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

function canonicalQuery(query = {}) {
  return Object.entries(query)
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function signedS3Request({ method, endpoint, region, accessKey, secretKey, bucket, key, query, body = Buffer.alloc(0) }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const canonicalUri = key ? `/${bucket}/${encodeS3Path(key)}` : `/${bucket}`;
  const queryString = canonicalQuery(query);
  const { amzDate, dateStamp } = getDates(new Date());
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256(payload);
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
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
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : payload,
  });
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseUploads(xml) {
  return Array.from(xml.matchAll(/<Upload>([\s\S]*?)<\/Upload>/g), (match) => {
    const key = match[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const uploadId = match[1].match(/<UploadId>([\s\S]*?)<\/UploadId>/)?.[1];
    return key && uploadId ? { key: decodeXml(key), uploadId: decodeXml(uploadId) } : null;
  }).filter(Boolean);
}

loadLocalEnv(path.join(rootDir, ".env.local"));
loadLocalEnv(path.join(rootDir, ".env"));

if (process.env.CONFIRM_ABORT_INCOMPLETE_UPLOADS !== "YES") {
  console.error("Refusing to abort incomplete uploads. Set CONFIRM_ABORT_INCOMPLETE_UPLOADS=YES after confirming the prefix.");
  process.exit(1);
}

const config = {
  endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
  secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
  bucket: requiredEnv("IDRIVE_E2_BUCKET"),
};
const prefix = (process.env.MODEL_S3_PREFIX || "model-files/kimi-k2-7").replace(/\/$/, "");
const response = await signedS3Request({
  ...config,
  method: "GET",
  query: { uploads: "", prefix: `${prefix}/original/` },
});
const xml = await response.text();
if (!response.ok) throw new Error(`List multipart uploads failed: HTTP ${response.status} ${xml.slice(0, 300)}`);

const uploads = parseUploads(xml);
console.log(`Incomplete multipart uploads found: ${uploads.length}`);
for (const upload of uploads) {
  const abort = await signedS3Request({
    ...config,
    method: "DELETE",
    key: upload.key,
    query: { uploadId: upload.uploadId },
  });
  const text = await abort.text();
  if (!abort.ok) throw new Error(`Abort failed for ${upload.key}: HTTP ${abort.status} ${text.slice(0, 300)}`);
  console.log(`Aborted: ${upload.key}`);
}
