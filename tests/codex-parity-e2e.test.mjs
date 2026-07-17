import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer as createWorkerServer } from "../workers/smejj-worker/worker.mjs";
import { handleWorkerModelAction, handleWorkerValidate } from "../control-server/src/routes/workerModelRoutes.js";
import { buildHttpDispatch, createAutonomousRunner } from "../control-server/src/orchestrator/autonomousRunner.js";
import { buildWorkerOutcomeObjects } from "../control-server/src/jobs/jobArtifacts.js";
import { clearJobs, getJob, saveJob } from "../control-server/src/jobs/jobStore.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";

test("end-to-end autonomous loop dispatches, edits, verifies and prepares Task Capsule evidence", { timeout: 30_000 }, async () => {
  clearJobs();
  const job = createStorageFirstJobEnvelope({
    body: { jobId: "job_e2e_phase2", projectId: "project_smejj", task: "Change value to 2" },
    env: {}
  }).job;
  saveJob(job);

  let modelCalls = 0;
  const modelServer = http.createServer(async (_req, res) => {
    modelCalls += 1;
    const tool = modelCalls === 1
      ? { id: "write_1", name: "write_file", args: { path: "index.js", content: "export const value = 2;\n" } }
      : { id: "finish_1", name: "finish", args: { summary: "Changed and verified" } };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: tool.id, type: "function", function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } }] }));
  });
  const modelOrigin = await listen(modelServer);
  const env = {
    SMEJJ_WORKER_TOKEN_SECRET: "e2e-worker-secret",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu",
    SMEJJ_LLM_ZHIPU_API_KEY: "e2e-model-secret",
    SMEJJ_LLM_ZHIPU_BASE_URL: `${modelOrigin}/v1`,
    SMEJJ_WORKER_REQUEST_TIMEOUT_MS: "20000"
  };
  const controlServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://control.local");
    if (url.pathname === "/api/workers/validate") return handleWorkerValidate(req, res, { env });
    if (url.pathname === "/api/workers/model-action") return handleWorkerModelAction(req, res, { env });
    res.writeHead(404).end();
  });
  const controlOrigin = await listen(controlServer);
  const previousControlOrigin = process.env.SMEJJ_CONTROL_ORIGIN;
  process.env.SMEJJ_CONTROL_ORIGIN = controlOrigin;
  const workerServer = createWorkerServer();
  const workerOrigin = await listen(workerServer);

  try {
    const persisted = [];
    const dispatch = buildHttpDispatch({ ...env, SMEJJ_WORKER_DISPATCH_URL: `${workerOrigin}/run` });
    const runner = createAutonomousRunner({
      dispatch,
      persistOutcome: async ({ job: activeJob, outcome }) => {
        persisted.push(...buildWorkerOutcomeObjects(activeJob, outcome));
        return { ok: true, objectCount: persisted.length };
      }
    });
    const result = await runner(job.id, {
      files: [{ path: "index.js", content: "export const value = 1;\n" }],
      verification: { install: false }
    });

    assert.equal(result.ok, true);
    assert.equal(modelCalls, 2);
    assert.match(result.result.diff, /value = 2/);
    assert.equal(result.result.approval.mergePerformed, false);
    assert.equal(getJob(job.id).status, "passed");
    assert.ok(persisted.some((object) => object.key === job.taskCapsule.patch));
    assert.ok(persisted.some((object) => object.key.endsWith("verification-gates.json")) === false);
  } finally {
    process.env.SMEJJ_CONTROL_ORIGIN = previousControlOrigin;
    await close(workerServer);
    await close(controlServer);
    await close(modelServer);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
