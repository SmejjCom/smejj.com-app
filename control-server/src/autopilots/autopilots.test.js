// smejj.com — Unit-Tests für KI-Autopiloten
import test from "node:test";
import assert from "node:assert/strict";

import {
  generateResearchPlan,
  formatResearchReport,
  runDeepResearch,
  runCodeInterpreter,
  extractUserFacts,
  updateMemoryProfile,
  runMemoryAutopilot,
  inspectResponseHealth,
  detectRepetitiveLoop,
  sanitizeJsonText,
  buildRepairPrompt,
  executeWithSelfHealing,
  validateMultimodalInput,
  formatMultimodalPromptPayload,
  processAudioChunkStream,
  buildTaskGraph,
  executeTaskOrchestrator,
  evaluateResponseQuality,
  createDpoPair,
  runSelfImprovementCycle,
  extractCodeEntities,
  buildKnowledgeGraph,
  routePrompt,
  evaluateArenaCompetition,
  scanForBugsAndVulnerabilities,
  runProjectBugScan,
  generateAndVerifySyntheticTask,
  runSyntheticGenerationBatch,
  createInitialLifecycleState,
  evaluateShadowTrial,
  recordShadowTrial,
  checkAndPromoteCandidate,
  scrubPiiData,
  processUserFeedbackSignal,
  getUserFlywheelStats,
  decomposeReasoningSteps,
  evaluateStepReward,
  verifyReasoningTracePRM,
  distillOptimalReasoning,
  processDistillationRun,
  runEvolutionaryStressTest,
  hardenCodeSnippet
} from "./index.js";

test("Deep Research Autopilot Plan & Formatter Test", async () => {
  const plan = generateResearchPlan("Quantencomputing", 3);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].query, "Quantencomputing");

  const report = formatResearchReport("Quantencomputing", [
    { title: "Test Titel", snippet: "Test Snippet", url: "https://example.com" }
  ], ["https://example.com"]);

  assert.match(report, /# Deep Research Bericht: Quantencomputing/);
  assert.match(report, /Test Snippet/);
  assert.match(report, /https:\/\/example\.com/);
});

test("Code Interpreter Autopilot Sandbox Test", () => {
  const code = "const a = 10; const b = 20; console.log('Ergebnis:', a + b); a + b;";
  const res = runCodeInterpreter(code);

  assert.equal(res.status, "success");
  assert.equal(res.result, 30);
  assert.ok(res.logs.some(l => l.includes("Ergebnis: 30")));

  const badCode = "throw new Error('Test-Fehler in Sandbox');";
  const errRes = runCodeInterpreter(badCode);
  assert.equal(errRes.status, "error");
  assert.match(errRes.error, /Test-Fehler in Sandbox/);
});

test("Memory Autopilot Fakt-Extraktion Test", async () => {
  const messages = [
    { role: "user", content: "Hallo! Ich heiße Alexander und ich wohne in Berlin." }
  ];

  const facts = extractUserFacts(messages);
  assert.equal(facts.length, 2);
  assert.equal(facts.find(f => f.key === "name")?.value, "Alexander");
  assert.equal(facts.find(f => f.key === "location")?.value, "Berlin");

  const profile = await updateMemoryProfile("test-user-123", facts);
  assert.equal(profile.userId, "test-user-123");
  assert.ok(profile.memories.length >= 2);
});

test("Self-Healing Autopilot Inspektions- & Reparatur-Test", async () => {
  const healthy = inspectResponseHealth("Das ist eine vollständige und korrekte KI-Antwort.");
  assert.equal(healthy.healthy, true);

  const short = inspectResponseHealth("Kurz");
  assert.equal(short.healthy, false);

  const loopText = "ABC ".repeat(50);
  assert.equal(detectRepetitiveLoop(loopText), true);

  const jsonSanitized = sanitizeJsonText("```json\n{\"key\":\"val\"}\n```");
  assert.equal(jsonSanitized, "{\"key\":\"val\"}");

  const repairResult = await executeWithSelfHealing(
    async (p) => {
      if (p.includes("korrigiere")) {
        return "Hier ist die korrigierte, vollständige Antwort für den Nutzer.";
      }
      return "Kurz"; // Zu kurz -> schlägt beim ersten Mal fehl
    },
    "Erkläre KI.",
    { maxAttempts: 2 }
  );

  assert.equal(repairResult.status, "success");
  assert.equal(repairResult.attempts, 2);
  assert.equal(repairResult.repaired, true);
});

test("Multimodal Autopilot Payload Validation Test", () => {
  const validPayload = { text: "Beschreibe Bild", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
  const val = validateMultimodalInput(validPayload);
  assert.equal(val.valid, true);

  const formatted = formatMultimodalPromptPayload(validPayload);
  assert.equal(formatted.contents[0].parts.length, 2);

  const invalidMime = { mimeType: "video/invalid", data: "xyz" };
  assert.equal(validateMultimodalInput(invalidMime).valid, false);
});

test("Task Orchestrator Graph & Execution Test", async () => {
  const graph = buildTaskGraph("Erstelle eine Datenanalyse der Absätze");
  assert.equal(graph.tasks.length, 4);

  const exec = await executeTaskOrchestrator("Erstelle eine Datenanalyse der Absätze");
  assert.equal(exec.status, "success");
  assert.equal(exec.tasks.every(t => t.status === "completed"), true);
});

test("Self-Improvement & DPO Pair Test", async () => {
  const evalGood = evaluateResponseQuality("Schreibe eine Funktion", "```javascript\nfunction hallo() { return 'welt'; }\n```");
  assert.ok(evalGood.score >= 80);

  const evalBad = evaluateResponseQuality("Schreibe Code", "Kurz");
  assert.ok(evalBad.score < evalGood.score);

  const pair = createDpoPair("Prompt", "Gute Antwort", "Schlechte Antwort");
  assert.equal(pair.prompt, "Prompt");
  assert.equal(pair.chosen, "Gute Antwort");
  assert.equal(pair.rejected, "Schlechte Antwort");

  const cycle = await runSelfImprovementCycle([
    { prompt: "Schreibe Code", response: "```js\nconsole.log(1);\n```", alternatives: ["bad"] }
  ]);
  assert.equal(cycle.ok, true);
  assert.ok(cycle.analyzed >= 1);
});

test("Knowledge Graph Code Parsing Test", () => {
  const sampleCode = `
    import { foo } from "./foo.js";
    export function myFunc() { return 1; }
    export class MyClass {}
  `;
  const entities = extractCodeEntities("src/test.js", sampleCode);
  assert.equal(entities.functions.length, 1);
  assert.equal(entities.functions[0].name, "myFunc");
  assert.equal(entities.classes.length, 1);
  assert.equal(entities.classes[0].name, "MyClass");
  assert.equal(entities.imports.length, 1);

  const kg = buildKnowledgeGraph([{ path: "src/test.js", content: sampleCode }]);
  assert.equal(kg.totalFiles, 1);
  assert.ok(kg.findSymbol("myFunc") !== null);
  assert.ok(kg.search("my").length >= 2);
});

test("Smart Router & Arena Test", () => {
  const mathRoute = routePrompt("Berechne den mathematischen Beweis für den Algorithmus");
  assert.equal(mathRoute.domain, "math_and_logic");
  assert.equal(mathRoute.suggestedModel, "deepseek-r1");

  const archRoute = routePrompt("Refactore die Multi-File Architektur der Komponenten");
  assert.equal(archRoute.domain, "system_architecture");
  assert.equal(archRoute.suggestedModel, "claude-3-5-sonnet");

  const arena = evaluateArenaCompetition([
    { model: "model-a", output: "```js\nconst a = 1;\n``` Sehr lange und detaillierte Erklärung hier.", durationMs: 1200 },
    { model: "model-b", output: "Kurz", durationMs: 5000 }
  ]);
  assert.equal(arena.winner, "model-a");
});

test("Bug Predictor & Security Scan Test", () => {
  const cleanCode = "function sum(a, b) { return a + b; }";
  const cleanScan = scanForBugsAndVulnerabilities("clean.js", cleanCode);
  assert.equal(cleanScan.status, "clean");
  assert.equal(cleanScan.findingsCount, 0);

  const riskyCode = `
    eval("2 + 2");
    setInterval(() => {}, 1000);
    const url = "http://insecure-api.com";
  `;
  const riskyScan = scanForBugsAndVulnerabilities("risky.js", riskyCode);
  assert.ok(riskyScan.findingsCount >= 2);
  assert.ok(riskyScan.riskScore > 0);

  const projectScan = runProjectBugScan([
    { path: "clean.js", content: cleanCode },
    { path: "risky.js", content: riskyCode }
  ]);
  assert.equal(projectScan.scannedFiles, 2);
  assert.equal(projectScan.cleanFiles, 1);
});

test("Synthetic Task Generator & 24/7 Self-Play Test", async () => {
  const task = generateAndVerifySyntheticTask();
  assert.ok(task.topic);
  assert.ok(task.prompt);
  assert.equal(task.verified, true);
  assert.match(task.chosen, /```javascript/);

  const batch = await runSyntheticGenerationBatch(2);
  assert.equal(batch.ok, true);
  assert.equal(batch.generated, 2);
});

test("Shadow-Release & Model-Lifecycle Autopilot Test", async () => {
  const state = createInitialLifecycleState();
  assert.equal(state.activeLiveModel.version, "smejj 1.0");
  assert.equal(state.shadowBetaModel.version, "smejj 1.1-beta");
  assert.equal(state.nextTrainingTarget.version, "smejj 2.0-training");

  // Shadow Trial
  const trial = evaluateShadowTrial(
    "Schreibe Code",
    "Kurz",
    "```javascript\nfunction test() { return true; }\n```",
    1200,
    600
  );
  assert.equal(trial.winner, "shadow");

  for (let i = 0; i < 6; i++) {
    recordShadowTrial(state, trial);
  }
  assert.equal(state.shadowBetaModel.shadowTrials, 6);
  assert.equal(state.shadowBetaModel.winRate, 1.0);

  // Promotion
  const mockInfer = async (prompt) => {
    if (prompt.includes("Fibonacci")) return "```javascript\nfunction fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }\n```";
    if (prompt.includes("JSON")) return '{"status": "ok", "code": 200, "message": "success"}';
    if (prompt.includes("Plattform")) return "Die Plattform heisst smejj.com.";
    if (prompt.includes("HTML")) return "```html\n<button type=\"button\">Klick mich</button>\n```";
    return "Standard";
  };
  const promo = await checkAndPromoteCandidate(state, mockInfer);
  assert.equal(promo.promoted, true);
  assert.equal(promo.newState.activeLiveModel.version, "smejj 1.1");
  assert.equal(promo.newState.shadowBetaModel.version, "smejj 1.2-beta");
});

test("User-Feedback Flywheel & PII Scrubbing Test", async () => {
  const fakeKey = ["s", "k-test1234567890123456"].join("");
  const dirtyText = `Mein Name ist Max, E-Mail: max@smejj.com, Key: ${fakeKey}, IP: 192.168.1.1`;
  const cleanText = scrubPiiData(dirtyText);
  assert.ok(!cleanText.includes("max@smejj.com"));
  assert.ok(!cleanText.includes(fakeKey));
  assert.ok(!cleanText.includes("192.168.1.1"));
  assert.ok(cleanText.includes("[EMAIL_MASKED]"));
  assert.ok(cleanText.includes("[KEY_MASKED]"));
  assert.ok(cleanText.includes("[IP_MASKED]"));

  const feedbackRes = await processUserFeedbackSignal({
    prompt: "Schreibe eine Funktion",
    chosenResponse: "function test() { return true; }",
    rejectedResponse: "bad code",
    signalType: "copy"
  });
  assert.equal(feedbackRes.ok, true);
  assert.equal(feedbackRes.processed, true);

  const stats = await getUserFlywheelStats();
  assert.equal(stats.status, "active_24_7_flywheel");
  assert.equal(stats.piiScrubbingActive, true);
});

test("Process-Reward (PRM) & Step-by-Step Reasoner Test", () => {
  const reasoning = `
    Schritt 1: Wir analysieren das Problem und definieren die Invariante.
    Schritt 2: Wir schreiben die Funktion.
    \`\`\`javascript
    function calculate(x) { return x * 2; }
    \`\`\`
    Schritt 3: Daher ist das Ergebnis stets das Doppelte der Eingabe.
  `;
  const steps = decomposeReasoningSteps(reasoning);
  assert.equal(steps.length, 3);
  assert.equal(steps[0].type, "logic");
  assert.equal(steps[1].type, "code");
  assert.equal(steps[2].type, "conclusion");

  const prmResult = verifyReasoningTracePRM(reasoning);
  assert.equal(prmResult.valid, true);
  assert.ok(prmResult.overallScore >= 0.60);
  assert.equal(prmResult.prunedAtStep, null);
});

test("Cross-Model Knowledge Distiller Test", async () => {
  const prompt = "Schreibe eine Funktion isEven(n)";
  const candidates = [
    { model: "deepseek-r1", reasoning: "Schritt 1: Prüfe Modulo 2", code: "function isEven(n) { return n % 2 === 0; }" },
    { model: "weak-model", reasoning: "Kurz", code: "bad syntax ((" }
  ];

  const distilled = distillOptimalReasoning(prompt, candidates);
  assert.equal(distilled.winnerModel, "deepseek-r1");
  assert.equal(distilled.isSound, true);
  assert.ok(distilled.distilledReasoning.includes("isEven"));

  const runRes = await processDistillationRun(prompt, candidates);
  assert.equal(runRes.ok, true);
});

test("Evolutionary Mutation & Stress-Testing Test", () => {
  const code = "function run(data) { return data ? data.length : 0; }";
  const stressRes = runEvolutionaryStressTest(code);
  assert.equal(stressRes.mutationsApplied, 4);
  assert.ok(stressRes.survivedCount >= 3);
  assert.equal(stressRes.isResilient, true);

  const hardened = hardenCodeSnippet(code);
  assert.ok(hardened.includes("try {"));
  assert.ok(hardened.includes("catch"));
});




