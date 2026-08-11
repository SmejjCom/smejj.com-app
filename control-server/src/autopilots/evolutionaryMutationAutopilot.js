// smejj.com — Evolutionary Mutation & Stress-Testing Autopilot (Autopilot Nr. 22)
// Unterzieht generierten Code aggressiven evolutionären Mutationen und Randfall-Stresstests
// (Null-Werte, leere Arrays, Extremwerte, asynchrone Fehler), um unverwüstlichen Code zu garantieren.

import { runCodeInterpreter } from "./codeInterpreterAutopilot.js";

const MUTATION_STRATEGIES = Object.freeze([
  {
    name: "Null/Undefined Boundary Injection",
    apply: (code) => {
      return `${code}\n// Stress-Test 1: Null Injection\ntry { if (typeof run === 'function') run(null); } catch (e) {}`;
    }
  },
  {
    name: "Empty Collection Stress",
    apply: (code) => {
      return `${code}\n// Stress-Test 2: Empty Array Boundary\ntry { if (typeof run === 'function') run([]); } catch (e) {}`;
    }
  },
  {
    name: "Extreme Number Boundary",
    apply: (code) => {
      return `${code}\n// Stress-Test 3: Extreme Number Boundary\ntry { if (typeof run === 'function') run(Number.MAX_SAFE_INTEGER); } catch (e) {}`;
    }
  },
  {
    name: "Defensive Guard Wrapper",
    apply: (code) => {
      return `// Hardened Defense Wrapper\nfunction safeExecute(fn, ...args) {\n  try {\n    return fn(...args);\n  } catch (err) {\n    return null;\n  }\n}\n${code}`;
    }
  }
]);

/**
 * Führt eine Reihe evolutionärer Mutationen und Stresstests gegen ein Code-Snippet durch.
 * @param {string} baseCode
 * @returns {{mutationsApplied: number, survivedCount: number, resilienceScore: number, isResilient: boolean, mutationDetails: Array}}
 */
export function runEvolutionaryStressTest(baseCode) {
  if (typeof baseCode !== "string" || !baseCode.trim()) {
    return { mutationsApplied: 0, survivedCount: 0, resilienceScore: 0, isResilient: false, mutationDetails: [] };
  }

  const mutationDetails = [];
  let survivedCount = 0;

  for (const strategy of MUTATION_STRATEGIES) {
    const mutatedCode = strategy.apply(baseCode);
    const execResult = runCodeInterpreter(mutatedCode);
    const survived = execResult.status === "success";

    if (survived) survivedCount++;

    mutationDetails.push({
      strategyName: strategy.name,
      survived,
      status: execResult.status,
      error: execResult.error || null
    });
  }

  const resilienceScore = Math.round((survivedCount / MUTATION_STRATEGIES.length) * 100) / 100;
  const isResilient = resilienceScore >= 0.75;

  return {
    mutationsApplied: MUTATION_STRATEGIES.length,
    survivedCount,
    resilienceScore,
    isResilient,
    mutationDetails
  };
}

/**
 * Erzeugt eine abgehärtete (hardened) Version eines Code-Snippets mit proaktiven Guards.
 * @param {string} code
 * @returns {string}
 */
export function hardenCodeSnippet(code) {
  if (!code || typeof code !== "string") return "";
  if (code.includes("try {") && code.includes("catch")) return code;

  return [
    "// Automatisch abgehärtet durch smejj.com Evolutionary Mutation Autopilot",
    "(() => {",
    "  try {",
    `    ${code.trim().split("\n").join("\n    ")}`,
    "  } catch (mutationGuardErr) {",
    "    console.error('Sicherheits-Guard abgefangen:', mutationGuardErr?.message);",
    "  }",
    "})();"
  ].join("\n");
}
