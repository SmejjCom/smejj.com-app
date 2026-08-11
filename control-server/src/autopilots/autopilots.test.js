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
  executeTaskOrchestrator
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
