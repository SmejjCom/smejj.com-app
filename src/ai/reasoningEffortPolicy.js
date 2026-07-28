// smejj.com — Wie tief Kimi K3 im Chat denken darf.
//
// Schwestermodul zu chatThinkingPolicy.js. Gleiche Frage, anderer Anbieter:
// GLM laesst sich das Denken abschalten (thinking: disabled), K3 nicht — bei K3
// laesst sich nur die TIEFE steuern (reasoning_effort: low | high | max,
// Standard max).
//
// Hintergrund (gemessen am 2026-07-28 ueber die Bruecke, Modell kimi-k3,
// 5 Laeufe, reasoning_effort auf dem Standardwert max):
//   erstes sichtbares Zeichen  Median 11 982 ms, p95 17 661 ms
// Zum Vergleich derselbe Weg mit glm-5.2: 16 638 ms. K3 war also schon vorher
// schneller als das Fundament — aber beide liegen weit ueber dem Budget von
// 1,0 s aus den Last- und Performance-Zielen. Das Budget erreicht heute nur die
// Groq-Schnellspur (703 ms); Deep-Lane-Modelle sind eine andere Kategorie.
//
// Regel: Coding behaelt die volle Denktiefe — dort zaehlt Antwortguete mehr als
// Wartezeit, und genau dafuer waehlt jemand K3 aus. Alles andere bekommt "low".
//
// Bewusst eng gefasst: entschieden wird ausschliesslich die Denktiefe. Modellwahl
// und Routing-Profil bleiben unveraendert (Non-Regression).

/** Erlaubte Werte der Kimi-Schnittstelle. */
export const REASONING_EFFORT_LOW = "low";
export const REASONING_EFFORT_HIGH = "high";
export const REASONING_EFFORT_MAX = "max";

/**
 * Letzte Nutzerfrage aus einer Nachrichtenliste.
 * Bewusst identisch zur Regel in chatThinkingPolicy.js: massgeblich ist, was der
 * Nutzer gerade will, nicht der gesamte Verlauf.
 * @param {Array<{role?: string, content?: string}>} messages
 * @returns {string}
 */
export function latestUserPrompt(messages) {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (content) return content;
  }
  return "";
}

/**
 * Liefert die Denktiefe fuer eine Chat-Anfrage an Kimi K3.
 *
 * @param {Array} messages Nachrichtenliste der Anfrage.
 * @param {(task: string) => string} classifyProfile Profilklassifikation des Routers.
 * @param {object} env Umgebung; SMEJJ_LLM_KIMI_K3_REASONING_EFFORT uebersteuert fest.
 * @returns {undefined|"low"|"high"|"max"} undefined bedeutet: Voreinstellung des Modells behalten.
 */
export function chatReasoningEffort(messages, classifyProfile, env = process.env) {
  const feste = String(env?.SMEJJ_LLM_KIMI_K3_REASONING_EFFORT || "").trim().toLowerCase();
  if (feste === REASONING_EFFORT_LOW || feste === REASONING_EFFORT_HIGH || feste === REASONING_EFFORT_MAX) {
    return feste;
  }
  if (typeof classifyProfile !== "function") return undefined;
  const prompt = latestUserPrompt(messages);
  // Ohne erkennbare Nutzerfrage wird nichts umgestellt — fail-closed zugunsten
  // des bisherigen Verhaltens.
  if (!prompt) return undefined;
  const profil = classifyProfile(prompt);
  // Coding und ausdrueckliches Reasoning behalten die volle Tiefe.
  if (profil === "coding" || profil === "reasoning") return undefined;
  return REASONING_EFFORT_LOW;
}
