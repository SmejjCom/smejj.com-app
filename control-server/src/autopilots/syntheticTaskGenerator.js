// smejj.com — Synthetischer Aufgaben-Generator (24/7 Self-Play Engine)
// Erzeugt kontinuierlich Coding- und Logik-Aufgaben, verifiziert sie in der Code-Sandbox
// und speichert bestandene Loesungen als DPO-Trainingspaare auf IDrive e2 S3.

import { runCodeInterpreter } from "./codeInterpreterAutopilot.js";
import { createDpoPair, saveDpoPair } from "./selfImprovementAutopilot.js";

const SYNTHETIC_TEMPLATES = Object.freeze([
  {
    topic: "Array Manipulation",
    generator: () => {
      const nums = Array.from({ length: 5 }, () => Math.floor(Math.random() * 50) + 1);
      const prompt = `Schreibe eine Funktion getEvenNumbers(arr), die nur die geraden Zahlen aus dem Array [${nums.join(", ")}] filtert.`;
      const solution = `function getEvenNumbers(arr) {\n  return arr.filter(n => n % 2 === 0);\n}\ngetEvenNumbers([${nums.join(", ")}]);`;
      const badSolution = `function getEvenNumbers(arr) {\n  return arr;\n}\ngetEvenNumbers([${nums.join(", ")}]);`;
      return { prompt, solution, badSolution, expectedType: "array" };
    }
  },
  {
    topic: "String Reversal",
    generator: () => {
      const words = ["smejj.com", "autopilot", "developer", "javascript", "intelligence"];
      const word = words[Math.floor(Math.random() * words.length)];
      const prompt = `Schreibe eine Funktion reverseString(str), die den String '${word}' umkehrt.`;
      const solution = `function reverseString(str) {\n  return str.split('').reverse().join('');\n}\nreverseString('${word}');`;
      const badSolution = `function reverseString(str) {\n  return str;\n}\nreverseString('${word}');`;
      return { prompt, solution, badSolution, expectedType: "string" };
    }
  },
  {
    topic: "Math Sum Calculation",
    generator: () => {
      const a = Math.floor(Math.random() * 100) + 1;
      const b = Math.floor(Math.random() * 100) + 1;
      const prompt = `Berechne die Summe der Zahlen ${a} und ${b} in einer Funktion calculateSum(a, b).`;
      const solution = `function calculateSum(a, b) {\n  return a + b;\n}\ncalculateSum(${a}, ${b});`;
      const badSolution = `function calculateSum(a, b) {\n  return a - b;\n}\ncalculateSum(${a}, ${b});`;
      return { prompt, solution, badSolution, expectedType: "number" };
    }
  }
]);

/**
 * Generiert eine einzelne synthetische Aufgabe und verifiziert sie.
 * @returns {object}
 */
export function generateAndVerifySyntheticTask() {
  const template = SYNTHETIC_TEMPLATES[Math.floor(Math.random() * SYNTHETIC_TEMPLATES.length)];
  const task = template.generator();

  // Ground-Truth Verifikation in der Code-Interpreter Sandbox
  const evalGood = runCodeInterpreter(task.solution);
  const evalBad = runCodeInterpreter(task.badSolution);

  const isValid = evalGood.status === "success" && evalGood.result !== undefined;

  return {
    topic: template.topic,
    prompt: task.prompt,
    chosen: `\`\`\`javascript\n${task.solution}\n\`\`\``,
    rejected: `\`\`\`javascript\n${task.badSolution}\n\`\`\``,
    verified: isValid,
    goodResult: evalGood.result,
    badResult: evalBad.result
  };
}

/**
 * Fuehrt einen 24/7 Synthetik-Generierungs-Lauf aus und persistiert DPO-Paare.
 * @param {number} count Anzahl zu generierender Aufgaben
 * @param {object} options
 * @returns {Promise<{ok: boolean, generated: number, saved: number}>}
 */
export async function runSyntheticGenerationBatch(count = 3, { env = process.env } = {}) {
  let savedCount = 0;

  for (let i = 0; i < count; i++) {
    const task = generateAndVerifySyntheticTask();
    if (task.verified) {
      const dpoPair = createDpoPair(task.prompt, task.chosen, task.rejected, {
        topic: task.topic,
        source: "synthetic_self_play",
        verifiedAt: new Date().toISOString()
      });
      const saveRes = await saveDpoPair(dpoPair, { env });
      if (saveRes.ok) savedCount++;
    }
  }

  return {
    ok: true,
    generated: count,
    saved: savedCount
  };
}
