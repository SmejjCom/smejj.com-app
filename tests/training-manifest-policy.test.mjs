import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateTrainingManifestSemantics } from "../scripts/validate-manifests.mjs";

const fixtures = Object.freeze({
  providerRights: readJson("idrive-layout/manifests/training/provider-rights.json"),
  legacyPolicy: readJson("idrive-layout/manifests/training/legacy-capsules-policy.json"),
  baseModelGate: readJson("idrive-layout/manifests/training/smejj-1-0-base-model-gate.json")
});

test("Phase 1 training manifests pass semantic fail-closed validation", () => {
  assert.deepEqual(validateTrainingManifestSemantics(cloneFixtures()), []);
});

test("provider API training cannot be enabled by a permissive ledger edit", () => {
  const manifests = cloneFixtures();
  const zai = manifests.providerRights.entries.find((entry) => entry.provider === "z.ai");
  zai.trainingUse = "allowed";
  zai.derivativeTrainingUse = "allowed";
  zai.permissionStatus = "verified";
  zai.permissionId = "unsigned-edit";
  zai.artifactRevision = "glm-5.2-api";

  const failures = validateTrainingManifestSemantics(manifests);
  assert.ok(failures.some((failure) => failure.includes("Z.ai API GLM-5.2")));
});

test("legacy Task Capsules cannot become automatic training data", () => {
  const manifests = cloneFixtures();
  manifests.legacyPolicy.automaticImportAllowed = true;
  manifests.legacyPolicy.promotionRequires = manifests.legacyPolicy.promotionRequires
    .filter((gate) => gate !== "pre-persistence-sanitization");

  const failures = validateTrainingManifestSemantics(manifests);
  assert.ok(failures.some((failure) => failure.includes("never be imported automatically")));
  assert.ok(failures.some((failure) => failure.includes("pre-persistence-sanitization")));
});

test("base-model training remains blocked without an exact approved artifact", () => {
  const manifests = cloneFixtures();
  manifests.baseModelGate.trainingAllowed = true;
  manifests.baseModelGate.requiredBeforeTraining = manifests.baseModelGate.requiredBeforeTraining
    .filter((gate) => gate !== "written-cost-budget-approved");

  const failures = validateTrainingManifestSemantics(manifests);
  assert.ok(failures.some((failure) => failure.includes("Phase 1 model training must remain disabled")));
  assert.ok(failures.some((failure) => failure.includes("written-cost-budget-approved")));
  assert.ok(failures.some((failure) => failure.includes("runtime identity or base-model rights")));
});

test("GLM-5.2 open weights cannot be allowed while the e2 artifact is unattested", () => {
  const manifests = cloneFixtures();
  const glm = manifests.providerRights.entries
    .find((entry) => entry.provider === "z.ai-open-weights");
  glm.trainingUse = "allowed";
  glm.derivativeTrainingUse = "allowed";

  const failures = validateTrainingManifestSemantics(manifests);
  assert.ok(failures.some((failure) => failure.includes("cannot be allowed before the base artifact identity is confirmed")));
});

test("the foundation family cannot silently drift away from GLM-5.2", () => {
  const manifests = cloneFixtures();
  manifests.baseModelGate.foundationFamily = "some-other-model";

  const failures = validateTrainingManifestSemantics(manifests);
  assert.ok(failures.some((failure) => failure.includes("foundation family must remain GLM-5.2")));
});

function cloneFixtures() {
  return structuredClone(fixtures);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
