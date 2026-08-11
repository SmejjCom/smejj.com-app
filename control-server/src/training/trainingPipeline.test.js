// smejj.com — Unit-Tests fuer DPO Dataset Pipeline & Automated Benchmark Harness
import test from "node:test";
import assert from "node:assert/strict";

import { formatDpoJsonlRecord, compileTrainingBatch } from "./dpoDatasetPipeline.js";
import { runBenchmarkEvaluation, BENCHMARK_SUITE } from "./automatedBenchmarkHarness.js";

test("DPO Dataset Format Test", () => {
  const raw = {
    id: "dpo_123",
    prompt: "Schreibe Code",
    chosen: "function test() { return true; }",
    rejected: "bad code",
    context: { chosenScore: 90, rejectedScore: 30 }
  };

  const formatted = formatDpoJsonlRecord(raw);
  assert.equal(formatted.id, "dpo_123");
  assert.equal(formatted.prompt.length, 2);
  assert.equal(formatted.chosen[0].content, "function test() { return true; }");
  assert.equal(formatted.rejected[0].content, "bad code");
  assert.equal(formatted.metadata.scoreGap, 60);
});

test("Automated Benchmark Harness Evaluation Test", async () => {
  // Mock Modell-Inferenz, die alle Tests korrekt beantwortet
  const mockPerfectModel = async (prompt) => {
    if (prompt.includes("Fibonacci")) return "```javascript\nfunction fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }\n```";
    if (prompt.includes("JSON")) return '{"status": "ok", "code": 200, "message": "success"}';
    if (prompt.includes("Plattform")) return "Die Plattform heisst smejj.com.";
    if (prompt.includes("HTML")) return "```html\n<button type=\"button\">Klick mich</button>\n```";
    return "Standard-Antwort";
  };

  const result = await runBenchmarkEvaluation(mockPerfectModel, { candidateId: "lora_v1_test" });
  assert.equal(result.candidateId, "lora_v1_test");
  assert.equal(result.total, BENCHMARK_SUITE.length);
  assert.equal(result.passed, BENCHMARK_SUITE.length);
  assert.equal(result.passRate, 1.0);
  assert.equal(result.qualified, true);

  // Mock Modell, das Fehler macht
  const mockFailingModel = async () => "Kaputte Antwort ohne Code";
  const failingResult = await runBenchmarkEvaluation(mockFailingModel, { candidateId: "lora_failing" });
  assert.equal(failingResult.qualified, false);
  assert.ok(failingResult.passRate < 0.5);
});
