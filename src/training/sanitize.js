import crypto from "node:crypto";
import { EXCLUDED_TRAINING_ARTIFACT_KEYS } from "./constants.js";

const MAX_SERIALIZED_BYTES = 5_000_000;
const MAX_DEPTH = 40;

const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SECRET_FIELD_EXACT = new Set([
  "authorization", "cookie", "credentials", "credential", "password", "passphrase",
  "secret", "token", "privatekey", "apikey", "accesskey", "clientsecret", "accesstoken",
  "authtoken", "bearertoken", "refreshtoken", "sessiontoken", "idtoken", "csrftoken",
  "oauthtoken", "signingkey", "encryptionkey", "webhooksecret"
]);
const PERSONAL_FIELD_EXACT = new Set([
  "email", "emailaddress", "userid", "accountid", "fullname", "firstname", "lastname",
  "username", "phone", "phonenumber", "address", "streetaddress", "postalcode", "zipcode",
  "ipaddress", "dateofbirth", "birthdate", "dob"
]);

const STRING_RULES = Object.freeze([
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  ["github_token", /\b(?:gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
  ["openai_style_token", /\bsk-(?:(?:proj|ant)-)?[a-zA-Z0-9_-]{16,}\b/g, "[REDACTED_API_TOKEN]"],
  ["stripe_token", /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{16,}\b/g, "[REDACTED_STRIPE_TOKEN]"],
  ["gitlab_token", /\bglpat-[a-zA-Z0-9_-]{20,}\b/g, "[REDACTED_GITLAB_TOKEN]"],
  ["npm_token", /\bnpm_[a-zA-Z0-9]{20,}\b/g, "[REDACTED_NPM_TOKEN]"],
  ["slack_token", /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]"],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED_GOOGLE_API_KEY]"],
  ["aws_access_key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_ACCESS_KEY]"],
  ["bearer_token", /\bBearer\s+[a-zA-Z0-9._~+/=-]{16,}\b/gi, "Bearer [REDACTED]"],
  ["jwt", /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, "[REDACTED_JWT]"],
  ["generic_secret", /((?:api[_-]?key|access[_-]?key|client[_-]?secret|credential|token|secret|password|passphrase)\s*[:=]\s*["'`]?)[a-z0-9_./+=-]{8,}/gi, "$1[REDACTED]"],
  ["credential_url", /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED_CREDENTIALS]@"],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  ["home_path", /(?:\/Users|\/home)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._+@ -]+)*/g, "[REDACTED_LOCAL_PATH]"],
  ["public_ip", /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]"],
  ["phone", /(?<![\w.])(?:\+\d[\d ()/-]{8,}\d|\(\d{2,4}\)[\d ()/-]{6,}\d|\d{3}[- .]\d{3}[- .]\d{4})(?![\w.])/g, "[REDACTED_PHONE]"],
  ["high_entropy_token", /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}\b/g, "[REDACTED_HIGH_ENTROPY_TOKEN]"],
  ["opaque_lowercase_token", /\b[a-z0-9_-]{40,}\b/g, "[REDACTED_OPAQUE_TOKEN]"]
]);

/**
 * Recursively removes secrets, direct identifiers and browser-capture artifacts
 * before a value can become a training candidate. Findings contain categories
 * and JSON paths only, never the removed values.
 */
export function sanitizeTrainingValue(input) {
  assertSize(input);
  const findings = [];
  const value = sanitizeNode(input, "$", findings, 0, new WeakSet());
  const residual = scanSensitiveStrings(value);
  return {
    value,
    findings,
    passed: residual.length === 0,
    residualFindings: residual,
    rawPersisted: false,
    sanitizerVersion: "smejj-training-sanitizer-v1"
  };
}

export function scanSensitiveStrings(value) {
  const findings = [];
  walkStrings(value, "$", (text, path) => {
    for (const [type, pattern] of STRING_RULES) {
      if (!ruleAppliesAtPath(type, path)) continue;
      pattern.lastIndex = 0;
      if (pattern.test(text)) findings.push({ type, path });
    }
  });
  return findings;
}

export function keyedTrainingFingerprint(value, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("training_fingerprint_key_invalid");
  return crypto.createHmac("sha256", key).update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sanitizeNode(value, currentPath, findings, depth, seen) {
  if (depth > MAX_DEPTH) throw new Error("training_input_depth_exceeded");
  if (typeof value === "string") return sanitizeString(value, currentPath, findings);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("training_input_cycle_detected");
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item, index) => sanitizeNode(item, `${currentPath}[${index}]`, findings, depth + 1, seen));
    seen.delete(value);
    return result;
  }
  const result = Object.create(null);
  let keyIndex = 0;
  for (const [key, child] of Object.entries(value)) {
    const keyPath = `${currentPath}{key:${keyIndex}}`;
    const outputKey = safeOutputKey(key, keyPath, keyIndex, findings, result);
    const childPath = `${currentPath}.${outputKey}`;
    const compactKey = compactFieldName(key);
    if (EXCLUDED_TRAINING_ARTIFACT_KEYS.has(compactKey)) {
      findings.push({ type: "excluded_artifact", path: childPath });
      keyIndex += 1;
      continue;
    }
    if (isSecretField(compactKey)) {
      findings.push({ type: "secret_field", path: childPath });
      result[outputKey] = "[REDACTED_SECRET_FIELD]";
      keyIndex += 1;
      continue;
    }
    if (isPersonalField(compactKey)) {
      findings.push({ type: "personal_field", path: childPath });
      result[outputKey] = "[REDACTED_PERSONAL_FIELD]";
      keyIndex += 1;
      continue;
    }
    result[outputKey] = sanitizeNode(child, childPath, findings, depth + 1, seen);
    keyIndex += 1;
  }
  seen.delete(value);
  return result;
}

function sanitizeString(value, currentPath, findings) {
  let output = value;
  for (const [type, pattern, replacement] of STRING_RULES) {
    if (!ruleAppliesAtPath(type, currentPath)) continue;
    pattern.lastIndex = 0;
    if (!pattern.test(output)) continue;
    findings.push({ type, path: currentPath });
    pattern.lastIndex = 0;
    output = output.replace(pattern, replacement);
  }
  return output;
}

function ruleAppliesAtPath(type, path) {
  if (type !== "opaque_lowercase_token") return true;
  return !/(?:sha(?:256|512)?|checksum|digest|contenthash|fingerprint|basecommit|commitsha)$/i.test(String(path).replace(/[^a-z0-9]/gi, ""));
}

function walkStrings(value, currentPath, visit) {
  if (typeof value === "string") return visit(value, currentPath);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => walkStrings(item, `${currentPath}[${index}]`, visit));
  let keyIndex = 0;
  for (const [key, child] of Object.entries(value)) {
    visit(key, `${currentPath}{key:${keyIndex}}`);
    walkStrings(child, `${currentPath}.${safePathSegment(key, keyIndex)}`, visit);
    keyIndex += 1;
  }
}

function safeOutputKey(key, keyPath, index, findings, target) {
  const unsafeStructure = DANGEROUS_OBJECT_KEYS.has(key) || /[\u0000-\u001f\u007f]/.test(key);
  const sanitizedKey = sanitizeString(key, keyPath, findings);
  const keyContainsSensitiveText = sanitizedKey !== key;
  const compactKey = compactFieldName(key);
  const sensitiveFieldName = isSecretField(compactKey) || isPersonalField(compactKey);
  let outputKey = unsafeStructure || keyContainsSensitiveText || sensitiveFieldName
    ? `_redacted_key_${index}`
    : key;
  if (unsafeStructure) findings.push({ type: "unsafe_object_key", path: keyPath });
  let collision = 0;
  while (Object.hasOwn(target, outputKey)) {
    collision += 1;
    outputKey = `_redacted_key_${index}_${collision}`;
  }
  return outputKey;
}

function compactFieldName(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSecretField(compactKey) {
  if (SECRET_FIELD_EXACT.has(compactKey)) return true;
  if (compactKey.includes("password") || compactKey.includes("passphrase") ||
      compactKey.includes("credential") || compactKey.includes("authorization") ||
      compactKey.includes("secret")) return true;
  if (compactKey.endsWith("cookie") || compactKey.endsWith("token")) return true;
  return /(?:api|access|secret|private|signing|encryption)key$/.test(compactKey);
}

function isPersonalField(compactKey) {
  return PERSONAL_FIELD_EXACT.has(compactKey);
}

function safePathSegment(key, index) {
  const sanitized = sanitizeString(key, `$path{key:${index}}`, []);
  return sanitized === key && !DANGEROUS_OBJECT_KEYS.has(key) ? key : `_redacted_key_${index}`;
}

function assertSize(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("training_input_not_serializable");
  }
  if (Buffer.byteLength(serialized || "", "utf8") > MAX_SERIALIZED_BYTES) {
    throw new Error("training_input_too_large");
  }
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
