import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  inspectBackupArchive,
  scanBackupArchives,
  scanWorkspaceSecretFiles
} from "../scripts/check-backup-archives.mjs";

test("backup archive guard permits .env.example but rejects private env files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj-backup-safety-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await mkdir(source);
  await writeFile(path.join(source, ".env.example"), "SAFE_EXAMPLE=1\n", "utf8");
  const safeArchive = path.join(root, "safe.tar.gz");
  createArchive(source, safeArchive);
  assert.deepEqual(inspectBackupArchive(safeArchive), []);

  await writeFile(path.join(source, ".env.local"), "MUST_NOT_BE_ARCHIVED=1\n", "utf8");
  const unsafeArchive = path.join(root, "unsafe.tar.gz");
  createArchive(source, unsafeArchive);
  const findings = inspectBackupArchive(unsafeArchive);
  assert.ok(findings.some((finding) => finding.includes("archive_secret_path")));
  assert.ok(findings.every((finding) => !finding.includes("MUST_NOT_BE_ARCHIVED")));
});

test("recursive backup scan rejects private credential paths", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj-backup-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const archives = path.join(root, "backups", "nested");
  await mkdir(path.join(source, ".ssh"), { recursive: true });
  await mkdir(archives, { recursive: true });
  await writeFile(path.join(source, ".ssh", "id_ed25519"), "test fixture\n", "utf8");
  createArchive(source, path.join(archives, "unsafe.tgz"));
  const findings = await scanBackupArchives(path.join(root, "backups"));
  assert.ok(findings.some((finding) => finding.includes("archive_secret_path")));
});

test("workspace scan blocks live private env files but permits .env.example", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj-workspace-secret-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, ".env.example"), "SAFE=1\n", "utf8");
  assert.deepEqual(await scanWorkspaceSecretFiles(root), []);
  await writeFile(path.join(root, ".env.local"), "PRIVATE=1\n", "utf8");
  const findings = await scanWorkspaceSecretFiles(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /workspace_secret_path/);
  assert.doesNotMatch(findings[0], /PRIVATE=1/);
});

function createArchive(source, target) {
  const result = spawnSync("tar", ["-czf", target, "-C", source, "."], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
