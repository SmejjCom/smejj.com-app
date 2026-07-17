import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentState, createMemoryDeltaStore, createSyncEngine } from "../src/sync/index.js";

test("device A and B edit different files and merge correctly", async () => {
  const store = createMemoryDeltaStore();
  const engine = createSyncEngine({ deltaStore: store });
  const baseA = createDocumentState({ projectId: "project_sync", files: { "a.txt": "A0", "b.txt": "B0" } });
  const baseB = createDocumentState({ projectId: "project_sync", files: { "a.txt": "A0", "b.txt": "B0" } });

  const a = await engine.prepareLocalChange({
    state: baseA,
    deviceId: "device-a",
    changes: [{ path: "a.txt", content: "A1" }]
  });
  const b = await engine.prepareLocalChange({
    state: baseB,
    deviceId: "device-b",
    changes: [{ path: "b.txt", content: "B1" }]
  });

  const merged = await engine.applyRemoteDelta({ state: a.state, delta: b.delta });
  assert.equal(merged.ok, true);
  assert.equal(merged.state.files["a.txt"], "A1");
  assert.equal(merged.state.files["b.txt"], "B1");
  assert.equal(merged.conflicts.length, 0);
});

test("same file different lines merge without hiding data", async () => {
  const store = createMemoryDeltaStore();
  const engine = createSyncEngine({ deltaStore: store });
  const files = { "note.txt": "line 1\nline 2\nline 3" };
  const baseA = createDocumentState({ projectId: "project_sync", files });
  const baseB = createDocumentState({ projectId: "project_sync", files });

  const a = await engine.prepareLocalChange({
    state: baseA,
    deviceId: "device-a",
    changes: [{ path: "note.txt", content: "A line 1\nline 2\nline 3" }]
  });
  const b = await engine.prepareLocalChange({
    state: baseB,
    deviceId: "device-b",
    changes: [{ path: "note.txt", content: "line 1\nB line 2\nline 3" }]
  });

  const merged = await engine.applyRemoteDelta({ state: a.state, delta: b.delta });
  assert.equal(merged.ok, true);
  assert.equal(merged.state.files["note.txt"], "A line 1\nB line 2\nline 3");
});

