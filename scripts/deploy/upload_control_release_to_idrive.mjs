#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signedS3Get, signedS3Put } from "../../control-server/src/storage/s3Signer.js";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const MAX_BYTES = 16 * 1024 * 1024;
const CONTROL_KEY = /^deployments\/control\/[a-z0-9._/-]+\.tar\.gz$/i;

export async function uploadControlRelease({
  filePath,
  key,
  expectedSha256,
  config,
  fetchImpl = fetch
}) {
  const input = validateControlReleaseInput({ filePath, key, expectedSha256, config });
  const body = fs.readFileSync(input.filePath);
  if (body.length === 0 || body.length > MAX_BYTES) throw new Error("Control release artifact size is invalid");
  const actualSha256 = sha256(body);
  if (actualSha256 !== input.expectedSha256) {
    throw new Error("Control release artifact SHA-256 does not match the approved value");
  }

  const object = {
    ...input.config,
    key: input.key,
    body,
    contentType: "application/gzip",
    ifNoneMatch: "*",
    fetchImpl,
    timeoutMs: input.timeoutMs
  };
  const firstPut = await signedS3Put(object);
  if (firstPut.status !== 412 && (firstPut.ok !== true || firstPut.conditionEnforced !== true)) {
    throw new Error("IDrive e2 conditional release creation was not enforced");
  }

  let created = false;
  let overwriteProofStatus = firstPut.status;
  if (firstPut.status !== 412) {
    created = true;
    const overwriteProof = await signedS3Put(object);
    overwriteProofStatus = overwriteProof.status;
    if (overwriteProof.status !== 412 || overwriteProof.conditionEnforced !== true) {
      throw new Error("IDrive e2 immutable overwrite proof failed");
    }
  }

  const readback = await signedS3Get({
    ...input.config,
    key: input.key,
    responseType: "buffer",
    fetchImpl,
    timeoutMs: input.timeoutMs
  });
  if (readback.ok !== true || !Buffer.isBuffer(readback.body)) {
    throw new Error("IDrive e2 release verification read failed");
  }
  if (readback.body.length !== body.length || sha256(readback.body) !== actualSha256) {
    throw new Error("IDrive e2 release verification mismatch");
  }

  return {
    ok: true,
    provider: "idrive-e2",
    object: `s3://${input.config.bucket}/${input.key}`,
    bytes: body.length,
    sha256: actualSha256,
    created,
    immutable: true,
    overwriteProofStatus,
    contentVerified: true
  };
}

export function validateControlReleaseInput({ filePath, key, expectedSha256, config }) {
  const resolvedFile = path.resolve(String(filePath || ""));
  const normalizedKey = String(key || "").trim();
  const digest = String(expectedSha256 || "").trim().toLowerCase();
  if (!CONTROL_KEY.test(normalizedKey) || normalizedKey.includes("..") || normalizedKey.includes("//")) {
    throw new Error("SMEJJ_CONTROL_ARTIFACT_KEY is outside the approved prefix");
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("SMEJJ_CONTROL_ARTIFACT_SHA256 is required");
  const safeConfig = {
    endpoint: String(config?.endpoint || "").trim().replace(/\/+$/, ""),
    region: String(config?.region || "us-west-2").trim(),
    accessKey: String(config?.accessKey || "").trim(),
    secretKey: String(config?.secretKey || "").trim(),
    bucket: String(config?.bucket || "").trim()
  };
  if (new URL(safeConfig.endpoint).protocol !== "https:") throw new Error("IDrive e2 endpoint must use HTTPS");
  for (const [name, value] of Object.entries(safeConfig)) {
    if (!value) throw new Error(`${name} is required`);
  }
  const timeoutMs = boundedNumber(config?.timeoutMs, 30_000, 5_000, 120_000);
  return { filePath: resolvedFile, key: normalizedKey, expectedSha256: digest, config: safeConfig, timeoutMs };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function main(env = process.env) {
  loadSecureLocalEnv();
  if (env.CONFIRM_CONTROL_RELEASE_UPLOAD !== "YES") {
    throw new Error("Set CONFIRM_CONTROL_RELEASE_UPLOAD=YES only after checks, rollback and written staging or release approval");
  }
  const result = await uploadControlRelease({
    filePath: required(env, "SMEJJ_CONTROL_RELEASE_FILE"),
    key: required(env, "SMEJJ_CONTROL_ARTIFACT_KEY"),
    expectedSha256: required(env, "SMEJJ_CONTROL_ARTIFACT_SHA256"),
    config: {
      endpoint: required(env, "IDRIVE_E2_ENDPOINT"),
      region: env.IDRIVE_E2_REGION || "us-west-2",
      accessKey: required(env, "IDRIVE_E2_ACCESS_KEY"),
      secretKey: required(env, "IDRIVE_E2_SECRET_KEY"),
      bucket: env.IDRIVE_E2_DEPLOY_BUCKET || required(env, "IDRIVE_E2_BUCKET"),
      timeoutMs: env.IDRIVE_E2_RELEASE_TIMEOUT_MS
    }
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
