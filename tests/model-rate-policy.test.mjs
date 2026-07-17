import test from "node:test";
import assert from "node:assert/strict";
import { createPublicModelRateGate } from "../src/shared/modelRatePolicy.js";

function req(ip) {
  return { headers: { "x-forwarded-for": ip }, socket: { remoteAddress: "127.0.0.1" } };
}

test("public model rate gate enforces client and global limits", () => {
  const perClient = createPublicModelRateGate({
    SMEJJ_CONTROL_AI_RATE_PER_MINUTE: "2",
    SMEJJ_PUBLIC_AI_GLOBAL_RATE_PER_MINUTE: "3"
  });
  assert.equal(perClient.check(req("198.51.100.1")).allowed, true);
  assert.equal(perClient.check(req("198.51.100.1")).allowed, true);
  assert.equal(perClient.check(req("198.51.100.1")).allowed, false);
  assert.equal(perClient.check(req("198.51.100.2")).allowed, true);
  assert.equal(perClient.check(req("198.51.100.3")).allowed, false);
});
