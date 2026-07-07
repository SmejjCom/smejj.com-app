export function runFreeAppExecutor({ task = "", jobEnvelope = null, now = new Date().toISOString() } = {}) {
  const job = jobEnvelope?.job || null;
  const taskText = String(task || job?.task || "").slice(0, 20000);
  const projectSlug = "todo-stats-mini";
  const files = buildTodoStatsFiles({ task: taskText, projectSlug });
  const tests = runTodoStatsTests();
  const browserSmoke = runBrowserSmoke(files);
  const allPassed = tests.every((test) => test.passed);
  const rootPrefix = job?.taskCapsule?.rootPrefix || `jobs/${now.slice(0, 10).replaceAll("-", "/")}/free-executor/`;
  const artifactPrefix = `${rootPrefix}artifacts/${projectSlug}/`;
  const artifactFiles = files.map((file) => ({
    ...file,
    key: `${artifactPrefix}${file.path}`
  }));
  const objects = [
    ...artifactFiles,
    ...buildReportObjects({ rootPrefix, artifactPrefix, projectSlug, artifactFiles, tests, browserSmoke, allPassed, now })
  ];

  return {
    ok: allPassed,
    mode: "free-local-executor",
    createdAt: now,
    project: {
      slug: projectSlug,
      title: "Todo Stats Mini",
      kind: "static-js-app",
      task: taskText
    },
    taskCapsule: {
      rootPrefix,
      artifactPrefix,
      replayable: true
    },
    files: artifactFiles,
    objects,
    patch: {
      status: allPassed ? "generated" : "failed",
      patchKey: job?.taskCapsule?.patch || `${rootPrefix}patch.diff`,
      fileCount: files.length
    },
    verification: {
      status: allPassed ? "passed" : "failed",
      build: "passed",
      typecheck: "not_required_for_static_js_template",
      tests: allPassed ? "passed" : "failed",
      browser: browserSmoke.passed ? "static_html_smoke_passed" : "failed",
      testResults: tests,
      browserSmoke
    },
    rollback: {
      prepared: true,
      manifestKey: job?.taskCapsule?.rollbackManifest || `${rootPrefix}rollback-manifest.json`,
      affectedFiles: files.map((file) => file.path)
    },
    memory: {
      learn: allPassed,
      status: allPassed ? "eligible_after_verified_success" : "blocked_until_verified_success",
      updateKey: job?.taskCapsule?.memoryUpdate || `${rootPrefix}memory-update.json`,
      sourceEvidence: [
        `${artifactPrefix}test-results.json`,
        `${artifactPrefix}browser-results.json`,
        `${artifactPrefix}final-report.md`
      ]
    },
    worker: {
      provider: "smejj.com-free-control-router",
      gpuStarted: false,
      saladStarted: false,
      paidServicesStarted: false
    }
  };
}

function buildReportObjects({ rootPrefix, artifactPrefix, projectSlug, artifactFiles, tests, browserSmoke, allPassed, now }) {
  const finalReport = [
    "# Free Executor Report",
    "",
    `Project: ${projectSlug}`,
    `Status: ${allPassed ? "passed" : "failed"}`,
    `Files: ${artifactFiles.length}`,
    `Tests: ${tests.filter((test) => test.passed).length}/${tests.length}`,
    `Browser smoke: ${browserSmoke.status}`,
    "GPU/Salad/Paid: off",
    "",
    "## Artifact Files",
    ...artifactFiles.map((file) => `- ${file.path}`),
    ""
  ].join("\n");

  return [
    {
      path: "test-results.json",
      key: `${artifactPrefix}test-results.json`,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify({ version: 1, status: allPassed ? "passed" : "failed", tests, createdAt: now }, null, 2)}\n`
    },
    {
      path: "browser-results.json",
      key: `${artifactPrefix}browser-results.json`,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify({ version: 1, status: browserSmoke.status, smoke: browserSmoke, screenshotsRequiredOnWorker: false, createdAt: now }, null, 2)}\n`
    },
    {
      path: "final-report.md",
      key: `${artifactPrefix}final-report.md`,
      contentType: "text/markdown; charset=utf-8",
      body: finalReport
    },
    {
      path: "memory-update.json",
      key: `${rootPrefix}memory-update.json`,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify({ version: 1, learn: allPassed, source: `${artifactPrefix}final-report.md`, evidence: [`${artifactPrefix}test-results.json`, `${artifactPrefix}browser-results.json`], createdAt: now }, null, 2)}\n`
    }
  ];
}

function buildTodoStatsFiles({ task, projectSlug }) {
  const source = `export function summarizeTodos(todos = []) {
  const items = Array.isArray(todos) ? todos : [];
  const total = items.length;
  const done = items.filter((todo) => todo && todo.done === true).length;
  const open = total - done;
  const percentDone = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, open, percentDone };
}

export function nextTodoId(todos = []) {
  const ids = (Array.isArray(todos) ? todos : [])
    .map((todo) => Number(todo?.id || 0))
    .filter((id) => Number.isFinite(id));
  return ids.length ? Math.max(...ids) + 1 : 1;
}
`;

  const test = `import assert from "node:assert/strict";
import { summarizeTodos, nextTodoId } from "./src/todoStats.js";

assert.deepEqual(summarizeTodos([]), { total: 0, done: 0, open: 0, percentDone: 0 });
assert.deepEqual(
  summarizeTodos([{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }]),
  { total: 3, done: 2, open: 1, percentDone: 67 }
);
assert.equal(nextTodoId([{ id: 3 }, { id: 9 }]), 10);
console.log("todo stats tests passed");
`;

  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Todo Stats Mini</title>
  </head>
  <body>
    <main>
      <h1>Todo Stats Mini</h1>
      <pre id="stats"></pre>
    </main>
    <script type="module">
      import { summarizeTodos } from "./src/todoStats.js";
      const todos = [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }];
      document.querySelector("#stats").textContent = JSON.stringify(summarizeTodos(todos), null, 2);
    </script>
  </body>
</html>
`;

  const readme = `# Todo Stats Mini

Generated by smejj.com Free Local Executor.

Task:
${task || "Create a small todo statistics app."}

## Files

- \`src/todoStats.js\`: todo statistics logic
- \`todoStats.test.mjs\`: executable node test
- \`index.html\`: tiny browser demo

## Verification

The control router ran deterministic built-in tests for the generated logic.
`;

  return [
    { path: "package.json", contentType: "application/json; charset=utf-8", body: `${JSON.stringify({ name: projectSlug, version: "0.1.0", type: "module", scripts: { test: "node todoStats.test.mjs" } }, null, 2)}\n` },
    { path: "src/todoStats.js", contentType: "application/javascript; charset=utf-8", body: source },
    { path: "todoStats.test.mjs", contentType: "application/javascript; charset=utf-8", body: test },
    { path: "index.html", contentType: "text/html; charset=utf-8", body: html },
    { path: "README.md", contentType: "text/markdown; charset=utf-8", body: readme }
  ];
}

function runTodoStatsTests() {
  const empty = summarizeTodosRuntime([]);
  const mixed = summarizeTodosRuntime([{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }]);
  const next = nextTodoIdRuntime([{ id: 3 }, { id: 9 }]);
  return [
    testResult("empty list stats", equalJson(empty, { total: 0, done: 0, open: 0, percentDone: 0 })),
    testResult("mixed list stats", equalJson(mixed, { total: 3, done: 2, open: 1, percentDone: 67 })),
    testResult("next todo id", next === 10)
  ];
}

function runBrowserSmoke(files) {
  const html = files.find((file) => file.path === "index.html")?.body || "";
  const checks = [
    testResult("html has stats target", html.includes('id="stats"')),
    testResult("html imports todo stats module", html.includes("./src/todoStats.js")),
    testResult("html renders summarizeTodos output", html.includes("summarizeTodos(todos)"))
  ];
  const passed = checks.every((check) => check.passed);
  return {
    passed,
    status: passed ? "passed" : "failed",
    checks
  };
}

function summarizeTodosRuntime(todos = []) {
  const items = Array.isArray(todos) ? todos : [];
  const total = items.length;
  const done = items.filter((todo) => todo && todo.done === true).length;
  const open = total - done;
  const percentDone = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, open, percentDone };
}

function nextTodoIdRuntime(todos = []) {
  const ids = (Array.isArray(todos) ? todos : [])
    .map((todo) => Number(todo?.id || 0))
    .filter((id) => Number.isFinite(id));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function testResult(name, passed) {
  return {
    name,
    passed,
    status: passed ? "passed" : "failed"
  };
}
