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
  runProjectBugScan
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
