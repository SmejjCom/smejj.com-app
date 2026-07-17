import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTrainingValue } from "../src/training/sanitize.js";

test("lowercase opaque credentials and credential assignments are redacted outside hash fields", () => {
  const opaque = "lowercasecredential0123456789abcdefghijklmnop";
  const result = sanitizeTrainingValue({
    note: opaque,
    code: `const credential = "${opaque}";`,
    provenance: {
      baseCommit: "a".repeat(40),
      sha256: "b".repeat(64)
    }
  });
  const serialized = JSON.stringify(result.value);
  assert.equal(result.passed, true);
  assert.doesNotMatch(serialized, new RegExp(opaque));
  assert.equal(result.value.provenance.baseCommit, "a".repeat(40));
  assert.equal(result.value.provenance.sha256, "b".repeat(64));
  assert.ok(result.findings.some((finding) => finding.type === "opaque_lowercase_token"));
  assert.ok(result.findings.some((finding) => finding.type === "generic_secret"));
});
