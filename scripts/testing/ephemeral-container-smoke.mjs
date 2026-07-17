import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startEphemeralWorker } from "../deploy/bootstrap-ephemeral-worker.mjs";
import { buildEphemeralRuntimeManifest } from "../deploy/build-ephemeral-runtime-manifest.mjs";

const projectRoot = process.env.SMEJJ_SMOKE_SOURCE_ROOT || "/source";
const appRoot = process.env.SMEJJ_SMOKE_APP_ROOT || "/tmp/smejj.com-ephemeral-runtime";
const commit = "a".repeat(40);
const sourceBase = `https://raw.githubusercontent.com/example/repo/${commit}/runtime/ephemeral-worker`;
const release = await buildEphemeralRuntimeManifest({ projectRoot });
const byPath = new Map(release.manifest.files.map((file) => [
  file.path,
  path.join(projectRoot, "workers", file.path)
]));

const server = await startEphemeralWorker({
  appRoot,
  env: {
    ...process.env,
    SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE: sourceBase,
    SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: release.manifestSha256,
    SMEJJ_WORKER_BROWSER_REQUIRED: "YES",
    SMEJJ_HOST: "::",
    SMEJJ_WORKER_PORT: "8080"
  },
  fetchImpl: async (url) => {
    const relative = String(url).slice(`${sourceBase}/`.length);
    if (relative === "manifest.json") return new Response(release.text, { status: 200 });
    const sourcePath = byPath.get(relative);
    return sourcePath
      ? new Response(await readFile(sourcePath, "utf8"), { status: 200 })
      : new Response("not found", { status: 404 });
  }
});

try {
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  const health = await (await fetch("http://127.0.0.1:8080/health")).json();
  assert.equal(health.ok, true);
  assert.equal(health.privileged, false);
  assert.deepEqual(health.runtime, {
    node: "v20.15.1",
    git: "git version 2.45.4",
    python: "Python 3.12.13",
    pytest: "8.3.5",
    playwright: "1.49.1",
    browser: "Chromium 131.0.6778.108 Alpine Linux",
    profile: "browser"
  });

  const { runCodingJob } = await import(`file://${path.join(appRoot, "smejj-worker/agentloop.mjs")}`);
  const result = await runCodingJob({
    jobId: "job_container_smoke",
    task: "Verify the pinned Python and browser runtime without changing files.",
    executionMode: "analyze",
    modelMode: "disabled",
    files: [
      { path: "pyproject.toml", content: "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n" },
      { path: "tests/test_smoke.py", content: "def test_runtime():\n    assert 2 + 2 == 4\n" },
      { path: "index.html", content: "<!doctype html><html><body><main>ephemeral runtime verified</main></body></html>\n" }
    ],
    preview: { required: true, staticPath: "index.html" }
  }, { skipTokenValidation: true });
  assert.equal(result.ok, true, JSON.stringify({
    errors: result.errors,
    verification: result.verification,
    browser: result.browser && { required: result.browser.required, ok: result.browser.ok, error: result.browser.error, checks: result.browser.checks }
  }));
  assert.equal(result.executionMode, "analyze");
  assert.equal(result.browser.ok, true);
  assert.equal(result.browser.screenshots.length, 2);
  assert.ok(result.verification.checks.some((check) => check.stage === "tests" && check.ok));
  console.log(JSON.stringify({
    ok: true,
    runtime: health.runtime,
    privileged: health.privileged,
    pytest: true,
    browserChecks: result.browser.checks.map((check) => ({ name: check.name, ok: check.ok })),
    screenshotCount: result.browser.screenshots.length
  }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
