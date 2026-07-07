import { allow, block, evaluateProvider } from "./policy.js";
import { evaluateHardLimit } from "../src/shared/securityPolicy.js";

export function evaluateQuota({ env = {}, provider, operation } = {}) {
  const providerCheck = evaluateProvider(provider);
  if (!providerCheck.ok) return providerCheck;

  if (provider === "free-demo-hardlimit") {
    if (env.FREE_DEMO_HARD_LIMIT_ALLOWED !== "true") return block("free_demo_hard_limit_not_enabled", 429);
    const remaining = Number(env.FREE_DEMO_REMAINING || 0);
    if (!Number.isFinite(remaining) || remaining <= 0) return block("free_demo_limit_reached_or_unclear", 429);
    return allow({ provider, operation, remaining });
  }

  if (operation === "presign-idrive") {
    const limit = evaluateHardLimit({
      enabled: env.PRESIGN_HARD_LIMIT_ALLOWED,
      remaining: env.PRESIGN_REMAINING,
      reason: "presign_rate_limit_reached_or_unclear"
    });
    if (!limit.ok) return block(limit.reason, limit.status || 429);
    return allow({ provider, operation, remaining: limit.remaining });
  }

  return block("quota_unknown_fail_closed", 429);
}
