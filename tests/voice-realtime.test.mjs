// smejj.com — Realtime Audio Session Unit Tests.
// Ausfuehren: node --test tests/voice-realtime.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRealtimeAudioSession } from "../public/voice-realtime.js";

test("createRealtimeAudioSession: erzeugt gueltige Session mit Steuerung", () => {
  const session = createRealtimeAudioSession();
  assert.equal(typeof session.start, "function");
  assert.equal(typeof session.stop, "function");
  assert.equal(session.isActive(), false);
});

test("createRealtimeAudioSession: stop setzt Zustand inaktiv", () => {
  const session = createRealtimeAudioSession();
  session.stop();
  assert.equal(session.isActive(), false);
});
