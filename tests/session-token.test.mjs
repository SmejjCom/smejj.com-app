import test from "node:test";
import assert from "node:assert/strict";
import { bearerSessionToken, issueSessionToken, verifySessionToken } from "../control-server/src/auth/sessionToken.js";
import { signGoogleAuthState, verifyGoogleAuthState } from "../src/auth/googleAuth.js";

test("session token is signed, expiring and carries only normalized user data", () => {
  const token = issueSessionToken({ secret: "secret", user: { email: "owner@example.com", name: "Owner", ignored: "no" }, nowMs: 1_000, ttlMs: 60_000 });
  assert.deepEqual(verifySessionToken(token, { secret: "secret", nowMs: 2_000 }), { email: "owner@example.com", name: "Owner" });
  assert.equal(verifySessionToken(token, { secret: "wrong", nowMs: 2_000 }), null);
  assert.equal(verifySessionToken(token, { secret: "secret", nowMs: 61_001 }), null);
  assert.equal(bearerSessionToken({ authorization: `Bearer ${token}` }), token);
});

test("Google auth state remains signed, expiring and tamper-evident after modularization", () => {
  const secret = "test-google-state-secret";
  const state = signGoogleAuthState({ nonce: "nonce_1", exp: 20_000 }, secret);
  assert.deepEqual(verifyGoogleAuthState(state, secret, 10_000), { nonce: "nonce_1", exp: 20_000 });
  assert.throws(() => verifyGoogleAuthState(`${state}x`, secret, 10_000), /ungueltig/);
  assert.throws(() => verifyGoogleAuthState(state, secret, 20_001), /abgelaufen/);
});
