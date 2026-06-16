import test from "node:test";
import assert from "node:assert/strict";
import { handleGatekeeperRequest } from "../cloudflare-worker/index.js";

test("gatekeeper health states free gatekeeper role", async () => {
  const response = await handleGatekeeperRequest(new Request("https://example.test/gatekeeper/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.role, "cloudflare-free-gatekeeper-design");
  assert.equal(body.policy.cloudflarePaidAllowed, false);
  assert.equal(body.policy.workersAIAllowed, false);
});

test("presign route blocks missing env", async () => {
  const response = await handleGatekeeperRequest(new Request("https://example.test/gatekeeper/presign", {
    method: "POST",
    body: JSON.stringify({
      operation: "upload",
      key: "objects/sha256/ab/example"
    })
  }), {});
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.match(body.reason, /missing_env/);
});

test("paid provider on demo route is blocked", async () => {
  const response = await handleGatekeeperRequest(new Request("https://example.test/gatekeeper/demo", {
    method: "POST",
    body: JSON.stringify({
      provider: "workers-ai-paid"
    })
  }), {});
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
});

test("valid demo request passes only hard-limit envelope", async () => {
  const response = await handleGatekeeperRequest(new Request("https://example.test/gatekeeper/demo", {
    method: "POST",
    body: JSON.stringify({
      provider: "free-demo-hardlimit"
    })
  }), {
    FREE_DEMO_HARD_LIMIT_ALLOWED: "true",
    FREE_DEMO_REMAINING: "1"
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.inferencePerformed, false);
});

