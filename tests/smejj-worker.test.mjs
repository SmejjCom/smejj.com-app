import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { access, chmod, mkdir, symlink, writeFile as rawWriteFile } from "node:fs/promises";
import path from "node:path";
import { validateCommand } from "../workers/smejj-worker/allowlist.mjs";
import { createWorkspace, readWorkspaceFile, runAllowed, runTrusted, writeWorkspaceFile } from "../workers/smejj-worker/sandbox.mjs";
import { runCodingJob } from "../workers/smejj-worker/agentloop.mjs";
import { requestModelAction } from "../workers/smejj-worker/model-client.mjs";
import { gitAuthEnvironment, repositoryDiff } from "../workers/smejj-worker/repository.mjs";
import { publishDraftPullRequest } from "../workers/smejj-worker/publish.mjs";
import { runVerification } from "../workers/smejj-worker/verification.mjs";
import { runBrowserVerification } from "../workers/smejj-worker/browser-verification.mjs";

test("command allowlist accepts verification commands and rejects unsafe shell", () => {
  assert.equal(validateCommand("npm test").ok, true);
  assert.equal(validateCommand("node --check index.js").ok, true);
  assert.equal(validateCommand("git status --short").ok, true);
  assert.equal(validateCommand(["npm", "run", "build"], { allowedScripts: ["build"] }).ok, true);
  assert.equal(validateCommand(["npm", "run", "publish"], { allowedScripts: ["build"] }).ok, false);
  assert.equal(validateCommand("curl https://example.com").ok, false);
  assert.equal(validateCommand(["rg", "--pre=sh", "needle", "."]).ok, false);
  assert.equal(validateCommand(["cat", ".env"]).ok, false);
  assert.equal(validateCommand(["ls", "-la"]).ok, false);
  assert.equal(validateCommand(["git", "show", "HEAD:.env"]).ok, false);
  assert.equal(validateCommand(["git", "log", "-p"]).ok, false);
  assert.equal(validateCommand(["node", "--check", ".env"]).ok, false);
  assert.equal(validateCommand(["python3", "-m", "pytest", ".env"]).ok, false);
  assert.equal(validateCommand("npm test && rm -rf .").ok, false);
});

test("workspace blocks unsafe paths and can run node syntax check", async () => {
  const workspace = await createWorkspace([{ path: "index.js", content: "export const ok = true;\n" }]);
  try {
    await assert.rejects(() => writeWorkspaceFile(workspace.root, "../x", "bad"), /unsafe_path/);
    await assert.rejects(() => writeWorkspaceFile(workspace.root, ".env", "SECRET=x"), /blocked_path/);
    await assert.rejects(() => writeWorkspaceFile(workspace.root, ".npmrc", "token=x"), /blocked_path/);
    await assert.rejects(() => writeWorkspaceFile(workspace.root, "cert.pem", "key"), /blocked_path/);
    const result = await runAllowed(workspace.root, "node --check index.js");
    assert.equal(result.ok, true);
    assert.match((await readWorkspaceFile(workspace.root, "index.js")).content, /ok/);
  } finally {
    await workspace.cleanup();
  }
});

test("verification honors packageManager when a pnpm project has no lockfile", async () => {
  const workspace = await createWorkspace([
    {
      path: "package.json",
      content: JSON.stringify({
        private: true,
        type: "module",
        packageManager: "pnpm@10.13.1",
        scripts: { build: "node --check index.js", test: "node --test" }
      })
    },
    { path: "index.js", content: "export const add = (a, b) => a - b;\n" },
    {
      path: "test/add.test.js",
      content: "import test from 'node:test'; import assert from 'node:assert/strict'; import { add } from '../index.js'; test('add', () => assert.equal(add(2, 3), 5));\n"
    }
  ]);
  try {
    const result = await runVerification(workspace.root, { install: false });
    assert.equal(result.manager, "pnpm");
    assert.match(result.checks.find((check) => check.stage === "build").command, /^(?:corepack )?pnpm run build$/);
    assert.equal(result.checks.find((check) => check.stage === "build").ok, true);
    assert.equal(result.checks.find((check) => check.stage === "tests").ok, false);
  } finally {
    await workspace.cleanup();
  }
});

test("worker search is available without an external ripgrep binary", async () => {
  const workspace = await createWorkspace([
    { path: "src/a.js", content: "export const needle = true;\n" },
    { path: "src/b.js", content: "export const other = false;\n" }
  ]);
  try {
    await rawWriteFile(path.join(workspace.root, ".env.local"), "needle=example_value\n", "utf8");
    await assert.rejects(() => readWorkspaceFile(workspace.root, ".env.local"), /blocked_path/);
    const matches = await runAllowed(workspace.root, ["rg", "-n", "needle", "src"]);
    assert.equal(matches.ok, true);
    assert.match(matches.stdout, /src\/a\.js:1:export const needle/);
    const files = await runAllowed(workspace.root, ["rg", "--files", "src"]);
    assert.equal(files.ok, true);
    assert.match(files.stdout, /src\/b\.js/);
    const allFiles = await runAllowed(workspace.root, ["rg", "--files", "."]);
    assert.doesNotMatch(allFiles.stdout, /\.env/);
    const allMatches = await runAllowed(workspace.root, ["rg", "-n", "needle", "."]);
    assert.doesNotMatch(allMatches.stdout, /example_value/);
  } finally {
    await workspace.cleanup();
  }
});

test("repository diff rejects sensitive files created indirectly by repo scripts", async () => {
  const workspace = await createWorkspace([{ path: "README.md", content: "# Safe\n" }]);
  try {
    await rawWriteFile(path.join(workspace.root, ".env"), "UNRECOGNIZED_SECRET_VALUE=example\n", "utf8");
    await assert.rejects(() => repositoryDiff(workspace.root), /sensitive_diff_path_blocked:\.env/);
  } finally {
    await workspace.cleanup();
  }
});

test("private GitHub clone auth is process-scoped and never embeds the token in a URL", () => {
  const token = "installation-token-for-test";
  const env = gitAuthEnvironment(token);
  assert.equal(env.GIT_CONFIG_COUNT, "1");
  assert.equal(env.GIT_CONFIG_KEY_0, "http.https://github.com/.extraHeader");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.match(env.GIT_CONFIG_VALUE_0, /^Authorization: Basic /);
  const encoded = env.GIT_CONFIG_VALUE_0.slice("Authorization: Basic ".length);
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), `x-access-token:${token}`);
  assert.equal(JSON.stringify(env).includes("https://x-access-token"), false);
});

test("repository diff rejects symlinks created indirectly by repo scripts", async () => {
  const workspace = await createWorkspace([{ path: "README.md", content: "# Safe\n" }]);
  try {
    await symlink("/etc/hosts", path.join(workspace.root, "host-link.txt"));
    await assert.rejects(() => repositoryDiff(workspace.root), /symlink_diff_path_blocked:host-link\.txt/);
  } finally {
    await workspace.cleanup();
  }
});

test("repository diff excludes generated test caches but retains real source changes", async () => {
  const workspace = await createWorkspace([{ path: "index.js", content: "export const value = 1;\n" }]);
  try {
    await mkdir(path.join(workspace.root, ".pytest_cache"), { recursive: true });
    await rawWriteFile(path.join(workspace.root, ".pytest_cache/state"), "generated\n");
    await mkdir(path.join(workspace.root, "tests/__pycache__"), { recursive: true });
    await rawWriteFile(path.join(workspace.root, "tests/__pycache__/test_runtime.pyc"), "generated\n");
    assert.equal(await repositoryDiff(workspace.root), "");
    await writeWorkspaceFile(workspace.root, "index.js", "export const value = 2;\n");
    const diff = await repositoryDiff(workspace.root);
    assert.match(diff, /export const value = 2/);
    assert.doesNotMatch(diff, /generated/);
  } finally {
    await workspace.cleanup();
  }
});

test("sandbox timeout terminates a hanging process", async () => {
  const workspace = await createWorkspace([]);
  try {
    const result = await runTrusted(workspace.root, [process.execPath, "-e", "setInterval(() => {}, 1000)"], { timeoutMs: 100 });
    assert.equal(result.ok, false);
    assert.equal(result.stderr, "timeout");
  } finally {
    await workspace.cleanup();
  }
});

test("sandbox cancellation terminates a running process group", async () => {
  const workspace = await createWorkspace([]);
  const controller = new AbortController();
  try {
    const pending = runTrusted(
      workspace.root,
      [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      { timeoutMs: 10_000, signal: controller.signal }
    );
    setTimeout(() => controller.abort("job_cancelled"), 50);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.stderr, "job_cancelled");
  } finally {
    await workspace.cleanup();
  }
});

test("sandbox treats an early child stdin close as a normal process exit", async () => {
  const workspace = await createWorkspace([]);
  try {
    const result = await runTrusted(
      workspace.root,
      [process.execPath, "-e", "process.exit(0)"],
      { stdin: "x".repeat(2_000_000) }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, 0);
  } finally {
    await workspace.cleanup();
  }
});

test("sandbox redacts secret-like child output before it leaves the worker", async () => {
  const workspace = await createWorkspace([]);
  try {
    const result = await runTrusted(workspace.root, [
      process.execPath,
      "-e",
      "console.log('api_key=example_super_secret_value_123456789')"
    ]);
    assert.equal(result.ok, true);
    assert.match(result.stdout, /api_key=\[REDACTED\]/);
    assert.doesNotMatch(result.stdout, /example_super_secret/);
    const github = await runTrusted(workspace.root, [
      process.execPath,
      "-e",
      `console.log(${JSON.stringify(["ghs", "ghu", "ghr", "gho", "ghp", "github_pat"].map((prefix) => `${prefix}_${"z".repeat(32)}`).join(" "))})`
    ]);
    assert.equal(github.ok, true);
    assert.equal((github.stdout.match(/\[REDACTED_GITHUB_TOKEN\]/g) || []).length, 6);
    assert.doesNotMatch(github.stdout, /z{20}/);
  } finally {
    await workspace.cleanup();
  }
});

test("coding job applies edits and fails closed on unavailable command", async () => {
  const result = await runCodingJob({
    jobId: "job_worker_explicit",
    task: "check syntax",
    files: [{ path: "index.js", content: "export const value = 1;\n" }],
    edits: [{ path: "index.js", content: "export const value = 2;\n" }],
    commands: ["node --check index.js"],
    modelMode: "disabled"
  }, { skipTokenValidation: true });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.iterations.some((item) => item.action === "write_file"));
  assert.ok(result.iterations.some((item) => item.action === "run_cmd" && item.ok));
  assert.equal(result.memoryUpdate.learn, false);
  assert.equal(result.memoryUpdate.state, "candidate-pending-memory-rights-privacy-quality-gate");
  assert.equal(result.changeSet.changes[0].status, "modified");
  assert.match(result.changeSet.changes[0].baseBlobSha, /^[a-f0-9]{40}$/);
});

test("new untracked files are included in the verified diff", async () => {
  const result = await runCodingJob({
    jobId: "job_worker_new_file",
    task: "Add documentation",
    files: [{ path: "README.md", content: "# Demo\n" }],
    edits: [{ path: "docs/note.md", content: "Verified note.\n" }],
    modelMode: "disabled"
  }, { skipTokenValidation: true });
  assert.equal(result.ok, true);
  assert.match(result.diff, /new file mode/);
  assert.match(result.diff, /Verified note/);
  assert.equal(result.changeSet.schemaVersion, 1);
  assert.equal(result.changeSet.diffSha256, result.diffSha256);
  assert.equal(result.changeSet.changes.length, 1);
  assert.equal(result.changeSet.changes[0].status, "added");
  assert.equal(result.changeSet.changes[0].baseBlobSha, null);
  assert.equal(Buffer.from(result.changeSet.changes[0].contentBase64, "base64").toString("utf8"), "Verified note.\n");
});

test("coding job iterates structured GLM tool calls until verification passes", async () => {
  const actions = [
    { id: "call_write", name: "write_file", arguments: { path: "index.js", content: "export const value = 2;\n" } },
    { id: "call_finish", name: "finish", arguments: { summary: "Updated value" } }
  ];
  const result = await runCodingJob({
    jobId: "job_worker_tools",
    task: "Change value to 2",
    files: [{ path: "index.js", content: "export const value = 1;\n" }]
  }, {
    skipTokenValidation: true,
    requestAction: async () => {
      const toolCall = actions.shift();
      return { toolCall };
    }
  });

  assert.equal(result.ok, true);
  assert.match(result.diff, /value = 2/);
  assert.equal(result.iterations.filter((item) => item.action === "write_file").length, 1);
  assert.equal(result.approval.required, true);
  assert.equal(result.approval.mergePerformed, false);
  assert.equal(result.repository.branch, "smejj.com/agent/job_worker_tools");
});

test("coding agent can inspect an approved website before final verification", async () => {
  const actions = [
    { id: "call_browser", name: "browser_check", arguments: { url: "https://example.com/", actions: [{ type: "click", selector: "a" }] } },
    { id: "call_finish_browser", name: "finish", arguments: { summary: "Website verified" } }
  ];
  const browserCalls = [];
  const result = await runCodingJob({
    jobId: "job_worker_browser_tool",
    task: "Inspect the approved website",
    executionMode: "analyze",
    files: [{ path: "README.md", content: "# Demo\n" }],
    preview: { required: true, url: "https://example.com/" }
  }, {
    skipTokenValidation: true,
    requestAction: async () => ({ toolCall: actions.shift() }),
    browserCheck: async (_root, preview) => {
      browserCalls.push(preview);
      return { required: true, ok: true, url: preview.url, checks: [{ name: "desktop", ok: true }], screenshots: [] };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.executionMode, "analyze");
  assert.equal(result.diff, "");
  assert.equal(browserCalls[0].actions[0].selector, "a");
  assert.ok(result.iterations.some((item) => item.action === "browser_check" && item.ok));
});

test("browser verification returns bounded page evidence after actions", async () => {
  const pages = [];
  const browser = {
    newPage: async ({ viewport }) => {
      let evaluations = 0;
      const page = {
        on: () => {},
        route: async () => {},
        goto: async () => ({ ok: () => true, status: () => 200 }),
        evaluate: async () => evaluations++ === 0
          ? {
              title: "Example Domain",
              url: "https://example.com/",
              headings: [{ level: "h1", text: "Example Domain" }],
              interactive: [{ tag: "a", text: "Learn more", href: "https://iana.org/domains/example" }],
              visibleText: "Example Domain This domain is for documentation examples."
            }
          : { ok: true, unlabeledInputs: 0, missingAlt: 0 },
        screenshot: async () => Buffer.from("jpeg"),
        close: async () => {}
      };
      pages.push({ viewport, page });
      return page;
    },
    close: async () => {}
  };
  const result = await runBrowserVerification("/tmp/workspace", {
    required: true,
    url: "https://example.com/"
  }, {
    loadPlaywright: async () => ({ chromium: { launch: async () => browser } })
  });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].evidence.title, "Example Domain");
  assert.equal(result.checks[0].evidence.headings[0].text, "Example Domain");
  assert.equal(result.checks[0].evidence.interactive[0].text, "Learn more");
  assert.deepEqual(pages.map((entry) => entry.viewport), [{ width: 1440, height: 900 }, { width: 390, height: 844 }]);
});

test("coding job propagates cancellation into an active model request", async () => {
  const controller = new AbortController();
  const pending = runCodingJob({
    jobId: "job_worker_cancel",
    task: "Wait for cancellation",
    files: [{ path: "index.js", content: "export const value = 1;\n" }]
  }, {
    skipTokenValidation: true,
    signal: controller.signal,
    requestAction: async ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("job_cancelled")), { once: true });
    })
  });
  setTimeout(() => controller.abort("job_cancelled"), 50);
  await assert.rejects(pending, /job_cancelled/);
});

test("default model client aborts its Control request", async () => {
  const controller = new AbortController();
  const pending = requestModelAction({
    controlOrigin: "http://127.0.0.1:3000",
    token: "worker-token",
    jobId: "job_model_cancel",
    messages: [{ role: "user", content: "wait" }],
    signal: controller.signal,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("fetch_aborted")), { once: true });
    })
  });
  controller.abort("job_cancelled");
  await assert.rejects(pending, /fetch_aborted/);
});

test("required browser verification cannot be bypassed in explicit mode", async () => {
  let browserCalls = 0;
  const result = await runCodingJob({
    jobId: "job_worker_browser_gate",
    task: "Check a UI change",
    files: [{ path: "index.html", content: "<main>ok</main>\n" }],
    modelMode: "disabled",
    preview: { required: true, staticPath: "index.html" }
  }, {
    skipTokenValidation: true,
    browserCheck: async () => { browserCalls += 1; return { required: true, ok: false, error: "visual_regression", checks: [], screenshots: [] }; }
  });
  assert.equal(browserCalls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.memoryUpdate, null);
});

test("draft PR publication fails closed when approval is not bound to the exact diff", async () => {
  const result = await runCodingJob({
    jobId: "job_worker_approval_hash",
    task: "Prepare a verified diff",
    files: [{ path: "index.js", content: "export const value = 1;\n" }],
    edits: [{ path: "index.js", content: "export const value = 2;\n" }],
    modelMode: "disabled",
    approval: { createDraftPr: true, approvedDiffSha256: "0".repeat(64) }
  }, { skipTokenValidation: true });
  assert.equal(result.ok, false);
  assert.equal(result.approval.publish.status, "approval_hash_mismatch");
  assert.equal(result.repository.changed, false);
  assert.ok(result.errors.some((error) => error.source === "publish"));
});

test("draft PR publisher remains blocked even with approval and injected network callbacks", async () => {
  let pushCalls = 0;
  let fetchCalls = 0;
  const result = await publishDraftPullRequest("/untrusted/workspace", {
    url: "https://github.com/example/demo.git",
    baseRef: "main",
    baseCommit: "a".repeat(40),
    branch: "smejj.com/agent/job_secure_publish",
    publishMode: "draft-pr"
  }, {
    approved: true,
    approvedDiff: "diff --git a/index.js b/index.js\n",
    approvedDiffSha256: "b".repeat(64),
    actualDiffSha256: "b".repeat(64),
    token: `github_pat_${"x".repeat(40)}`,
    pushImpl: async () => { pushCalls += 1; return { ok: true }; },
    fetchImpl: async () => { fetchCalls += 1; return new Response("{}", { status: 201 }); }
  });

  assert.deepEqual(result, {
    ok: false,
    status: "blocked",
    error: "trusted_publisher_boundary_required",
    draftPullRequest: null,
    mergePerformed: false
  });
  assert.equal(pushCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("follow-up rejects a diff whose content does not match its hash", async () => {
  const repository = { url: "https://github.com/example/demo.git", baseRef: "main", baseCommit: "a".repeat(40) };
  await assert.rejects(() => runCodingJob({
    jobId: "job_worker_follow_up_hash",
    task: "Continue a verified change",
    repository: { url: "https://github.com/example/demo.git", baseRef: "main" },
    followUpContext: {
      parentJobId: "job_parent",
      diff: "tampered",
      diffSha256: crypto.createHash("sha256").update("original").digest("hex"),
      repository: { url: "https://github.com/example/demo.git", baseRef: "main" }
    },
    modelMode: "disabled"
  }, {
    skipTokenValidation: true,
    prepareRepository: async () => {
      const workspace = await createWorkspace([{ path: "index.js", content: "export const value = 1;\n" }]);
      return { ...workspace, repository };
    }
  }), /follow_up_diff_hash_mismatch/);
});

test("follow-up applies a verified parent diff without duplicating it into the model prompt", async () => {
  const repository = { url: "https://github.com/example/demo.git", baseRef: "main", baseCommit: "a".repeat(40) };
  const diff = "diff --git a/index.js b/index.js\nindex 6a79285..dd24385 100644\n--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n";
  let modelMessages;
  const result = await runCodingJob({
    jobId: "job_worker_follow_up_valid",
    task: "Verify the continued change",
    repository: { url: repository.url, baseRef: repository.baseRef },
    followUpContext: {
      parentJobId: "job_parent",
      diff,
      diffSha256: crypto.createHash("sha256").update(diff).digest("hex"),
      finalReport: "Parent verified",
      repository: { url: repository.url, baseRef: repository.baseRef }
    }
  }, {
    skipTokenValidation: true,
    prepareRepository: async () => {
      const workspace = await createWorkspace([{ path: "index.js", content: "export const value = 1;\n" }]);
      return { ...workspace, repository };
    },
    requestAction: async ({ messages }) => {
      modelMessages = messages;
      return { toolCall: { id: "finish_follow_up", name: "finish", arguments: { summary: "Continued parent change" } } };
    }
  });
  assert.equal(result.ok, true);
  assert.match(result.diff, /value = 2/);
  assert.ok(result.iterations.some((item) => item.action === "apply_follow_up_diff"));
  assert.equal(modelMessages[1].content.includes(diff), false);
  assert.match(modelMessages[1].content, /appliedToWorkspace/);
});
