#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const rootDir = process.cwd();
const localEnvPath = path.join(rootDir, ".env.local");

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
  if (!value) throw new Error(`${name} is required. Set it in the shell or .env.local.`);
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
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Text(canonicalRequest)
  ].join("\n");
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

function git(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
}

function listedFiles() {
  const output = git(["ls-files", "--cached", "--others", "--exclude-standard"]);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.startsWith(".git/"))
    .filter((file) => !file.startsWith("node_modules/"))
    .filter((file) => !file.startsWith(".wrangler/"))
    .filter((file) => !file.startsWith("dist/"))
    .filter((file) => !file.startsWith("build/"))
    .filter((file) => !file.startsWith("tmp/"))
    .filter((file) => !file.startsWith(".env"))
    .filter((file) => !file.endsWith(".log"));
}

function fileRecord(file) {
  const absolute = path.join(rootDir, file);
  const content = fs.readFileSync(absolute);
  return {
    path: file,
    bytes: content.length,
    sha256: sha256Buffer(content),
    content: content.toString("base64")
  };
}

loadLocalEnv(localEnvPath);

if (process.env.CONFIRM_IDRIVE_ARTIFACT_UPLOAD !== "YES") {
  console.error("Refusing to upload deployment artifact. Set CONFIRM_IDRIVE_ARTIFACT_UPLOAD=YES only after local checks, backup, rollback point, and written release approval.");
  process.exit(1);
}

const endpoint = requiredEnv("IDRIVE_E2_ENDPOINT");
const accessKey = requiredEnv("IDRIVE_E2_ACCESS_KEY");
const secretKey = requiredEnv("IDRIVE_E2_SECRET_KEY");
const bucket = requiredEnv("IDRIVE_E2_BUCKET");
const region = process.env.IDRIVE_E2_REGION || "us-west-2";
const now = new Date();
const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
const shortSha = git(["rev-parse", "--short=12", "HEAD"]);
const branch = git(["branch", "--show-current"]) || "detached";
const status = git(["status", "--short"]);
const files = listedFiles().map(fileRecord);
const artifact = {
  app: "smejj.com",
  type: "source-and-deployment-artifact",
  createdAt: now.toISOString(),
  costPolicy: "GitHub Free and Cloudflare Free only; IDrive e2 is primary storage.",
  git: {
    branch,
    commit: git(["rev-parse", "HEAD"]),
    status
  },
  cloudflare: {
    worker: "smejj-com",
    config: "wrangler.jsonc",
    allowedRole: "DNS, static/PWA shell, light edge routing on Free plan only"
  },
  storage: {
    provider: "idrive-e2",
    bucket,
    retention: "immutable append-only artifact; delete is not required for runtime"
  },
  files
};

const json = Buffer.from(JSON.stringify(artifact, null, 2), "utf8");
const gz = zlib.gzipSync(json, { level: 9 });
const basePrefix = `deployment-artifacts/smejj-com/${stamp.slice(0, 8)}/${stamp}-${shortSha}`;
const artifactKey = `${basePrefix}.json.gz`;
const manifestKey = `${basePrefix}.manifest.json`;
const manifest = Buffer.from(JSON.stringify({
  key: artifactKey,
  bytes: gz.length,
  sha256: sha256Buffer(gz),
  uncompressedBytes: json.length,
  uncompressedSha256: sha256Buffer(json),
  fileCount: files.length,
  createdAt: artifact.createdAt,
  git: artifact.git,
  costPolicy: artifact.costPolicy
}, null, 2), "utf8");

for (const [key, body, contentType] of [
  [artifactKey, gz, "application/gzip"],
  [manifestKey, manifest, "application/json; charset=utf-8"]
]) {
  const put = await signedS3Request({ method: "PUT", endpoint, region, accessKey, secretKey, bucket, key, body, contentType });
  if (!put.ok) throw new Error(`IDrive e2 upload failed for ${key}: HTTP ${put.status} ${await put.text()}`);
  const get = await signedS3Request({ method: "GET", endpoint, region, accessKey, secretKey, bucket, key });
  const downloaded = Buffer.from(await get.arrayBuffer());
  if (!get.ok) throw new Error(`IDrive e2 download failed for ${key}: HTTP ${get.status} ${downloaded.toString("utf8").slice(0, 500)}`);
  if (sha256Buffer(downloaded) !== sha256Buffer(body)) throw new Error(`IDrive e2 verification mismatch for ${key}`);
  console.log(`IDrive e2 artifact OK: s3://${bucket}/${key}`);
}
