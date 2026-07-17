import assert from "node:assert/strict";
import test from "node:test";
import { trainingFamilyFingerprint } from "../src/training/split.js";

const KEY = Buffer.alloc(32, 31);

test("family grouping keeps near-duplicate tasks and patches in one split family", () => {
  const first = candidate({
    task: "Fix the authorized parser bug",
    diffSha256: "a".repeat(64)
  });
  const rewordedNearDuplicate = candidate({
    task: "Repair that parser defect safely with an extra assertion",
    diffSha256: "b".repeat(64)
  });
  assert.equal(
    trainingFamilyFingerprint(first, KEY),
    trainingFamilyFingerprint(rewordedNearDuplicate, KEY)
  );
});

test("family grouping separates a different signed repository scope", () => {
  const first = candidate({ affectedPaths: ["src/parser.js"] });
  const distinctScope = candidate({ affectedPaths: ["src/renderer.js"] });
  assert.notEqual(
    trainingFamilyFingerprint(first, KEY),
    trainingFamilyFingerprint(distinctScope, KEY)
  );
});

function candidate({ task = "Fix a bug", diffSha256 = "a".repeat(64), affectedPaths = ["src/parser.js"] } = {}) {
  return {
    domain: "coding",
    payload: { task },
    verificationEvidence: { diffSha256 },
    provenance: {
      repositoryFingerprint: "repository-fingerprint-v1",
      baseCommit: "1".repeat(40),
      affectedPaths
    }
  };
}
