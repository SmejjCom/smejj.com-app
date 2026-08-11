// smejj.com — Self-Healing & Prompt-Korrektur KI-Autopilot
// Prüft KI-Antworten laufend auf Fehler (Abbrüche, JSON-Fehler, Wiederholungen) und führt automatische Reparaturen aus.

export const SELF_HEALING_CONFIG = Object.freeze({
  maxFixAttempts: 2,
  minResponseLength: 10
});

export function inspectResponseHealth(response, expectedFormat = "text") {
  if (response === null || response === undefined) {
    return { healthy: false, reason: "Antwort ist null oder undefiniert" };
  }

  const text = typeof response === "string" ? response : String(response.text || response.content || "");

  if (!text.trim() || text.trim().length < SELF_HEALING_CONFIG.minResponseLength) {
    return { healthy: false, reason: "Antwort ist zu kurz oder leer" };
  }

  // Erkennung von hängengebliebenen Schleifen / Wiederholungen
  if (detectRepetitiveLoop(text)) {
    return { healthy: false, reason: "Erkannte Endlosschleife/Wiederholung in der Ausgabe" };
  }

  if (expectedFormat === "json") {
    try {
      JSON.parse(sanitizeJsonText(text));
    } catch (err) {
      return { healthy: false, reason: `Ungültiges JSON-Format: ${err.message}` };
    }
  }

  return { healthy: true, reason: "Antwort intakt" };
}

export function detectRepetitiveLoop(text) {
  if (!text || text.length < 50) return false;
  // Erkennt wiederholte Sequenzen ab 3 Zeichen (z.B. "ABC ABC ABC ABC")
  const repeatRegex = /(.{3,30}?)\1{3,}/s;
  return repeatRegex.test(text);
}

export function sanitizeJsonText(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

export function buildRepairPrompt(originalPrompt, rawResponse, healthReason) {
  return `Der vorherige Antwort-Versuch war fehlerhaft (${healthReason}).
Bitte korrigiere den Fehler und beantworte die ursprüngliche Anfrage erneut präzise und vollständig:

Ursprüngliche Anfrage:
${originalPrompt}

Vorherige unvollständige/fehlerhafte Antwort:
${rawResponse.slice(0, 500)}`;
}

export async function executeWithSelfHealing(invokerFn, prompt, options = {}) {
  const maxAttempts = options.maxAttempts || SELF_HEALING_CONFIG.maxFixAttempts;
  const expectedFormat = options.expectedFormat || "text";

  let currentPrompt = prompt;
  let lastResponse = null;
  let lastHealth = null;

  for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
    lastResponse = await invokerFn(currentPrompt);
    lastHealth = inspectResponseHealth(lastResponse, expectedFormat);

    if (lastHealth.healthy) {
      return {
        status: "success",
        attempts: attempt,
        repaired: attempt > 1,
        response: lastResponse
      };
    }

    if (attempt <= maxAttempts) {
      const rawText = typeof lastResponse === "string" ? lastResponse : String(lastResponse?.text || "");
      currentPrompt = buildRepairPrompt(prompt, rawText, lastHealth.reason);
    }
  }

  return {
    status: "failed",
    attempts: maxAttempts + 1,
    reason: lastHealth.reason,
    lastResponse
  };
}
