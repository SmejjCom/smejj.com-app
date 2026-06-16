import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

