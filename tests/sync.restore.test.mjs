import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentState, createMemoryDeltaStore, createSyncEngine, restoreFromDeltas } from "../src/sync/index.js";

test("older version can be restored from selected delta prefix", async () => {
  const store = createMemoryDeltaStore();
  const engine = createSyncEngine({ deltaStore: store });
  const base = createDocumentState({ projectId: "project_sync", files: { "a.txt": "v0" } });

  const first = await engine.prepareLocalChange({
    state: base,
    deviceId: "device-a",
    changes: [{ path: "a.txt", content: "v1" }]
  });
  const second = await engine.prepareLocalChange({
    state: first.state,
    deviceId: "device-a",
    changes: [{ path: "a.txt", content: "v2" }]
  });

  const restoredV1 = await restoreFromDeltas({ baseState: base, deltas: [first.delta] });
  assert.equal(restoredV1.ok, true);
  assert.equal(restoredV1.state.files["a.txt"], "v1");

  const restoredV2 = await restoreFromDeltas({ baseState: base, deltas: [first.delta, second.delta] });
  assert.equal(restoredV2.ok, true);
  assert.equal(restoredV2.state.files["a.txt"], "v2");
});

