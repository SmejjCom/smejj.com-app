// smejj.com — Entscheidung, ob GLM im Chat sichtbar denken darf.
//
// Hintergrund (gemessen am 2026-07-28 gegen den Control Server, Modell glm-5.2):
//   /api/chat  (Denken an)  Antwortkopf 5 918 ms, erstes sichtbares Zeichen 12 106 ms
//   /api/agent (Denken aus) Antwortkopf 7 270 ms, erstes sichtbares Zeichen  7 270 ms
// Die Luecke von rund 6,2 Sekunden sind Denk-Abschnitte, die der Stream-Filter
// ohnehin verwirft. Der Nutzer wartet also auf Text, den er nie zu sehen bekommt.
//
// /api/agent schaltet das Denken fuer Nicht-Coding-Aufgaben seit dem 2026-07-27
// ab. /api/chat tat das bisher nicht — dieselbe, bereits verifizierte Regel fehlte
// dort schlicht. Dieses Modul haelt die Regel an genau einer Stelle fest.
//
// Bewusst eng gefasst: entschieden wird ausschliesslich der Denk-Modus. Die Wahl
// des Modells und des Routing-Profils bleibt unveraendert, damit die Aenderung
// keine bestehende Zuordnung verschiebt (Non-Regression).

/** Denk-Modus, den die Z.ai-Schnittstelle als Abschaltung versteht. */
export const THINKING_DISABLED = Object.freeze({ type: "disabled" });

/**
 * Letzte Nutzerfrage aus einer Nachrichtenliste.
 * Systemtexte und fruehere Antworten bleiben aussen vor: massgeblich ist, was der
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
 * Liefert den Denk-Modus fuer eine Chat-Anfrage.
 *
 * Coding-Aufgaben behalten das Qualitaets-Reasoning: dort ist die Antwortguete
 * wichtiger als die Wartezeit. Alles andere antwortet sofort.
 *
 * @param {Array} messages Nachrichtenliste der Anfrage.
 * @param {(task: string) => string} classifyProfile Profilklassifikation des Routers.
 * @returns {undefined|{type: string}} undefined bedeutet: Voreinstellung des Modells behalten.
 */
export function chatThinkingMode(messages, classifyProfile) {
  if (typeof classifyProfile !== "function") return undefined;
  const prompt = latestUserPrompt(messages);
  // Ohne erkennbare Nutzerfrage wird nichts umgestellt — fail-closed zugunsten
  // des bisherigen Verhaltens.
  if (!prompt) return undefined;
  return classifyProfile(prompt) === "coding" ? undefined : THINKING_DISABLED;
}
