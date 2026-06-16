import test from "node:test";
import assert from "node:assert/strict";
import { createLocalWorkspace } from "../src/storage/localWorkspace.js";
import { createMemoryStore } from "../src/storage/indexedDbStore.js";
import { createMemoryOpfsStore } from "../src/storage/opfsStore.js";
import { sha256Hex } from "../src/storage/checksum.js";

function createTestWorkspace({ online = true } = {}) {
  const metadataStore = createMemoryStore();
  const fileStore = createMemoryOpfsStore();
  const workspace = createLocalWorkspace({
    metadataStore,
    fileStore,
    onlineRef: { onLine: online }
  });
  return { workspace, metadataStore, fileStore };
}

test("creates a local project with a fail-closed IDrive manifest policy", async () => {
  const { workspace } = createTestWorkspace();
  const { project, manifest } = await workspace.createProject({ id: "project_test", name: "Test" });
  assert.equal(project.id, "project_test");
  assert.equal(manifest.storage.provider, "idrive-e2");
  assert.equal(manifest.storage.secretsAllowed, false);
  assert.equal(manifest.sync.status, "local");
});

test("saves a local file and verifies checksum", async () => {
  const { workspace } = createTestWorkspace();
  await workspace.createProject({ id: "project_test", name: "Test" });
  const result = await workspace.saveFile("project_test", "src/example.txt", "hello");
  assert.equal(result.object.sha256, await sha256Hex("hello"));
  assert.equal(await workspace.readFile("src/example.txt"), "hello");
  assert.equal(await workspace.checksumFile("src/example.txt"), result.object.sha256);
});

test("detects changed files against manifest", async () => {
  const { workspace } = createTestWorkspace();
  await workspace.createProject({ id: "project_test", name: "Test" });
  await workspace.saveFile("project_test", "src/example.txt", "hello");
  const changed = await workspace.changedFiles("project_test", [
    { path: "src/example.txt", content: "hello world" }
  ]);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].path, "src/example.txt");
});

test("creates manifest snapshot and restores project", async () => {
  const { workspace, fileStore } = createTestWorkspace();
  await workspace.createProject({ id: "project_test", name: "Test" });
  await workspace.saveFile("project_test", "src/example.txt", "hello");
  const snapshot = await workspace.snapshot("project_test");
  await fileStore.writeFile("src/example.txt", "broken local edit");
  const restored = await workspace.restore(snapshot.manifest);
  assert.equal(restored.ok, true);
  assert.equal(await workspace.readFile("src/example.txt"), "hello");
});

test("offline status remains usable locally", () => {
  const { workspace } = createTestWorkspace({ online: false });
  const status = workspace.status();
  assert.equal(status.offline, true);
  assert.equal(status.syncStatus, "offline-lokal");
  assert.equal(status.aiMode, "disabled");
});

test("corrupt stored object is detected during restore", async () => {
  const { workspace, metadataStore } = createTestWorkspace();
  await workspace.createProject({ id: "project_test", name: "Test" });
  const saved = await workspace.saveFile("project_test", "src/example.txt", "hello");
  const manifest = saved.manifest;
  await metadataStore.put("objects", saved.object.objectKey, {
    objectKey: saved.object.objectKey,
    sha256: saved.object.sha256,
    content: "tampered"
  });
  await assert.rejects(() => workspace.restore(manifest), /Checksum mismatch/);
});

test("missing manifest is reported cleanly", async () => {
  const { workspace } = createTestWorkspace();
  await assert.rejects(() => workspace.getManifest("missing_project"), /Project manifest not found/);
});

