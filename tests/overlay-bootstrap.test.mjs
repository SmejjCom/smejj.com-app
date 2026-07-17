import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyControlOverlay } from "../scripts/deploy/bootstrap-control-overlay.mjs";
import { controlRuntimeBase, loadVerifiedRuntimeModule, runBootstrap } from "../scripts/deploy/bootstrap-control-release.mjs";
import { checkControlRuntime } from "../scripts/deploy/check-control-runtime.mjs";
import { startCombinedWorker } from "../scripts/deploy/bootstrap-combined-worker.mjs";

const COMMIT = "a".repeat(40);
const fetchModule = async () => new Response("export const overlay = true;\n", { status: 200 });

test("control overlay restores every touched file when startup import fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-control-overlay-test-"));
  const serverFile = path.join(root, "src/server.js");
  await mkdir(path.dirname(serverFile), { recursive: true });
  await writeFile(serverFile, "original control\n", "utf8");
  try {
    await assert.rejects(() => applyControlOverlay({
      appRoot: root,
      sourceBase: `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/control-overlay`,
      fetchImpl: fetchModule,
      importModule: async () => { throw new Error("startup failed"); }
    }), /startup failed/);
    assert.equal(await readFile(serverFile, "utf8"), "original control\n");
    await assert.rejects(readFile(path.join(root, "src/shared/controlAccessPolicy.js"), "utf8"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("control overlay includes the complete Salad status protection chain", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-control-overlay-status-test-"));
  const requested = [];
  try {
    await applyControlOverlay({
      appRoot: root,
      sourceBase: `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/control-overlay`,
      fetchImpl: async (url) => {
        requested.push(String(url));
        return new Response("export const overlay = true;\n", { status: 200 });
      },
      importModule: async () => ({ started: true })
    });
    for (const file of [
      "src/server.js",
      "src/shared/env.js",
      "src/shared/controlAccessPolicy.js",
      "control-server/src/http/respond.js",
      "control-server/src/routes/saladRoutes.js",
      "control-server/src/budget/runtimeWatchdog.js",
      "control-server/src/budget/watchdogLeaseStore.js",
      "control-server/src/storage/s3Signer.js"
    ]) {
      assert.equal(requested.some((url) => url.endsWith(`/runtime/control-overlay/${file}`)), true, file);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("combined worker restores every touched file when startup import fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-worker-overlay-test-"));
  const workerFile = path.join(root, "remote-browser/worker.js");
  await mkdir(path.dirname(workerFile), { recursive: true });
  await writeFile(workerFile, "original worker\n", "utf8");
  try {
    await assert.rejects(() => startCombinedWorker({
      appRoot: root,
      sourceBase: `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/combined-worker`,
      fetchImpl: fetchModule,
      importModule: async () => { throw new Error("startup failed"); }
    }), /startup failed/);
    assert.equal(await readFile(workerFile, "utf8"), "original worker\n");
    await assert.rejects(readFile(path.join(root, "smejj-worker/agentloop.mjs"), "utf8"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("control release bootstrap requires one commit-pinned runtime base", () => {
  const url = `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/bootstrap-control-release.mjs`;
  assert.equal(controlRuntimeBase(url), `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime`);
  assert.throws(() => controlRuntimeBase("https://raw.githubusercontent.com/example/repo/main/runtime/bootstrap-control-release.mjs"), /commit_pinned/);
});

test("control release bootstrap verifies sibling module hashes", async () => {
  const source = await readFile("public/deploy/idrive-control-bootstrap.mjs", "utf8");
  let imported = "";
  const loaded = await loadVerifiedRuntimeModule(
    `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime`,
    "idrive",
    {
      fetchImpl: async () => new Response(source, { status: 200 }),
      importModule: async (url) => { imported = url; return { verified: true }; }
    }
  );
  assert.equal(loaded.verified, true);
  assert.match(imported, /^data:text\/javascript;base64,/);
  await assert.rejects(() => loadVerifiedRuntimeModule(
    `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime`,
    "idrive",
    { fetchImpl: async () => new Response(`${source}\nchanged`, { status: 200 }) }
  ), /sha256_mismatch/);
});

test("control release bootstrap accepts only the pinned control overlay", async () => {
  const source = await readFile("scripts/deploy/bootstrap-control-overlay.mjs", "utf8");
  let imported = "";
  const loaded = await loadVerifiedRuntimeModule(
    `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime`,
    "overlay",
    {
      fetchImpl: async () => new Response(source, { status: 200 }),
      importModule: async (url) => { imported = url; return { verified: true }; }
    }
  );
  assert.equal(loaded.verified, true);
  assert.match(imported, /^data:text\/javascript;base64,/);
  await assert.rejects(() => loadVerifiedRuntimeModule(
    `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime`,
    "overlay",
    { fetchImpl: async () => new Response(`${source}\nchanged`, { status: 200 }) }
  ), /sha256_mismatch/);
});

test("control release bootstrap overlays the verified IDrive release before startup", async () => {
  const runtimeUrl = `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/bootstrap-control-release.mjs`;
  const calls = [];
  const processEnv = {};
  const result = await runBootstrap({
    env: { SMEJJ_CONTROL_BOOTSTRAP_URL: runtimeUrl },
    processEnv,
    chdir: (directory) => calls.push(["chdir", directory]),
    logger: () => {},
    loadModule: async (_runtimeBase, name) => name === "idrive"
      ? {
          readBootstrapConfig: () => ({ key: "deployments/control/release.tar.gz" }),
          downloadVerifiedArtifact: async () => ({ archive: Buffer.from("archive"), actualSha256: "a".repeat(64) }),
          extractVerifiedArtifact: async () => ({ releaseRoot: "/tmp/smejj-control-release" })
        }
      : {
          applyControlOverlay: async (options) => { calls.push(["overlay", options]); return { started: true }; }
        }
  });
  assert.deepEqual(result, { started: true });
  assert.equal(processEnv.PROJECT_ROOT, "/tmp/smejj-control-release");
  assert.deepEqual(calls[0], ["chdir", "/tmp/smejj-control-release"]);
  assert.equal(calls[1][0], "overlay");
  assert.equal(calls[1][1].appRoot, "/tmp/smejj-control-release");
  assert.equal(calls[1][1].sourceBase, `https://raw.githubusercontent.com/example/repo/${COMMIT}/runtime/control-overlay`);
});

test("runtime checker validates only source files that are actually present", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smejj.com-control-runtime-check-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "src/server.js"), "export const server = true;\n", "utf8");
  await writeFile(path.join(root, "src/._server.js"), "not JavaScript metadata\u0000\n", "utf8");
  await writeFile(path.join(root, "public/app.mjs"), "export const app = true;\n", "utf8");
  await writeFile(path.join(root, "public/readme.txt"), "not JavaScript\n", "utf8");
  const checked = [];
  try {
    const result = await checkControlRuntime(root, {
      execFile: (_node, args) => checked.push(args[1]),
      logger: () => {}
    });
    assert.equal(result.checkedFiles, 2);
    assert.deepEqual(checked.map((file) => path.relative(root, file)), ["public/app.mjs", "src/server.js"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
