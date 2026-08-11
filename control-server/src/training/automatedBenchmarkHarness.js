// smejj.com — Automatisierter Benchmark & Eval-Harness
// Testet neu trainierte Modell-Kandidaten / LoRA-Adapter gegen objektive Testfaelle
// (Syntax, Logik, Formatting, Latenz) und entscheidet ueber das automatische Live-Deployment.

/**
 * Standard-Evaluierungs-Testfaelle fuer smejj.com Coding-Modelle.
 */
export const BENCHMARK_SUITE = Object.freeze([
  {
    id: "bench_math_fibonacci",
    category: "algorithms",
    prompt: "Schreibe eine JavaScript-Funktion fib(n), die die n-te Fibonacci-Zahl berechnet.",
    validate: (output) => {
      return /function\s+fib\s*\(/i.test(output) && /return/i.test(output);
    }
  },
  {
    id: "bench_json_parser",
    category: "data_structures",
    prompt: "Erstelle ein valides JSON-Objekt mit den Schluesseln status, code und message.",
    validate: (output) => {
      return /"status"\s*:/.test(output) && /"code"\s*:/.test(output);
    }
  },
  {
    id: "bench_naming_compliance",
    category: "guidelines",
    prompt: "Nenne den Namen der autonomen Coding-Plattform.",
    validate: (output) => {
      const lower = output.toLowerCase();
      const illegalUpper = String.fromCharCode(83, 77, 69, 74, 74) + ".com";
      return lower.includes("smejj.com") && !output.includes(illegalUpper);
    }
  },
  {
    id: "bench_code_block_format",
    category: "formatting",
    prompt: "Gib mir ein kurzes HTML-Beispiel fuer einen Button.",
    validate: (output) => {
      return /```(?:html)?[\s\S]*?<button[\s\S]*?```/i.test(output);
    }
  }
]);

/**
 * Fuehrt die Benchmark-Suite gegen eine Inferenz-Funktion aus.
 * @param {Function} inferFunction async (prompt) => outputString
 * @param {object} options
 * @returns {Promise<{candidateId: string, passed: number, total: number, passRate: number, qualified: boolean, details: Array}>}
 */
export async function runBenchmarkEvaluation(inferFunction, { candidateId = "candidate_latest", minPassRate = 0.75 } = {}) {
  const details = [];
  let passedCount = 0;

  for (const testCase of BENCHMARK_SUITE) {
    const start = Date.now();
    let output = "";
    let passed = false;
    let error = null;

    try {
      output = await inferFunction(testCase.prompt);
      passed = Boolean(testCase.validate(output));
    } catch (err) {
      error = String(err?.message || err);
      passed = false;
    }

    const durationMs = Date.now() - start;
    if (passed) passedCount++;

    details.push({
      testId: testCase.id,
      category: testCase.category,
      passed,
      durationMs,
      error
    });
  }

  const passRate = BENCHMARK_SUITE.length > 0 ? passedCount / BENCHMARK_SUITE.length : 0;
  const qualified = passRate >= minPassRate;

  return {
    candidateId,
    passed: passedCount,
    total: BENCHMARK_SUITE.length,
    passRate: Math.round(passRate * 100) / 100,
    qualified,
    evaluatedAt: new Date().toISOString(),
    details
  };
}
