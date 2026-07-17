import crypto from "node:crypto";

const EMPTY_SHA256 = crypto.createHash("sha256").update("").digest("hex");
const MAX_KEY_BYTES = 1_024;
const MAX_CONFIGURED_OBJECT_BYTES = 8 * 1024 * 1024;
const JSON_CONTENT_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/i;
const responseTimeouts = new WeakMap();
const conditionalWriterInstances = new WeakSet();
const attestorWriterInstances = new WeakSet();

/** Reads only dedicated training-storage variables. General IDrive credentials are never used. */
export function readTrainingIdriveConfig(env = process.env) {
  return validateConfig({
    endpoint: required(env, "IDRIVE_E2_TRAINING_ENDPOINT"),
    region: required(env, "IDRIVE_E2_TRAINING_REGION"),
    accessKey: required(env, "IDRIVE_E2_TRAINING_ACCESS_KEY"),
    secretKey: required(env, "IDRIVE_E2_TRAINING_SECRET_KEY"),
    bucket: required(env, "IDRIVE_E2_TRAINING_BUCKET"),
    allowedPrefixes: parsePrefixes(required(env, "IDRIVE_E2_TRAINING_ALLOWED_PREFIXES")),
    maxObjectBytes: integerSetting(env.IDRIVE_E2_TRAINING_MAX_OBJECT_BYTES, 1_048_576, 1, MAX_CONFIGURED_OBJECT_BYTES),
    timeoutMs: integerSetting(env.IDRIVE_E2_TRAINING_TIMEOUT_MS, 5_000, 100, 30_000),
    recoveryAttempts: integerSetting(env.IDRIVE_E2_TRAINING_RECOVERY_ATTEMPTS, 3, 1, 5),
    retryDelayMs: integerSetting(env.IDRIVE_E2_TRAINING_RETRY_DELAY_MS, 100, 0, 2_000)
  });
}

/** Reads a separate least-privilege principal limited to immutable job evidence. */
export function readTrainingEvidenceAttestorIdriveConfig(env = process.env) {
  const config = validateConfig({
    endpoint: required(env, "IDRIVE_E2_TRAINING_ATTESTOR_ENDPOINT"),
    region: required(env, "IDRIVE_E2_TRAINING_ATTESTOR_REGION"),
    accessKey: required(env, "IDRIVE_E2_TRAINING_ATTESTOR_ACCESS_KEY"),
    secretKey: required(env, "IDRIVE_E2_TRAINING_ATTESTOR_SECRET_KEY"),
    bucket: required(env, "IDRIVE_E2_TRAINING_ATTESTOR_BUCKET"),
    allowedPrefixes: ["jobs/"],
    maxObjectBytes: integerSetting(env.IDRIVE_E2_TRAINING_ATTESTOR_MAX_OBJECT_BYTES, 1_048_576, 1, MAX_CONFIGURED_OBJECT_BYTES),
    timeoutMs: integerSetting(env.IDRIVE_E2_TRAINING_ATTESTOR_TIMEOUT_MS, 5_000, 100, 30_000),
    recoveryAttempts: integerSetting(env.IDRIVE_E2_TRAINING_ATTESTOR_RECOVERY_ATTEMPTS, 3, 1, 5),
    retryDelayMs: integerSetting(env.IDRIVE_E2_TRAINING_ATTESTOR_RETRY_DELAY_MS, 100, 0, 2_000)
  }, { attestor: true });
  const peerAccessKeys = [
    env.IDRIVE_E2_TRAINING_ACCESS_KEY,
    env.IDRIVE_E2_WATCHDOG_ACCESS_KEY,
    env.IDRIVE_E2_ACCESS_KEY
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (peerAccessKeys.includes(config.accessKey)) {
    throw writerError("training_attestor_principal_not_separate");
  }
  return config;
}

/** Creates a body-bound immutable object descriptor for the conditional writer. */
export function createImmutableTrainingObject({ key, body, contentType = "application/json; charset=utf-8", statusLast = false }) {
  const payload = toBuffer(body);
  return {
    key,
    body: Buffer.isBuffer(body) ? Buffer.from(body) : body,
    contentType,
    ifNoneMatch: "*",
    conditionRequired: true,
    statusLast,
    sizeBytes: payload.length,
    sha256: sha256(payload)
  };
}

/** Builds an append-only IDrive e2 writer with SigV4, recovery and collision proof. */
export function createConditionalIdriveWriter(configInput, {
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  sleep = defaultSleep
} = {}) {
  const config = validateConfig(configInput);
  return buildConditionalWriter(config, { fetchImpl, clock, sleep }, conditionalWriterInstances);
}

/** Builds the separately branded job-evidence attestor writer. */
export function createTrainingEvidenceAttestorWriter(configInput, {
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  sleep = defaultSleep
} = {}) {
  const config = validateConfig({ ...configInput, allowedPrefixes: ["jobs/"] }, { attestor: true });
  return buildConditionalWriter(config, { fetchImpl, clock, sleep }, attestorWriterInstances);
}

function buildConditionalWriter(config, { fetchImpl, clock, sleep }, registry) {
  if (typeof fetchImpl !== "function") throw writerError("training_idrive_fetch_required");
  if (typeof clock !== "function" || typeof sleep !== "function") {
    throw writerError("training_idrive_runtime_dependency_invalid");
  }

  const summary = Object.freeze({
    provider: "idrive-e2",
    endpointHost: new URL(config.endpoint).host,
    region: config.region,
    bucket: config.bucket,
    allowedPrefixes: [...config.allowedPrefixes],
    maxObjectBytes: config.maxObjectBytes,
    immutable: true
  });

  const writer = Object.freeze({
    summary,
    putObject: async (input) => putImmutableObject(normalizeObject(input, config), {
      config,
      fetchImpl,
      clock,
      sleep
    }),
    getObject: async (input) => getVerifiedObject(normalizeReadDescriptor(input, config), {
      config,
      fetchImpl,
      clock,
      sleep
    })
  });
  registry.add(writer);
  return writer;
}

/** Identifies a writer created by the SigV4 conditional IDrive e2 factory. */
export function isConditionalIdriveWriter(value) {
  return Boolean(value && conditionalWriterInstances.has(value));
}

/** Identifies only a writer created for the dedicated evidence-attestor role. */
export function isTrainingEvidenceAttestorWriter(value) {
  return Boolean(value && attestorWriterInstances.has(value));
}

async function getVerifiedObject(object, runtime) {
  let response;
  try {
    response = await signedFetch("GET", object, runtime);
  } catch {
    throw writerError("training_idrive_read_failed");
  }
  if (response.status !== 200) {
    const status = response.status;
    await discardResponse(response);
    throw writerError("training_idrive_read_rejected", { status });
  }
  const body = await readBoundedBody(response, runtime.config.maxObjectBytes);
  const actualSha256 = sha256(body);
  if (body.length !== object.sizeBytes || actualSha256 !== object.sha256) {
    throw writerError("training_idrive_read_digest_mismatch");
  }
  return {
    ok: true,
    status: 200,
    key: object.key,
    body,
    sizeBytes: body.length,
    sha256: actualSha256,
    contentVerified: true
  };
}

async function putImmutableObject(object, runtime) {
  let lastState = "not_attempted";
  for (let attempt = 1; attempt <= runtime.config.recoveryAttempts; attempt += 1) {
    let response;
    try {
      response = await signedFetch("PUT", object, runtime);
    } catch {
      lastState = "put_network_ambiguous";
      const inspection = await inspectExisting(object, runtime);
      if (inspection.state === "match") {
        const proof = await proveCondition(object, runtime);
        await requireVerifiedContent(object, runtime);
        return successResult(object, {
          attempt,
          createdNow: false,
          idempotent: false,
          recoveredAfterAmbiguous: true,
          putStatus: 0,
          proofStatus: proof.status
        });
      }
      if (attempt < runtime.config.recoveryAttempts) {
        await retryWait(runtime, attempt);
        continue;
      }
      throw writerError("training_idrive_recovery_exhausted", { state: inspection.state });
    }

    if (response.status === 200 || response.status === 201) {
      await discardResponse(response);
      const proof = await proveCondition(object, runtime);
      await requireVerifiedContent(object, runtime);
      return successResult(object, {
        attempt,
        createdNow: true,
        idempotent: false,
        recoveredAfterAmbiguous: false,
        putStatus: response.status,
        proofStatus: proof.status
      });
    }

    if (response.status === 412) {
      await discardResponse(response);
      const inspection = await inspectExisting(object, runtime);
      if (inspection.state === "match") {
        return successResult(object, {
          attempt,
          createdNow: false,
          idempotent: true,
          recoveredAfterAmbiguous: false,
          putStatus: 412,
          proofStatus: 412
        });
      }
      lastState = `condition_${inspection.state}`;
    } else if (isAmbiguousStatus(response.status)) {
      await discardResponse(response);
      const inspection = await inspectExisting(object, runtime);
      if (inspection.state === "match") {
        const proof = await proveCondition(object, runtime);
        await requireVerifiedContent(object, runtime);
        return successResult(object, {
          attempt,
          createdNow: false,
          idempotent: false,
          recoveredAfterAmbiguous: true,
          putStatus: response.status,
          proofStatus: proof.status
        });
      }
      lastState = `put_${response.status}_${inspection.state}`;
    } else {
      const status = response.status;
      await discardResponse(response);
      throw writerError("training_idrive_put_rejected", { status });
    }

    if (attempt < runtime.config.recoveryAttempts) await retryWait(runtime, attempt);
  }
  throw writerError("training_idrive_recovery_exhausted", { state: lastState });
}

async function proveCondition(object, runtime) {
  for (let attempt = 1; attempt <= runtime.config.recoveryAttempts; attempt += 1) {
    let response;
    try {
      response = await signedFetch("PUT", object, runtime);
    } catch {
      const inspection = await inspectExisting(object, runtime);
      if (inspection.state !== "match") {
        throw writerError("training_idrive_condition_proof_lost", { state: inspection.state });
      }
      if (attempt < runtime.config.recoveryAttempts) {
        await retryWait(runtime, attempt);
        continue;
      }
      break;
    }

    if (response.status === 412) {
      await discardResponse(response);
      return { status: 412 };
    }
    if (response.status === 200 || response.status === 201) {
      const status = response.status;
      await discardResponse(response);
      throw writerError("training_idrive_if_none_match_not_enforced", { status });
    }
    if (!isAmbiguousStatus(response.status)) {
      const status = response.status;
      await discardResponse(response);
      throw writerError("training_idrive_condition_proof_rejected", { status });
    }
    await discardResponse(response);
    const inspection = await inspectExisting(object, runtime);
    if (inspection.state !== "match") {
      throw writerError("training_idrive_condition_proof_lost", { state: inspection.state });
    }
    if (attempt < runtime.config.recoveryAttempts) await retryWait(runtime, attempt);
  }
  throw writerError("training_idrive_condition_proof_exhausted");
}

async function inspectExisting(object, runtime) {
  let response;
  try {
    response = await signedFetch("GET", object, runtime);
  } catch {
    return { state: "unavailable" };
  }
  if (response.status === 404) {
    await discardResponse(response);
    return { state: "missing" };
  }
  if (response.status !== 200) {
    const status = response.status;
    await discardResponse(response);
    if (isAmbiguousStatus(status)) return { state: "unavailable" };
    throw writerError("training_idrive_get_rejected", { status });
  }
  let body;
  try {
    body = await readBoundedBody(response, runtime.config.maxObjectBytes);
  } catch (error) {
    if (isWriterError(error)) throw error;
    return { state: "unavailable" };
  }
  const actualSha256 = sha256(body);
  if (body.length !== object.sizeBytes || actualSha256 !== object.sha256) {
    throw writerError("training_idrive_object_collision", {
      expectedSizeBytes: object.sizeBytes,
      actualSizeBytes: body.length,
      expectedSha256: object.sha256.slice(0, 16),
      actualSha256: actualSha256.slice(0, 16)
    });
  }
  return { state: "match", sizeBytes: body.length, sha256: actualSha256 };
}

async function requireVerifiedContent(object, runtime) {
  let lastState = "not_attempted";
  for (let attempt = 1; attempt <= runtime.config.recoveryAttempts; attempt += 1) {
    const inspection = await inspectExisting(object, runtime);
    if (inspection.state === "match") return inspection;
    lastState = inspection.state;
    if (attempt < runtime.config.recoveryAttempts) await retryWait(runtime, attempt);
  }
  throw writerError("training_idrive_content_verification_failed", { state: lastState });
}

async function signedFetch(method, object, runtime) {
  const request = signRequest(method, object, runtime.config, runtime.clock());
  return fetchWithTimeout(runtime.fetchImpl, request.url, {
    method,
    headers: request.headers,
    ...(method === "PUT" ? { body: object.payload } : {})
  }, runtime.config.timeoutMs);
}

function signRequest(method, object, config, dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) throw writerError("training_idrive_clock_invalid");
  const endpoint = new URL(config.endpoint);
  const canonicalUri = `/${awsEncode(config.bucket)}/${encodeKey(object.key)}`;
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = method === "PUT" ? object.sha256 : EMPTY_SHA256;
  const canonicalValues = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (method === "PUT") {
    canonicalValues["content-type"] = object.contentType;
    canonicalValues["if-none-match"] = "*";
    canonicalValues["x-amz-meta-smejj-sha256"] = object.sha256;
    canonicalValues["x-amz-meta-smejj-size"] = String(object.sizeBytes);
  }
  const names = Object.keys(canonicalValues).sort();
  const canonicalHeaders = `${names.map((name) => `${name}:${normalizeHeader(canonicalValues[name])}`).join("\n")}\n`;
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config.secretKey, dateStamp, config.region), stringToSign, "hex");
  const headers = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (method === "PUT") {
    headers["Content-Type"] = object.contentType;
    headers["If-None-Match"] = "*";
    headers["x-amz-meta-smejj-sha256"] = object.sha256;
    headers["x-amz-meta-smejj-size"] = String(object.sizeBytes);
  }
  return { url: `${config.endpoint}${canonicalUri}`, headers };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response || (typeof response !== "object" && typeof response !== "function")) {
      throw writerError("training_idrive_response_invalid");
    }
    responseTimeouts.set(response, () => clearTimeout(timer));
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function readBoundedBody(response, limit) {
  try {
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > limit) {
      await discardResponse(response);
      throw writerError("training_idrive_existing_object_too_large", { actualSizeBytes: declared });
    }
    if (!response.body?.getReader) {
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > limit) throw writerError("training_idrive_existing_object_too_large", { actualSizeBytes: body.length });
      return body;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw writerError("training_idrive_existing_object_too_large", { actualSizeBytes: total });
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    finishResponse(response);
  }
}

async function discardResponse(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // The status code is the only evidence used; response bodies are never logged.
  } finally {
    finishResponse(response);
  }
}

function finishResponse(response) {
  const finish = responseTimeouts.get(response);
  if (!finish) return;
  responseTimeouts.delete(response);
  finish();
}

function normalizeObject(input, config) {
  if (!input || input.ifNoneMatch !== "*" || input.conditionRequired !== true) {
    throw writerError("training_idrive_condition_required");
  }
  const key = String(input.key || "");
  validateKey(key, config.allowedPrefixes);
  const contentType = normalizeHeader(input.contentType || "");
  if (!JSON_CONTENT_TYPE.test(contentType)) throw writerError("training_idrive_content_type_invalid");
  const payload = toBuffer(input.body);
  if (payload.length < 1 || payload.length > config.maxObjectBytes) {
    throw writerError("training_idrive_object_size_invalid", { sizeBytes: payload.length });
  }
  const expectedSize = Number(input.sizeBytes);
  const expectedSha = String(input.sha256 || "").toLowerCase();
  if (!Number.isSafeInteger(expectedSize) || expectedSize !== payload.length) {
    throw writerError("training_idrive_declared_size_mismatch");
  }
  const actualSha = sha256(payload);
  if (!/^[a-f0-9]{64}$/.test(expectedSha) || expectedSha !== actualSha) {
    throw writerError("training_idrive_declared_sha256_mismatch");
  }
  return { key, contentType, payload, sizeBytes: expectedSize, sha256: expectedSha };
}

function normalizeReadDescriptor(input, config) {
  const key = String(input?.key || "");
  validateKey(key, config.allowedPrefixes);
  const sizeBytes = Number(input?.sizeBytes);
  const expectedSha = String(input?.sha256 || "").toLowerCase();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > config.maxObjectBytes) {
    throw writerError("training_idrive_read_size_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw writerError("training_idrive_read_sha256_invalid");
  return { key, sizeBytes, sha256: expectedSha, contentType: "application/json; charset=utf-8" };
}

function validateConfig(input = {}, { attestor = false } = {}) {
  const endpoint = validateEndpoint(input.endpoint);
  const region = safeToken(input.region, "training_idrive_region_invalid", 3, 64);
  const accessKey = safeToken(input.accessKey, "training_idrive_access_key_invalid", 3, 256);
  const secretKey = safeToken(input.secretKey, "training_idrive_secret_key_invalid", 8, 512);
  const bucket = String(input.bucket || "").trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) {
    throw writerError("training_idrive_bucket_invalid");
  }
  const allowedPrefixes = (Array.isArray(input.allowedPrefixes)
    ? input.allowedPrefixes
    : parsePrefixes(input.allowedPrefixes))
    .map((prefix) => String(prefix).trim())
    .filter(Boolean);
  if (!allowedPrefixes.length) throw writerError("training_idrive_prefix_allowlist_required");
  for (const prefix of allowedPrefixes) {
    if (attestor) validateAttestorPrefix(prefix);
    else validatePrefix(prefix);
  }
  return Object.freeze({
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    allowedPrefixes: Object.freeze([...new Set(allowedPrefixes)].sort()),
    maxObjectBytes: boundedInteger(input.maxObjectBytes, 1, MAX_CONFIGURED_OBJECT_BYTES, "training_idrive_max_object_bytes_invalid"),
    timeoutMs: boundedInteger(input.timeoutMs, 100, 30_000, "training_idrive_timeout_invalid"),
    recoveryAttempts: boundedInteger(input.recoveryAttempts, 1, 5, "training_idrive_recovery_attempts_invalid"),
    retryDelayMs: boundedInteger(input.retryDelayMs, 0, 2_000, "training_idrive_retry_delay_invalid")
  });
}

function validateEndpoint(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw writerError("training_idrive_endpoint_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw writerError("training_idrive_endpoint_https_required");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "idrivee2.com" && !host.endsWith(".idrivee2.com")) {
    throw writerError("training_idrive_endpoint_host_invalid");
  }
  return `${url.protocol}//${url.host}`;
}

function validateKey(key, prefixes) {
  if (!key || key.endsWith("/") || Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES || /[\\\u0000-\u001f\u007f]/.test(key)) {
    throw writerError("training_idrive_key_invalid");
  }
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw writerError("training_idrive_key_invalid");
  }
  if (!prefixes.some((prefix) => key.startsWith(prefix))) {
    throw writerError("training_idrive_prefix_denied");
  }
}

function parsePrefixes(value) {
  const prefixes = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!prefixes.length) throw writerError("training_idrive_prefix_allowlist_required");
  return prefixes;
}

function validatePrefix(prefix) {
  if (!/^training\/(?:[a-z0-9][a-z0-9._-]*\/)+$/.test(String(prefix)) || prefix.includes("..") || prefix.includes("//")) {
    throw writerError("training_idrive_prefix_invalid");
  }
}

function validateAttestorPrefix(prefix) {
  if (String(prefix) !== "jobs/") throw writerError("training_attestor_prefix_invalid");
}

function required(env, name) {
  const value = String(env?.[name] || "").trim();
  if (!value) throw writerError(`training_idrive_config_missing:${name}`);
  return value;
}

function integerSetting(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  return boundedInteger(Number(value), min, max, "training_idrive_numeric_config_invalid");
}

function boundedInteger(value, min, max, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw writerError(code);
  return number;
}

function safeToken(value, code, min, max) {
  const token = String(value || "").trim();
  if (token.length < min || token.length > max || /[\s\u0000-\u001f\u007f]/.test(token)) throw writerError(code);
  return token;
}

function signingKey(secretKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function encodeKey(key) {
  return key.split("/").map(awsEncode).join("/");
}

function awsEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeHeader(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw writerError("training_idrive_body_invalid");
}

function isAmbiguousStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isWriterError(error) {
  return typeof error?.code === "string" && error.code.startsWith("training_idrive_");
}

function successResult(object, evidence) {
  return {
    ok: true,
    created: true,
    createdNow: evidence.createdNow,
    idempotent: evidence.idempotent,
    conditionEnforced: true,
    contentVerified: true,
    recoveredAfterAmbiguous: evidence.recoveredAfterAmbiguous,
    sizeBytes: object.sizeBytes,
    sha256: object.sha256,
    putStatus: evidence.putStatus,
    proofStatus: evidence.proofStatus,
    attempts: evidence.attempt
  };
}

async function retryWait(runtime, attempt) {
  await runtime.sleep(runtime.config.retryDelayMs * attempt);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function writerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}
