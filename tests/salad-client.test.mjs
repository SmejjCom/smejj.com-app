import test from "node:test";
import assert from "node:assert/strict";
import { buildSaladGlmWorkerPlan, getSaladConfig, saladCreateContainerGroup, saladStartContainerGroup } from "../src/jobs/index.js";

test("Salad config reports missing API settings without exposing secrets", () => {
  const config = getSaladConfig({});
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ["SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME", "SALAD_API_KEY"]);
  assert.equal(config.apiKey, "");
});

test("Salad GLM worker plan is autostart false and contains no IDrive secrets", () => {
  const env = {
    SALAD_API_KEY: "secret-key",
    SALAD_ORGANIZATION_NAME: "smejj-org",
    SALAD_PROJECT_NAME: "smejj-project",
    SALAD_CONTAINER_GROUP_NAME: "smejj-glm-worker",
    SALAD_GLM_WORKER_IMAGE: "registry.example/smejj-glm-worker:latest",
    SALAD_GPU_CLASS_IDS: "gpu-4090,gpu-3090",
    IDRIVE_E2_SECRET_KEY: "must-not-appear"
  };
  const plan = buildSaladGlmWorkerPlan({
    env,
    job: { id: "job_001", projectId: "project_smejj", taskCapsule: { rootPrefix: "jobs/2026/06/25/aa/job_001/" } }
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.autostart, false);
  assert.equal(plan.replicas, 0);
  assert.equal(plan.startsCompute, false);
  assert.equal(plan.secretsInPayload, false);
  assert.equal(plan.payload.display_name, "smejj.com GLM-5.2 Worker");
  assert.equal(JSON.stringify(plan.payload).includes("must-not-appear"), false);
  assert.deepEqual(plan.payload.container.resources.gpu_classes, ["gpu-4090", "gpu-3090"]);
});

test("Salad mutations require explicit confirmations", async () => {
  const env = {
    SALAD_API_KEY: "secret-key",
    SALAD_ORGANIZATION_NAME: "smejj-org",
    SALAD_PROJECT_NAME: "smejj-project",
    SALAD_GLM_WORKER_IMAGE: "registry.example/smejj-glm-worker:latest",
    SALAD_GPU_CLASS_IDS: "gpu-4090"
  };
  const create = await saladCreateContainerGroup({ env, plan: buildSaladGlmWorkerPlan({ env }) });
  assert.equal(create.ok, false);
  assert.equal(create.reason, "confirm_salad_create_required");

  const start = await saladStartContainerGroup(env);
  assert.equal(start.ok, false);
  assert.equal(start.reason, "confirm_salad_start_required");
});
