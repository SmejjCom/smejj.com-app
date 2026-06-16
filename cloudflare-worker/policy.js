export const GATEKEEPER_POLICY = Object.freeze({
  githubPaidAllowed: false,
  cloudflarePaidAllowed: false,
  autoPaidFallbackAllowed: false,
  trialServicesAllowed: false,
  cloudflareR2Allowed: false,
  workersAIAllowed: false,
  paidQueuesAllowed: false,
  paidD1Allowed: false,
  paidKVAllowed: false,
  failClosed: true
});

const ALLOWED_PROVIDERS = new Set([
  "idrive-e2",
  "local-browser",
  "byok-openai-compatible",
  "free-demo-hardlimit",
  "disabled"
]);

const PAID_MARKERS = [
  "paid",
  "trial",
  "auto-billing",
  "workers-ai",
  "cloudflare-r2",
  "cloudflare-d1",
  "cloudflare-kv",
  "cloudflare-queues",
  "github-actions",
  "codespaces"
];

export function block(reason, status = 403) {
  return {
    ok: false,
    status,
    mode: "disabled",
    reason
  };
}

export function allow(details = {}) {
  return {
    ok: true,
    status: 200,
    ...details
  };
}

export function assertFreePolicy(policy = GATEKEEPER_POLICY) {
  const forbiddenTrue = [
    "githubPaidAllowed",
    "cloudflarePaidAllowed",
    "autoPaidFallbackAllowed",
    "trialServicesAllowed",
    "cloudflareR2Allowed",
    "workersAIAllowed",
    "paidQueuesAllowed",
    "paidD1Allowed",
    "paidKVAllowed"
  ];

  for (const key of forbiddenTrue) {
    if (policy[key] !== false) return block(`policy_${key}_must_be_false`);
  }
  if (policy.failClosed !== true) return block("policy_must_fail_closed");
  return allow({ policy });
}

export function evaluateProvider(provider) {
  const id = String(provider || "").trim();
  if (!id) return block("provider_missing");
  if (!ALLOWED_PROVIDERS.has(id)) return block("provider_unknown");
  if (containsPaidMarker(id)) return block("provider_paid_or_trial_risk");
  return allow({ provider: id });
}

export function evaluateCostRisk(value) {
  if (containsPaidMarker(String(value || ""))) return block("paid_or_trial_risk_detected");
  return allow();
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !String(env?.[key] || "").trim());
  if (missing.length) return block(`missing_env:${missing.join(",")}`, 503);
  return allow();
}

import { validateUploadMetadata } from "../src/shared/securityPolicy.js";

export function requireIdrivePresignConfig(env) {
  return requireEnv(env, [
    "IDRIVE_E2_ENDPOINT",
    "IDRIVE_E2_REGION",
    "IDRIVE_E2_ACCESS_KEY",
    "IDRIVE_E2_SECRET_KEY",
    "IDRIVE_E2_BUCKET"
  ]);
}

export function validatePresignUploadPolicy({ operation, contentType, contentLength } = {}) {
  if (operation !== "upload") return allow();
  const result = validateUploadMetadata({
    name: "presigned-upload",
    size: contentLength,
    type: contentType
  });
  if (!result.ok) return block(result.reason, result.status);
  return allow({ upload: result });
}

export function normalizeObjectKey(key) {
  const value = String(key || "").trim();
  if (!value) return null;
  if (value.startsWith("/") || value.includes("..") || /^[A-Za-z]:\\/.test(value) || value.startsWith("file:")) return null;
  if (/^(objects|manifests|checksums|indexes|rag|deployments|backups|model-files|static-assets)\//.test(value)) {
    return value;
  }
  return null;
}

function containsPaidMarker(value) {
  const normalized = value.toLowerCase();
  return PAID_MARKERS.some((marker) => normalized.includes(marker));
}
