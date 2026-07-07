import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GLM_5_2_FP8_STATUS, KIMI_K2_7_STATUS, ROUTES } from "../src/shared/platform.js";

const registry = JSON.parse(fs.readFileSync("idrive-layout/manifests/models/registry.json", "utf8"));
const providers = JSON.parse(fs.readFileSync("idrive-layout/manifests/providers/providers.json", "utf8"));

test("Kimi is disabled by default and not a free engine", () => {
  const kimi = registry.models.find((model) => model.id === "kimi-k2-7");
  assert.ok(kimi);
  assert.equal(kimi.storage.provider, "idrive-e2");
  assert.equal(kimi.inference.default, "disabled");
  assert.deepEqual(kimi.inference.allowedModes, ["byok", "partner-compute-later", "self-host-later"]);
  assert.ok(kimi.inference.notAllowedAsDefault.includes("workers-ai"));
  assert.ok(kimi.inference.notAllowedAsDefault.includes("browser-free-full-model"));
});

test("Kimi provider is not enabled by default", () => {
  const kimiProvider = providers.providers.find((provider) => provider.id === "kimi-k2-7-vault");
  assert.ok(kimiProvider);
  assert.equal(kimiProvider.enabledByDefault, false);
  assert.equal(kimiProvider.type, "model-vault");
  assert.notEqual(kimiProvider.type, "workers-ai");
});

test("GLM 5.2 FP8 is a storage-only long-context vault target", () => {
  const glm = registry.models.find((model) => model.id === "glm-5-2-fp8");
  assert.ok(glm);
  assert.equal(glm.source.repo, "zai-org/GLM-5.2-FP8");
  assert.equal(glm.storage.provider, "idrive-e2");
  assert.equal(glm.storage.prefix, "model-files/glm-5-2-fp8");
  assert.equal(glm.capabilities.contextTokens, 1000000);
  assert.equal(glm.inference.default, "disabled");
  assert.ok(glm.inference.notAllowedAsDefault.includes("workers-ai"));

  const glmProvider = providers.providers.find((provider) => provider.id === "glm-5-2-fp8-vault");
  assert.ok(glmProvider);
  assert.equal(glmProvider.enabledByDefault, false);
  assert.equal(glmProvider.type, "model-vault");
  assert.equal(glmProvider.fallback, "disabled");
  assert.equal(glmProvider.role, "flagship-coding-and-planning-brain");
  assert.equal(ROUTES.api.glmModelStatus, "/api/models/glm-5-2-fp8/status");
  assert.equal(ROUTES.api.modelsStatus, "/api/models/status");
  assert.equal(GLM_5_2_FP8_STATUS.sourceArchive.status, "verified-metadata-archived");
  assert.equal(GLM_5_2_FP8_STATUS.verification.status, "verified-complete");
  assert.equal(GLM_5_2_FP8_STATUS.verification.idriveObjectCount, 157);
  assert.equal(GLM_5_2_FP8_STATUS.inference.default, "disabled");
});

test("Kimi verified IDrive status is complete but inference stays disabled", () => {
  assert.equal(ROUTES.api.modelStatus, "/api/models/kimi-k2-7/status");
  assert.equal(KIMI_K2_7_STATUS.storage.provider, "idrive-e2");
  assert.equal(KIMI_K2_7_STATUS.storage.prefix, "model-files/kimi-k2-7/original/");
  assert.equal(KIMI_K2_7_STATUS.verification.status, "verified-complete");
  assert.equal(KIMI_K2_7_STATUS.verification.originalFileCount, 86);
  assert.equal(KIMI_K2_7_STATUS.verification.idriveObjectCount, 102);
  assert.equal(KIMI_K2_7_STATUS.verification.safetensorsCount, 64);
  assert.equal(KIMI_K2_7_STATUS.verification.safetensorsWithMatchingSha256, 64);
  assert.deepEqual(KIMI_K2_7_STATUS.verification.failures, []);
  assert.equal(KIMI_K2_7_STATUS.inference.default, "disabled");
  assert.equal(KIMI_K2_7_STATUS.inference.freeDefault, false);
  assert.equal(KIMI_K2_7_STATUS.security.publicModelFiles, false);
  assert.equal(KIMI_K2_7_STATUS.security.secretsInBrowser, false);
});

test("Kimi vault contains only small example files", () => {
  const files = [
    "idrive-layout/model-files/kimi-k2-7/README.md",
    "idrive-layout/model-files/kimi-k2-7/inventory.example.json",
    "idrive-layout/model-files/kimi-k2-7/checksums.example.json",
    "idrive-layout/model-files/kimi-k2-7/license/README.md",
    "idrive-layout/model-files/kimi-k2-7/notices/README.md"
  ];
  for (const file of files) {
    const stat = fs.statSync(file);
    assert.ok(stat.size < 50_000, `${file} should remain a small placeholder`);
  }
});
