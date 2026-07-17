import test from "node:test";
import assert from "node:assert/strict";
import { createDelta, createDocumentState, validateDelta } from "../src/sync/index.js";

test("local change creates immutable delta with SHA256 object key", async () => {
  const base = createDocumentState({
    projectId: "project_sync",
    files: { "src/a.txt": "one\nsame" }
  });
  const delta = await createDelta({
    projectId: "project_sync",
    deviceId: "device-a",
    baseState: base,
    changes: [{ path: "src/a.txt", content: "two\nsame" }],
    message: "change line one"
  });
  assert.match(delta.deltaSha256, /^[a-f0-9]{64}$/);
  assert.equal(delta.objectKey, `sync/projects/project_sync/deltas/${delta.deltaSha256}.json`);
  assert.equal(delta.operations[0].touchedLines.length, 1);
  await assert.doesNotReject(() => validateDelta(delta));
});

