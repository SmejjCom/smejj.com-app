import assert from "node:assert/strict";
import test from "node:test";

process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const bridge = await import("../public/chat-bridge.js");

test("chat bridge strips think blocks and empty model deltas", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"<think>"}}]}', state), "");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"hidden"}}]}', state), "");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"</think>Antwort"}}]}', state), "Antwort");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":""}}]}', state), "");
});

test("chat bridge preserves whitespace-only deltas for code block formatting", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"\\n"}}]}', state), "\n");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"  "}}]}', state), "  ");
});

test("chat bridge keeps partial opening think tag private", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.stripThinking("Hallo <thi", state), "Hallo ");
  assert.equal(bridge.stripThinking("nk>intern</think> Welt", state), " Welt");
});

test("chat bridge only searches web for explicit current/source questions", () => {
  assert.equal(bridge.shouldSearchWeb("Bist du online?"), false);
  assert.equal(bridge.shouldSearchWeb("Hallo, bist du da und funktionierst du?"), false);
  assert.equal(bridge.shouldSearchWeb("Was ist heute eine aktuelle Nachricht mit Quelle?"), true);
  assert.equal(bridge.shouldSearchWeb("Wie ist das Wetter heute in Berlin?"), true);
});

test("chat bridge limiter enforces per-client windows", () => {
  let now = 1_000;
  const limiter = bridge.createWindowLimiter({ max: 2, windowMs: 60_000, now: () => now });
  assert.equal(limiter.take("client-a").allowed, true);
  assert.equal(limiter.take("client-a").allowed, true);
  assert.equal(limiter.take("client-a").allowed, false);
  assert.equal(limiter.take("client-b").allowed, true);
  now += 60_001;
  assert.equal(limiter.take("client-a").allowed, true);
});
