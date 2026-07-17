// smejj.com control-server — kryptografische Hash-Helfer (Single Responsibility: Hashing/HMAC).
import crypto from "node:crypto";

export function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

export function sha256(data, encoding = "hex") {
  return crypto.createHash("sha256").update(data, "utf8").digest(encoding);
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical_json_requires_finite_numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("canonical_json_requires_json_value");
}

export function hashActionLog(actionLog) {
  return sha256(actionLog?.schemaVersion === 2 ? canonicalJson(actionLog) : JSON.stringify(actionLog));
}
