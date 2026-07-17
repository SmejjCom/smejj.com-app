import test from "node:test";
import assert from "node:assert/strict";
import { createSessionHandoffStore, isSessionHandoffId } from "../control-server/src/auth/sessionHandoff.js";

function deterministicBytes() {
  let value = 0;
  return () => Buffer.alloc(32, ++value);
}

test("session handoff is origin-bound, one-time and keeps the token out of URLs", () => {
  let nowMs = 1_000;
  const store = createSessionHandoffStore({ now: () => nowMs, randomBytes: deterministicBytes() });
  const started = store.start("https://smejj.com");
  assert.equal(started.status, 201);
  assert.equal(isSessionHandoffId(started.id), true);
  assert.doesNotMatch(started.id, /token|secret/i);

  assert.equal(store.consume(started.id, "https://www.smejj.com").status, 403);
  assert.deepEqual(store.consume(started.id, "https://smejj.com"), {
    ok: true,
    status: 202,
    state: "pending",
    expiresAt: started.expiresAt
  });

  const completed = store.complete(started.id, {
    token: "signed.payload",
    user: { email: "owner@example.com" }
  });
  assert.deepEqual(completed, { ok: true, status: 200, expiresAt: started.expiresAt });
  const consumed = store.consume(started.id, "https://smejj.com");
  assert.equal(consumed.status, 200);
  assert.equal(consumed.accessToken, "signed.payload");
  assert.equal(consumed.tokenStorage, "session-only");
  assert.equal(store.consume(started.id, "https://smejj.com").status, 404);
  assert.equal(store.size(), 0);

  nowMs += 1;
});

test("session handoff expires and rejects malformed or excessive requests", () => {
  let nowMs = 10_000;
  const store = createSessionHandoffStore({
    now: () => nowMs,
    randomBytes: deterministicBytes(),
    ttlMs: 30_000,
    maxPending: 3,
    maxPerOrigin: 2
  });
  assert.equal(store.start("https://smejj.com/path").status, 400);
  const first = store.start("https://smejj.com");
  assert.equal(first.status, 201);
  assert.equal(store.start("https://smejj.com").status, 201);
  assert.equal(store.start("https://smejj.com").status, 429);
  nowMs = first.expiresAt;
  assert.equal(store.consume(first.id, "https://smejj.com").status, 404);
  assert.equal(store.size(), 0);
});
