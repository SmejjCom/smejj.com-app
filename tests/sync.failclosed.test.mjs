import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentState, createMemoryDeltaStore, createSyncEngine } from "../src/sync/index.js";

test("defective delta is blocked by checksum validation", async () => {
  const store = createMemoryDeltaStore();
  const engine = createSyncEngine({ deltaStore: store });
  const base = createDocumentState({ projectId: "project_sync", files: { "a.txt": "v0" } });
  const result = await engine.prepareLocalChange({
    state: base,
    deviceId: "device-a",
    changes: [{ path: "a.txt", content: "v1" }]
  });
  await store.corrupt(result.delta.objectKey, {
    operations: [{ ...result.delta.operations[0], content: "tampered" }]
  });
  await assert.rejects(() => store.get(result.delta.objectKey), /Delta checksum mismatch/);
});

test("missing delta is reported cleanly", async () => {
  const store = createMemoryDeltaStore();
  await assert.rejects(() => store.get("sync/projects/project_sync/deltas/missing.json"), /Delta not found/);
});

