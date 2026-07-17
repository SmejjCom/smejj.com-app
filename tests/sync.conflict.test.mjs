import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentState, createMemoryDeltaStore, createSyncEngine } from "../src/sync/index.js";

test("same line concurrent edit is visible conflict", async () => {
  const store = createMemoryDeltaStore();
  const engine = createSyncEngine({ deltaStore: store });
  const files = { "note.txt": "line 1\nline 2" };
  const baseA = createDocumentState({ projectId: "project_sync", files });
  const baseB = createDocumentState({ projectId: "project_sync", files });

  const a = await engine.prepareLocalChange({
    state: baseA,
    deviceId: "device-a",
    changes: [{ path: "note.txt", content: "A line 1\nline 2" }]
  });
  const b = await engine.prepareLocalChange({
    state: baseB,
    deviceId: "device-b",
    changes: [{ path: "note.txt", content: "B line 1\nline 2" }]
  });

  const merged = await engine.applyRemoteDelta({ state: a.state, delta: b.delta });
  assert.equal(merged.ok, false);
  assert.equal(merged.status, "konflikt");
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].path, "note.txt");
  assert.deepEqual(merged.conflicts[0].touchedLines, [0]);
  assert.equal(merged.state.files["note.txt"], "A line 1\nline 2");
});

