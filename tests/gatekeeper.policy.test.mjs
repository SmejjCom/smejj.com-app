import test from "node:test";
import assert from "node:assert/strict";
import {
  GATEKEEPER_POLICY,
  assertFreePolicy,
  evaluateCostRisk,
  evaluateProvider
} from "../cloudflare-worker/policy.js";
import { evaluateQuota } from "../cloudflare-worker/quota.js";

test("free policy keeps all paid switches disabled", () => {
  const result = assertFreePolicy(GATEKEEPER_POLICY);
  assert.equal(result.ok, true);
  assert.equal(GATEKEEPER_POLICY.githubPaidAllowed, false);
  assert.equal(GATEKEEPER_POLICY.cloudflarePaidAllowed, false);
  assert.equal(GATEKEEPER_POLICY.autoPaidFallbackAllowed, false);
  assert.equal(GATEKEEPER_POLICY.trialServicesAllowed, false);
  assert.equal(GATEKEEPER_POLICY.cloudflareR2Allowed, false);
  assert.equal(GATEKEEPER_POLICY.workersAIAllowed, false);
  assert.equal(GATEKEEPER_POLICY.paidQueuesAllowed, false);
  assert.equal(GATEKEEPER_POLICY.paidD1Allowed, false);
  assert.equal(GATEKEEPER_POLICY.paidKVAllowed, false);
});

test("unknown provider is blocked", () => {
  const result = evaluateProvider("unknown-provider");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_unknown");
});

test("paid provider marker is blocked", () => {
  const result = evaluateCostRisk("cloudflare-workers-ai-paid");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "paid_or_trial_risk_detected");
});

test("unclear free demo limit is blocked", () => {
  const result = evaluateQuota({
    env: {},
    provider: "free-demo-hardlimit",
    operation: "free-demo"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "free_demo_hard_limit_not_enabled");
});

test("valid hard-limit demo envelope can pass without inference", () => {
  const result = evaluateQuota({
    env: {
      FREE_DEMO_HARD_LIMIT_ALLOWED: "true",
      FREE_DEMO_REMAINING: "1"
    },
    provider: "free-demo-hardlimit",
    operation: "free-demo"
  });
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 1);
});

