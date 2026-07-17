import test from "node:test";
import assert from "node:assert/strict";
import { createIdriveLiteCodingJob, transitionIdriveLiteJob } from "../src/jobs/index.js";

test("GLM-5.2 storage-first jobs keep heavy work in IDrive e2 paths", () => {
  const job = createIdriveLiteCodingJob({
    jobId: "job_001",
    projectId: "project_smejj",
    userId: "user_001",
    task: "Fix one small bug",
    createdAt: "2026-06-24T12:00:00Z"
  });

  assert.equal(job.status, "queued");
  assert.equal(job.phase, "created");
  assert.equal(job.model.id, "glm-5-2");
  assert.equal(job.model.runtime, "glm-5.2-storage-first");
  assert.deepEqual(job.model.engineCandidates, ["sglang", "vllm", "ktransformers"]);
  assert.equal(job.model.storageProvider, "idrive-e2");
  assert.equal(job.model.requiresChecksumBeforeRun, true);
  assert.equal(job.storage.provider, "idrive-e2");
  assert.match(job.taskCapsule.rootPrefix, /^jobs\/2026\/06\/24\/[a-f0-9]{2}\/job_001\/$/);
  assert.equal(job.taskCapsule.input, `${job.taskCapsule.rootPrefix}input.json`);
  assert.equal(job.taskCapsule.budget, `${job.taskCapsule.rootPrefix}budget.json`);
  assert.equal(job.taskCapsule.contextPlan, `${job.taskCapsule.rootPrefix}context-plan.json`);
  assert.equal(job.taskCapsule.repoPackManifest, `${job.taskCapsule.rootPrefix}repo-pack-manifest.json`);
  assert.equal(job.taskCapsule.selectedContext, `${job.taskCapsule.rootPrefix}selected-context.json`);
  assert.equal(job.taskCapsule.patch, `${job.taskCapsule.rootPrefix}patch.diff`);
  assert.equal(job.taskCapsule.verificationGates, `${job.taskCapsule.rootPrefix}verification-gates.json`);
  assert.equal(job.taskCapsule.eventsPrefix, `${job.taskCapsule.rootPrefix}events/`);
  assert.deepEqual(job.taskCapsule.events, [
    {
      seq: 1,
      type: "created",
      key: `${job.taskCapsule.rootPrefix}events/000001-created.json`,
      createdAt: "2026-06-24T12:00:00Z",
      modelId: "glm-5-2"
    }
  ]);
  assert.equal(job.storage.statusManifest, `${job.taskCapsule.rootPrefix}status.json`);
  assert.equal(job.storage.inputPrefix, `${job.taskCapsule.rootPrefix}input/`);
  assert.equal(job.storage.contextPrefix, `${job.taskCapsule.rootPrefix}context/`);
  assert.equal(job.storage.projectManifest, "projects/project_smejj/current-manifest.json");
  assert.equal(job.storage.searchIndex, "indexes/project_smejj/search-index.json");
  assert.equal(job.storage.memory.hot, "memory/hot-memory.json");
  assert.equal(job.storage.memory.knownFixes, "projects/project_smejj/solved-errors/");
  assert.equal(job.replay.replayable, true);
  assert.equal(job.replay.input, job.taskCapsule.input);
  assert.equal(job.serverLimits.ramGb, 64);
  assert.equal(job.serverLimits.keepLargeFilesLocal, false);
  assert.equal(job.serverLimits.deleteLocalCacheAfterJob, true);
  assert.equal(job.costPolicy.githubPaidAllowed, false);
  assert.equal(job.costPolicy.paidHostingAllowed, false);
});

test("GLM-5.2 storage-first jobs transition by IDrive manifest status", () => {
  const job = createIdriveLiteCodingJob({
    jobId: "job_002",
    projectId: "project_smejj",
    createdAt: "2026-06-24T12:00:00Z"
  });
  const running = transitionIdriveLiteJob(job, "running", "2026-06-18T00:00:00Z");

  assert.equal(running.status, "running");
  assert.equal(running.phase, "running");
  assert.equal(running.progress, 0.6);
  assert.equal(running.message, "Job running");
  assert.equal(running.updatedAt, "2026-06-18T00:00:00Z");
  assert.equal(running.storage.statusManifest, `${job.taskCapsule.rootPrefix}status.json`);
  assert.equal(running.taskCapsule.events.length, 2);
  assert.equal(running.taskCapsule.events[1].seq, 2);
  assert.equal(running.taskCapsule.events[1].type, "running");
  assert.equal(
    running.taskCapsule.events[1].key,
    `${job.taskCapsule.rootPrefix}events/000002-running.json`
  );
});

test("Kimi K2.7 jobs use the shared IDrive task-capsule contract", () => {
  const job = createIdriveLiteCodingJob({
    jobId: "job_kimi_001",
    projectId: "project_smejj",
    modelId: "kimi-k2-7",
    createdAt: "2026-07-10T02:00:00Z"
  });
  assert.equal(job.model.id, "kimi-k2-7");
  assert.equal(job.model.name, "Kimi K2.7");
  assert.equal(job.model.runtime, "kimi-k2.7-storage-first");
  assert.equal(job.model.contextTokens, 262_144);
  assert.deepEqual(job.model.engineCandidates, ["sglang", "vllm", "ktransformers"]);
  assert.equal(job.serverLimits.localCacheGb, 555);
  assert.equal(job.taskCapsule.events[0].modelId, "kimi-k2-7");
});

test("GLM-5.2 storage-first jobs reject unsafe ids", () => {
  assert.throws(
    () => createIdriveLiteCodingJob({ jobId: "../bad", projectId: "project_smejj" }),
    /relative safe id/
  );
});
