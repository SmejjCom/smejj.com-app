import test from "node:test";
import assert from "node:assert/strict";
import { BOOTSTRAP_FILES, buildBootstrapManifest } from "../scripts/model-management/bootstrap_glm_idrive_brain.mjs";

test("GLM IDrive bootstrap maps required object brain files", () => {
  const manifest = buildBootstrapManifest({ createdAt: "2026-06-25T00:00:00Z" });
  assert.equal(manifest.storage.provider, "idrive-e2");
  assert.equal(manifest.policy.startsGpuCompute, false);
  assert.equal(manifest.policy.storesSecrets, false);
  assert.equal(manifest.policy.modelWeightsIncluded, false);
  assert.equal(manifest.entries.length, BOOTSTRAP_FILES.length);

  const keys = new Set(manifest.entries.map((entry) => entry.key));
  assert.ok(keys.has("models/glm-5-2/model-manifest.json"));
  assert.ok(keys.has("models/glm-5-2/shard-map.json"));
  assert.ok(keys.has("model-cache-manifests/glm-5-2/worker-cache-map.json"));
  assert.ok(keys.has("projects/smejj/current-manifest.json"));
  assert.ok(keys.has("workers/salad/salad-worker-preflight.json"));
});

test("GLM IDrive bootstrap contains only safe relative sources and keys", () => {
  const manifest = buildBootstrapManifest({ createdAt: "2026-06-25T00:00:00Z" });
  for (const entry of manifest.entries) {
    assert.equal(entry.source.startsWith("/"), false);
    assert.equal(entry.source.includes(".."), false);
    assert.equal(entry.key.startsWith("/"), false);
    assert.equal(entry.key.includes(".."), false);
    assert.doesNotMatch(entry.key, /secret|token|credential/i);
    assert.ok(entry.sha256.length >= 32);
  }
});
