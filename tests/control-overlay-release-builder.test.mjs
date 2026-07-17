import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildControlOverlayRelease } from "../scripts/deploy/build_control_overlay_release.mjs";

test("control overlay release builder is deterministic and strips local source paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-release-builder-"));
  const source = "export const verified = true;\n";
  const sourceSha = crypto.createHash("sha256").update(source).digest("hex");
  await writeFile(path.join(root, "source.mjs"), source, "utf8");
  const spec = {
    schemaVersion: 1,
    releaseId: "smejj-control-test-rc1",
    app: "smejj.com",
    scope: "control-overlay-only",
    authorization: { productionDeployAuthorized: false, externalMutationAuthorized: false },
    files: [{
      path: "runtime/bootstrap-control-overlay.mjs",
      source: "source.mjs",
      baselineSha256: "a".repeat(64),
      sha256: sourceSha
    }],
    verificationMarkdown: "# Staging verification\n"
  };
  try {
    const first = await buildControlOverlayRelease({
      rootDir: root,
      spec,
      outputDirectory: path.join(root, "out-1"),
      outputArchive: path.join(root, "release-1.tar.gz")
    });
    const second = await buildControlOverlayRelease({
      rootDir: root,
      spec,
      outputDirectory: path.join(root, "out-2"),
      outputArchive: path.join(root, "release-2.tar.gz")
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.archive), await readFile(second.archive));
    const manifest = JSON.parse(await readFile(path.join(first.directory, "release-manifest.json"), "utf8"));
    assert.equal(manifest.files[0].source, undefined);
    assert.equal(manifest.authorization.productionDeployAuthorized, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("control overlay release builder rejects changed inputs and embedded production approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-release-builder-deny-"));
  await writeFile(path.join(root, "source.mjs"), "changed\n", "utf8");
  const baseSpec = {
    schemaVersion: 1,
    releaseId: "smejj-control-test-rc2",
    app: "smejj.com",
    scope: "control-overlay-only",
    authorization: { productionDeployAuthorized: false, externalMutationAuthorized: false },
    files: [{
      path: "runtime/bootstrap-control-overlay.mjs",
      source: "source.mjs",
      baselineSha256: "a".repeat(64),
      sha256: "b".repeat(64)
    }],
    verificationMarkdown: "verify\n"
  };
  try {
    await assert.rejects(buildControlOverlayRelease({
      rootDir: root,
      spec: baseSpec,
      outputDirectory: path.join(root, "out"),
      outputArchive: path.join(root, "release.tar.gz")
    }), /source_sha256_mismatch/);
    await assert.rejects(buildControlOverlayRelease({
      rootDir: root,
      spec: {
        ...baseSpec,
        authorization: { productionDeployAuthorized: true, externalMutationAuthorized: false }
      },
      outputDirectory: path.join(root, "out-prod"),
      outputArchive: path.join(root, "release-prod.tar.gz")
    }), /refuses_production_authorization/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
