import test from "node:test";
import assert from "node:assert/strict";
import { createLocalWorkspace, PROJECT_ROLES } from "../src/storage/localWorkspace.js";
import { createMemoryStore } from "../src/storage/indexedDbStore.js";
import { createMemoryOpfsStore } from "../src/storage/opfsStore.js";

function createTestWorkspace({ online = true } = {}) {
  return createLocalWorkspace({
    metadataStore: createMemoryStore(),
    fileStore: createMemoryOpfsStore(),
    onlineRef: { onLine: online }
  });
}

test("creates a local user manifest without browser secrets", async () => {
  const workspace = createTestWorkspace();
  const user = await workspace.saveUserManifest({
    id: "user_test",
    name: "Test User",
    email: "test@example.com"
  });
  assert.equal(user.storage.secretsAllowed, false);
  assert.equal(user.storage.idriveMasterKeysAllowedInClient, false);
  assert.equal((await workspace.getUserManifest("user_test")).email, "test@example.com");
});

test("creates, lists, opens and saves a project with owner rights", async () => {
  const workspace = createTestWorkspace();
  const { project } = await workspace.createProject({
    id: "project_auth",
    name: "Auth Project",
    ownerUserId: "user_test"
  });
  assert.equal(project.rights.roles.user_test, PROJECT_ROLES.owner);
  assert.equal((await workspace.listProjects()).length, 1);
  const opened = await workspace.openProject("project_auth", { user: { id: "user_test" } });
  assert.equal(opened.project.name, "Auth Project");
  const saved = await workspace.saveFile("project_auth", "notes/auth.txt", "hello");
  assert.equal(saved.manifest.files[0].path, "notes/auth.txt");
});

test("blocks project access without auth for non-local project paths", async () => {
  const workspace = createTestWorkspace();
  await workspace.createProject({ id: "project_private", name: "Private", ownerUserId: "user_owner" });
  await assert.rejects(
    () => workspace.openProject("project_private", { localOnly: false }),
    /authentication required/
  );
});

test("keeps offline local-only projects usable", async () => {
  const workspace = createTestWorkspace({ online: false });
  await workspace.createProject({ id: "project_local", name: "Local" });
  await workspace.saveFile("project_local", "offline.txt", "offline ok");
  const opened = await workspace.openProject("project_local", { localOnly: true });
  assert.equal(opened.project.id, "project_local");
  assert.equal(workspace.status().offline, true);
});

test("exports and imports a project without secrets or paid fallback", async () => {
  const workspace = createTestWorkspace();
  await workspace.createProject({ id: "project_export", name: "Export" });
  await workspace.saveFile("project_export", "src/file.txt", "exported");
  const bundle = await workspace.exportProject("project_export", { localOnly: true });
  assert.equal(bundle.policy.secretsIncluded, false);
  assert.equal(bundle.policy.paidFallbackAllowed, false);
  const imported = await workspace.importProject(bundle, { idPrefix: "testimport" });
  assert.match(imported.project.id, /^testimport_project_export_/);
  assert.equal((await workspace.listProjects()).length, 2);
});

test("delete requires explicit confirmation and leaves immutable objects untouched", async () => {
  const workspace = createTestWorkspace();
  await workspace.createProject({ id: "project_delete", name: "Delete" });
  await assert.rejects(
    () => workspace.deleteProject("project_delete", { localOnly: true }),
    /requires explicit confirmation/
  );
  const result = await workspace.deleteProject("project_delete", { confirmed: true, localOnly: true });
  assert.equal(result.ok, true);
  assert.equal(result.immutableObjectsDeleted, false);
  assert.equal((await workspace.listProjects()).length, 0);
});
