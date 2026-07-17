import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMemoryEligibility } from "../control-server/src/jobs/memoryEligibility.js";

test("memory remains blocked without provider, privacy, repository and complete quality evidence", () => {
  const decision = evaluateMemoryEligibility({
    ok: true,
    memoryUpdate: { learn: true },
    verification: { ok: true, checks: [{ stage: "tests", required: true, ok: true }] },
    browser: { required: false, ok: true },
    diff: "diff",
    diffSha256: "a".repeat(64),
    rollback: { baseCommit: "abc" }
  });
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.includes("memory_provider_rights_not_cleared"));
  assert.ok(decision.reasons.includes("memory_quality_build_missing"));
});

test("memory is eligible only with complete independent evidence", () => {
  const decision = evaluateMemoryEligibility(fullyVerifiedMemoryOutcome());
  assert.deepEqual(decision, { eligible: true, reasons: [] });
});

export function fullyVerifiedMemoryOutcome() {
  return {
    ok: true,
    memoryUpdate: {
      learn: true,
      providerRightsCleared: true,
      providerRightsEvidenceId: "rights:memory-v1",
      privacySanitized: true,
      privacyEvidenceId: "privacy:memory-v1",
      repositoryRightsCleared: true,
      repositoryRightsEvidenceId: "repository:memory-v1"
    },
    verification: {
      ok: true,
      checks: [
        ...["build", "typecheck", "lint", "security", "repository-hygiene", "security-scan", "unit", "integration"]
          .map((stage) => ({ stage, required: true, ok: true }))
      ]
    },
    browser: { required: false, ok: true },
    diff: "diff --git a/a.js b/a.js\n",
    diffSha256: "a".repeat(64),
    rollback: { baseCommit: "abc" }
  };
}
