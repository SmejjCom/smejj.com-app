import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildControlReleaseArtifact } from "../scripts/deploy/build_control_release_artifact.mjs";

test("full control release artifact is deterministic, manifest-bound and secrets-free", async () => {
  const root = await fixtureRoot();
  try {
    const first = await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-control-test-rc1",
      createdAt: "2026-07-11T00:00:00.000Z",
      includePaths: ["package.json", "src"],
      outputArchive: "out/release-1.tar.gz"
    });
    const second = await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-control-test-rc1",
      createdAt: "2026-07-11T00:00:00.000Z",
      includePaths: ["package.json", "src"],
      outputArchive: "out/release-2.tar.gz"
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.archive), await readFile(second.archive));
    const manifest = JSON.parse(await readFile(first.manifest, "utf8"));
    assert.equal(manifest.authorization.productionDeployAuthorized, false);
    assert.equal(manifest.security.secretsIncluded, false);
    assert.ok(manifest.files.some((file) => file.path === "src/server.js"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full control release artifact rejects private env and secret-like values", async () => {
  const root = await fixtureRoot();
  try {
    await writeFile(path.join(root, "src", ".env.local"), "TOKEN=secret\n", "utf8");
    await assert.rejects(buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-control-test-rc2",
      includePaths: ["package.json", "src"],
      outputArchive: "out/private.tar.gz"
    }), /private_path_blocked/);
    await rm(path.join(root, "src", ".env.local"));
    const fakeAccessKey = `${"AKIA"}${"1234567890ABCDEF"}`;
    await writeFile(path.join(root, "src", "leak.js"), `const key = '${fakeAccessKey}';\n`, "utf8");
    await assert.rejects(buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-control-test-rc3",
      includePaths: ["package.json", "src"],
      outputArchive: "out/leak.tar.gz"
    }), /secret_like_content/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-full-release-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"smejj.com-test","type":"module"}\n', "utf8");
  await writeFile(path.join(root, "src", "server.js"), "export const app = 'smejj.com';\n", "utf8");
  return root;
}
