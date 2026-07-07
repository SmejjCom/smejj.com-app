import { allow, block, evaluateProvider, normalizeObjectKey, requireIdrivePresignConfig, validatePresignUploadPolicy } from "./policy.js";

const PRESIGN_TTL_SECONDS = 300;

export async function createPresignedIdriveUrl({ env = {}, operation, key, contentType = "application/octet-stream", contentLength = 0 } = {}) {
  const providerCheck = evaluateProvider("idrive-e2");
  if (!providerCheck.ok) return providerCheck;

  const configCheck = requireIdrivePresignConfig(env);
  if (!configCheck.ok) return configCheck;

  const method = operation === "upload" ? "PUT" : operation === "download" ? "GET" : null;
  if (!method) return block("presign_operation_not_allowed");

  const objectKey = normalizeObjectKey(key);
  if (!objectKey) return block("object_key_not_allowed");

  const uploadPolicy = validatePresignUploadPolicy({ operation, contentType, contentLength });
  if (!uploadPolicy.ok) return uploadPolicy;

  const endpoint = new URL(env.IDRIVE_E2_ENDPOINT);
  const bucket = String(env.IDRIVE_E2_BUCKET);
  const region = String(env.IDRIVE_E2_REGION);
  const accessKey = String(env.IDRIVE_E2_ACCESS_KEY);
  const secretKey = String(env.IDRIVE_E2_SECRET_KEY);
  const host = endpoint.host;
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const now = new Date();
  const { amzDate, dateStamp } = awsDates(now);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = "host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(PRESIGN_TTL_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders
  });

  const canonicalQuery = [...query.entries()]
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = await awsSigningKey(secretKey, dateStamp, region);
  const signature = await hmacHex(signingKey, stringToSign);
  query.set("X-Amz-Signature", signature);

  const url = `${endpoint.protocol}//${host}${canonicalUri}?${query.toString()}`;
  return allow({
    method,
    url,
    headers: operation === "upload" ? { "Content-Type": contentType } : {},
    expiresIn: PRESIGN_TTL_SECONDS,
    proxiedByWorker: false
  });
}

function awsDates(date) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(bytes));
}

async function hmacBytes(key, value) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

async function hmacHex(key, value) {
  return bytesToHex(await hmacBytes(key, value));
}

async function awsSigningKey(secret, dateStamp, region) {
  const kDate = await hmacBytes(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, "s3");
  return hmacBytes(kService, "aws4_request");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
