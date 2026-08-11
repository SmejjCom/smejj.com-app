// smejj.com — Model-Arena & Smart-Router Autopilot
// Bewertet Prompts/Aufgaben und routet Anfragen an das optimale Spezialmodell
// (DeepSeek R1 fuer Logik/Mathe, Claude Sonnet/GPT-4o fuer Architektur, Gemini Flash fuer Geschwindigkeit).

/**
 * Klassifiziert eine Benutzeranfrage nach Domaene und Komplexitaet.
 * @param {string} prompt
 * @returns {object} { domain, complexity, suggestedModel, reasoning }
 */
export function routePrompt(prompt) {
  const text = String(prompt || "").trim().toLowerCase();

  // 1. Tiefe Logik / Mathematik / Algorithmen
  if (/mathe|mathematik|algorithmus|algorithm|komplexitaet|proof|beweis|deepseek|reasoning|formel|berechne/i.test(text)) {
    return {
      domain: "math_and_logic",
      complexity: "high",
      suggestedModel: "deepseek-r1",
      reasoning: "Mathematische & algorithmische Logikaufgabe: DeepSeek R1 Reasoning Modell empfohlen."
    };
  }

  // 2. Grosse Refactorings & Architektur
  if (/refactor|architektur|architecture|multi-file|migration|komponenten|schema|datenbank/i.test(text)) {
    return {
      domain: "system_architecture",
      complexity: "high",
      suggestedModel: "claude-3-5-sonnet",
      reasoning: "Systemarchitektur & Code-Refactoring: Claude 3.5 Sonnet empfohlen."
    };
  }

  // 3. Schnelle Recherche / Information / Zusammenfassung
  if (/suche|search|wetter|kurz|fasse zusammen|uebersicht|status|zeit/i.test(text)) {
    return {
      domain: "fast_lookup",
      complexity: "low",
      suggestedModel: "gemini-1-5-flash",
      reasoning: "Schnelle Informationsabfrage: Gemini 1.5 Flash fuer minimale Latenz."
    };
  }

  // 4. Frontend, UI & Styling
  if (/css|html|ui|ux|design|button|flexbox|grid|animation|modal|responsive/i.test(text)) {
    return {
      domain: "frontend_design",
      complexity: "medium",
      suggestedModel: "gpt-4o",
      reasoning: "Frontend & UI Design: GPT-4o / Claude fuer praezises Styling und HTML-Struktur."
    };
  }

  // Standard-Routing
  return {
    domain: "general_coding",
    complexity: "medium",
    suggestedModel: "smejj-hybrid-orchestrator",
    reasoning: "Allgemeine Coding-Aufgabe: smejj.com Standard Multi-Modell Routing."
  };
}

/**
 * Bewertet Modellergebnisse in einer Mini-Arena.
 * @param {Array<{model: string, output: string, durationMs: number}>} candidates
 * @returns {object} { winner, ranking }
 */
export function evaluateArenaCompetition(candidates = []) {
  if (!candidates.length) return { winner: null, ranking: [] };

  const scored = candidates.map((cand) => {
    let score = 50;
    const len = (cand.output || "").length;

    // Laengen- & Vollstaendigkeitsbewertung
    if (len > 50) score += 20;
    if (len > 300) score += 10;

    // Formatierungsbewertung
    if (/```[a-z]*\n[\s\S]*?\n```/.test(cand.output || "")) score += 15;

    // Geschwindigkeitsbonus (unter 2s)
    if (cand.durationMs && cand.durationMs < 2000) score += 10;

    return { ...cand, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    winner: scored[0]?.model || null,
    topScore: scored[0]?.score || 0,
    ranking: scored
  };
}
