import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_ROLE_REGISTRY,
  buildAgentSystemPrompt,
  getAgentRole
} from "../src/agent/roleRegistry.js";
import {
  buildTaskRoutingDecision,
  classifyTaskTier,
  localPromotionApproved
} from "../src/ai/taskRoutingPolicy.js";

test("agent role registry contains every required independent role and fail-closed contracts", () => {
  assert.deepEqual(Object.keys(AGENT_ROLE_REGISTRY), [
    "planner", "coding", "review", "test", "browser", "terminal", "git", "security"
  ]);
  assert.equal(getAgentRole("security").independentEvidenceRequired, true);
  assert.ok(Object.values(AGENT_ROLE_REGISTRY).every((role) => role.allowedTools.length > 0 && role.forbiddenActions.length > 0));
  const prompt = buildAgentSystemPrompt("coding");
  assert.match(prompt, /smejj\.com autonomous coding system/);
  assert.match(prompt, /Never deploy, merge, delete data or expand cost/);
  assert.throws(() => buildAgentSystemPrompt("unknown"), /unknown_agent_role/);
});

test("task tiers distinguish simple, normal, complex and critical work", () => {
  assert.equal(classifyTaskTier({ task: "Fixe einen Tippfehler in der Dokumentation", affectedFiles: 1 }), "simple");
  assert.equal(classifyTaskTier({ task: "Implementiere eine kleine JavaScript-Funktion", affectedFiles: 2 }), "normal");
  assert.equal(classifyTaskTier({ task: "Plane eine Multi-File-Architektur fuer iOS und Android", affectedFiles: 8 }), "complex");
  assert.equal(classifyTaskTier({ task: "Fuehre ein Production Live-Deploy mit Datenbankmigration durch" }), "critical");
  assert.equal(classifyTaskTier({ task: "Unklare Aufgabe", uncertainty: "high" }), "critical");
});

test("local smejj 1.0 receives simple tasks only after a strict benchmark promotion", () => {
  const benchmark = approvedBenchmark();
  const verifiedRuntime = {
    smejjReady: true,
    exactArtifactIdentityVerified: true,
    licenseArchiveVerified: true
  };
  assert.equal(localPromotionApproved(benchmark, verifiedRuntime), true);
  assert.equal(localPromotionApproved({ ...benchmark, securityFailures: 1 }, verifiedRuntime), false);
  assert.equal(localPromotionApproved({ ...benchmark, approvalSignatureVerified: false }, verifiedRuntime), false);
  assert.equal(localPromotionApproved(benchmark, { smejjReady: true }), false);

  const promoted = buildTaskRoutingDecision({
    task: "Fixe einen Tippfehler in der Dokumentation",
    affectedFiles: 1,
    runtime: { ...verifiedRuntime, glmReady: true, kimiReady: true },
    benchmark
  });
  assert.equal(promoted.primaryModelId, "smejj-1-0");
  assert.equal(promoted.fallbackModelId, "glm-5-2");
  assert.equal(promoted.automaticExecutionAllowed, true);

  const notPromoted = buildTaskRoutingDecision({
    task: "Fixe einen Tippfehler in der Dokumentation",
    affectedFiles: 1,
    runtime: { smejjReady: true, glmReady: true },
    benchmark: { ...benchmark, status: "candidate" }
  });
  assert.equal(notPromoted.primaryModelId, "glm-5-2");
});

test("normal tasks route to GLM, complex tasks to Kimi and critical work requires independent review", () => {
  const normal = buildTaskRoutingDecision({
    task: "Implementiere eine kleine JavaScript-Funktion",
    affectedFiles: 2,
    runtime: { glmReady: true, kimiReady: true }
  });
  assert.equal(normal.primaryModelId, "glm-5-2");
  assert.equal(normal.requiresSecondModelReview, false);

  const complex = buildTaskRoutingDecision({
    task: "Plane eine Multi-File-Architektur fuer Web und PWA",
    affectedFiles: 7,
    runtime: { glmReady: true, kimiReady: true }
  });
  assert.equal(complex.primaryModelId, "kimi-k2-7");
  assert.equal(complex.fallbackModelId, "glm-5-2");

  const critical = buildTaskRoutingDecision({
    task: "Pruefe die Security Policy vor einem Production Deploy",
    runtime: { glmReady: true, kimiReady: true }
  });
  assert.equal(critical.primaryModelId, "kimi-k2-7");
  assert.equal(critical.reviewerModelId, "glm-5-2");
  assert.equal(critical.requiresSecondModelReview, true);
  assert.equal(critical.automaticExecutionAllowed, false);
  assert.equal(critical.humanApprovalRequired, true);
});

test("critical work blocks when an independent reviewer is unavailable", () => {
  const decision = buildTaskRoutingDecision({
    task: "Production Deploy mit Auth-Aenderung",
    runtime: { glmReady: true, kimiReady: false }
  });
  assert.equal(decision.primaryModelId, "glm-5-2");
  assert.equal(decision.reviewerModelId, null);
  assert.ok(decision.blockedReasons.includes("independent_second_model_unavailable"));
});

function approvedBenchmark() {
  return {
    status: "approved",
    version: "smejj-1.0-alpha1",
    scope: ["simple"],
    artifactDigestSha256: "b".repeat(64),
    approvalEvidenceId: "benchmark-approval:smejj-1.0-alpha1",
    approvalSignatureVerified: true,
    safetyAtLeastIncumbent: true,
    successRateAtLeastIncumbent: true,
    nonRegressionFailures: 0,
    securityFailures: 0,
    datasetLeakageFailures: 0
  };
}
