// smejj.com glm-salad Worker — SigV4-signierte IDrive-e2-Zugriffe
// (Single Responsibility: S3-Signierung und sichere Objekt-Keys).
// Aus worker.js extrahiert, um die 800-Zeilen-Regel einzuhalten.
import { createHash, createHmac } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

export function assertSafeObjectKey(key) {
  const value = String(key || "");
  if (!value || value.startsWith("/") || value.includes("..") || /[\\]/.test(value)) throw new Error("unsafe_idrive_object_key");
}

export async function signedS3Request(config, method, key, body = "", contentType = "application/octet-stream") {
  assertSafeObjectKey(key);
  const endpoint = config.idrive.endpoint;
  const bucket = config.idrive.bucket;
  const url = new URL(`/${bucket}/${key}`, endpoint);
  const requestBody = Buffer.isBuffer(body) ? body : String(body || "");
  const headers = signAwsV4({
    method,
    url,
    region: config.idrive.region,
    accessKey: config.idrive.accessKey,
    secretKey: config.idrive.secretKey,
    body: requestBody,
    contentType
  });
  const response = await fetch(url, { method, headers, body: method === "GET" ? undefined : requestBody });
  const text = await response.text();
  if (!response.ok) throw new Error(`idrive_${method.toLowerCase()}_${response.status}: ${text.slice(0, 200)}`);
  return text;
}

export function signAwsV4({ method, url, region, accessKey, secretKey, body, contentType }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const payloadHash = sha256(body || "");
  const host = url.host;
  const canonicalUri = encodeURI(url.pathname).replace(/%2F/g, "/");
  const canonicalQuery = "";
  const canonicalHeaders = [`host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(contentType ? { "content-type": contentType } : {})
  };
}
