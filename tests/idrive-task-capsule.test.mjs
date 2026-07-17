import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskCapsuleWritePlan, createIdriveLiteCodingJob, createStorageFirstJobEnvelope, writeJobEnvelopeToIdrive, writeTaskCapsuleToIdrive } from "../src/jobs/index.js";

test("task capsule write plan contains replayable IDrive objects", () => {
  const job = createIdriveLiteCodingJob({
    jobId: "job_capsule_001",
    projectId: "project_smejj",
    task: "Fix chat latency",
    createdAt: "2026-06-24T12:00:00Z"
  });
  assert.equal(job.model.id, "glm-5-2");
  const plan = buildTaskCapsuleWritePlan(job, { now: "2026-06-24T12:01:00Z" });

  assert.equal(plan.ok, true);
  assert.equal(plan.provider, "idrive-e2");
  assert.match(plan.rootPrefix, /^jobs\/2026\/06\/24\/[a-f0-9]{2}\/job_capsule_001\/$/);
  assert.ok(plan.requiredFiles.includes("budget"));
  assert.ok(plan.requiredFiles.includes("contextPlan"));
  assert.ok(plan.requiredFiles.includes("repoPackManifest"));
  assert.ok(plan.requiredFiles.includes("rollbackManifest"));
  assert.ok(plan.requiredFiles.includes("errors"));
  assert.ok(plan.requiredFiles.includes("selfFixAttempts"));
  assert.ok(plan.requiredFiles.includes("benchmarkResults"));
  assert.ok(plan.objects.some((object) => object.key.endsWith("input.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("budget.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("context-plan.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("repo-pack-manifest.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("status.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("test-results.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("errors.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("self-fix-attempts.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("benchmark-results.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("memory-update.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("events/000001-created.json")));
  assert.ok(plan.objects.some((object) => object.key.endsWith("rollback-manifest.json")));
  assert.ok(plan.objects.every((object) => object.key.startsWith(plan.rootPrefix)));
});

test("task capsule writer uses injected IDrive putObject only", async () => {
  const job = createIdriveLiteCodingJob({ jobId: "job_capsule_002", projectId: "project_smejj" });
  const uploaded = [];
  const result = await writeTaskCapsuleToIdrive(job, {
    now: "2026-06-24T12:01:00Z",
    putObject: async (object) => {
      uploaded.push(object.key);
      assert.equal(object.contentType, "application/json; charset=utf-8");
      assert.ok(object.body.endsWith("\n"));
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.objectCount, uploaded.length);
  assert.deepEqual(result.written, uploaded);
});

test("job envelope writer persists task capsule and queue objects together", async () => {
  const envelope = createStorageFirstJobEnvelope({
    now: "2026-06-24T12:00:00Z",
    body: {
      jobId: "job_capsule_003",
      projectId: "project_smejj",
      task: "Persist queue and capsule"
    }
  });
  const uploaded = [];
  const result = await writeJobEnvelopeToIdrive(envelope, {
    putObject: async (object) => {
      uploaded.push(object.key);
      assert.equal(typeof object.body, "string");
      assert.equal(object.contentType.includes("charset=utf-8"), true);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.objectCount, uploaded.length);
  assert.ok(uploaded.some((key) => key.endsWith("input.json")));
  assert.ok(uploaded.includes("jobs/open/job_capsule_003.json"));
  assert.ok(uploaded.includes("projects/project_smejj/jobs/open/job_capsule_003.json"));
});
