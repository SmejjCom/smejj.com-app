import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWorkerPreflight } from "../src/jobs/workerPreflight.js";
import { GLM_5_2_FP8_STATUS, KIMI_K2_7_STATUS } from "../src/shared/platform.js";

test("GLM-5.2 planner-vault preflight preserves the verified storage path", () => {
  const result = evaluateWorkerPreflight({
    model: GLM_5_2_FP8_STATUS,
    liveStorage: { ok: true, objectCount: 149 },
    request: { mode: "planner-vault" }
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("glm_5_2_is_flagship_vault_until_larger_compute_is_approved"));
});

test("Kimi K2.7 full model is blocked when worker cache is undersized", () => {
  const result = evaluateWorkerPreflight({
    model: KIMI_K2_7_STATUS,
    liveStorage: { ok: true, objectCount: 86 },
    request: { mode: "full-model", gpuRequired: true },
    worker: { localCacheGb: 300, gpuCount: 1, gpuVramGb: 24 }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("model_larger_than_worker_cache"));
  assert.equal(result.nextAction, "use_fast_path_or_smaller_coding_model_until_larger_compute_is_approved");
});

// Bis 2026-09-06 erwartete dieser Test ok:true — Kimi galt als geprueft im Lager.
// Der e2-Ordner ist leer, also darf kein Worker mehr fuer dieses Modell starten.
// Dass hier vorher gruen stand, war kein Testfehler: der Test glaubte dem Status,
// und der Status war veraltet. Eine Pruefung ist nur so ehrlich wie ihre Quelle.
test("Kimi K2.7 planner path is refused while the e2 folder is empty", () => {
  const result = evaluateWorkerPreflight({
    model: KIMI_K2_7_STATUS,
    liveStorage: { ok: true, objectCount: 86 },
    request: { mode: "planner-vault" }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("model_not_verified_complete"));
});
