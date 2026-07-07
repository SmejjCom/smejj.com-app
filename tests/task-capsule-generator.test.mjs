import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildContextPlan, buildTaskCapsule, writeTaskCapsuleFiles } from "../scripts/agent/create_task_capsule.mjs";
import { readJson, validateSchema } from "../scripts/validation-utils.mjs";

test("context planner builds targeted repo pack and forbids blind full-repo loading", () => {
  const plan = buildContextPlan({
    jobId: "job_test_001",
    candidateFiles: [
      ["README.md", "project policy"],
      ["node_modules/example.json", "must be excluded"],
      ["missing-file.js", "missing files are skipped"]
    ]
  });

  assert.equal(plan.planner.strategy, "targeted-repo-pack");
  assert.equal(plan.planner.blindFullRepoLoadAllowed, false);
  assert.equal(plan.selectedFiles.length, 1);
  assert.equal(plan.selectedFiles[0].path, "README.md");
  assert.ok(plan.exclusions.some((item) => item.path === "node_modules/"));
});

test("task capsule is GLM-first, replayable, rollback-safe and memory-safe", () => {
  const capsule = buildTaskCapsule({ jobId: "job_test_002", effort: "max" });
  assert.equal(capsule.model.id, "glm-5-2");
  assert.equal(capsule.model.effort, "max");
  assert.equal(capsule.policy.replayable, true);
  assert.equal(capsule.policy.rollbackBeforePatch, true);
  assert.equal(capsule.policy.blindFullRepoLoadAllowed, false);
  assert.equal(capsule.memory.learnDirectlyFromModelOutput, false);
  assert.equal(capsule.verification.selfFixMaxAttempts, 3);
});

test("generated context plan and task capsule match checked-in schemas", () => {
  const contextSchema = readJson("schemas/context-plan.schema.json");
  const capsuleSchema = readJson("schemas/task-capsule.schema.json");
  const plan = buildContextPlan({ jobId: "job_test_003", candidateFiles: [["README.md", "project policy"]] });
  const capsule = buildTaskCapsule({ jobId: "job_test_003" });

  assert.deepEqual(validateSchema(plan, contextSchema, "generated context plan"), []);
  assert.deepEqual(validateSchema(capsule, capsuleSchema, "generated task capsule"), []);
});

test("CLI writer creates local files without touching IDrive or model weights", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "smejj-task-capsule-"));
  const result = writeTaskCapsuleFiles({ outDir, jobId: "job_test_004" });
  assert.equal(fs.existsSync(path.join(outDir, "context-plan.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "task-capsule.json")), true);
  assert.equal(result.taskCapsule.model.id, "glm-5-2");
});
