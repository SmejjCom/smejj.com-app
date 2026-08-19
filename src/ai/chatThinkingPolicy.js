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

// Ab dieser Laenge der aktuellen Nutzernachricht darf eine Coding-Aufgabe voll
// denken. Dieselbe Schwelle wie im Auto-Router (public/ai/modellRouter.js).
export const DENK_KONTEXT_ZEICHEN = 4_000;

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
export function chatThinkingMode(messages, classifyProfile, env = process.env) {
  if (typeof classifyProfile !== "function") return undefined;
  const prompt = latestUserPrompt(messages);
  // Ohne erkennbare Nutzerfrage wird nichts umgestellt — fail-closed zugunsten
  // des bisherigen Verhaltens.
  if (!prompt) return undefined;
  if (classifyProfile(prompt) !== "coding") return THINKING_DISABLED;
  // Ab hier: Coding. Frueher hiess das immer "Voreinstellung des Modells", also
  // volles Denken — siehe die Denk-Bremse unten.
  if (denkBremseAus(env)) return undefined;
  return prompt.length >= DENK_KONTEXT_ZEICHEN ? undefined : THINKING_DISABLED;
}

/**
 * DIE DENK-BREMSE (gemessen 2026-08-18, Betreiber-Karte "Denk-Bremse bauen").
 *
 * Der Messschrieb eines Tages: 74 % der Kosten sind AUSGABE-Tokens, und 76 %
 * davon sind Denk-Tokens — zusammen **56 % der gesamten Rechnung** allein
 * fuers Nachdenken. Erzeugt wurde das von genau ACHT Coding-Anfragen (die
 * uebrigen 25 Chat-Anfragen denken dank dieser Datei schon lange nicht mehr).
 * Einzelne Faelle: 50 Eingabe-Tokens, 721 Denk-Tokens, rund 60 Tokens
 * sichtbare Antwort.
 *
 * Die Schwelle ist NICHT geraten, sondern die bereits abgenommene Regel des
 * Auto-Routers, dort mit 19 echten Testfaellen belegt: ein Denk-Wort wie
 * "Architektur" macht eine Aufgabe nicht schwer — nur echter Kontext-Umfang
 * tut das (minimax-m3 loeste 19/19, genauso fehlerfrei wie Opus 5 und
 * schneller). Uebertragen aufs Denken: eine kurze Coding-Frage rechtfertigt
 * keine 800 Token Nachdenken, eine Aufgabe mit angehaengten Dateien schon.
 * Dateien landen im Serverpfad IN der Nutzernachricht ("Dateien:\n--- …"),
 * darum genuegt deren Laenge als Mass.
 *
 * EHRLICH DAZU: Bewiesen ist die Schwelle fuer die MODELLWAHL, nicht fuer den
 * Denk-Schalter — das ist ein anderer Versuch. Wer sie pruefen will, misst
 * `npm run eval:models:live` mit und ohne Bremse gegen die Coding-Faelle.
 * Deshalb der Ausschalter: SMEJJ_DENKBREMSE=aus stellt exakt das alte
 * Verhalten wieder her (Coding denkt immer voll).
 */
export function denkBremseAus(env = process.env) {
  return String(env?.SMEJJ_DENKBREMSE || "").trim().toLowerCase() === "aus";
}

/**
 * Dieselbe Bremse fuer den Agenten-Weg, wo der Aufgabentyp schon feststeht und
 * angehaengte Dateien getrennt gezaehlt werden.
 *
 * Warum eigene Funktion und nicht chatThinkingMode: dort wird der Aufgabentyp
 * erst aus der Nutzerfrage erschlossen, hier ist er bereits bekannt. Wer beides
 * in eine Funktion presst, muss den Aufgabentyp zweimal raten.
 *
 * @param {{text?: string, dateien?: number}} lage Aufgabentext und Anzahl der Dateien.
 * @param {object} env Umgebung; SMEJJ_DENKBREMSE=aus stellt das alte Verhalten her.
 * @returns {undefined|{type: string}} undefined = volle Denktiefe des Modells.
 */
export function denkBremse(lage = {}, env = process.env) {
  if (denkBremseAus(env)) return undefined;
  // Angehaengte Dateien sind fuer sich schon echter Kontext-Umfang — genau die
  // Unterscheidung, die der Auto-Router mit 19 Testfaellen belegt hat.
  if (Number(lage.dateien || 0) > 0) return undefined;
  return String(lage.text || "").length >= DENK_KONTEXT_ZEICHEN ? undefined : THINKING_DISABLED;
}

// WAS DER BREMSE UEBERGEBEN WIRD — gemessen am 2026-08-18 im Live-Lauf:
// In src/server.js stand zuerst `userParts.join(...)`, also der ZUSAMMENGEBAUTE
// Text samt Websuche und Projektwissen. Damit reichte ein grosser RAG-Block, um
// eine Einzeiler-Frage ueber die Schwelle zu heben: 2.328 Eingabe-Tokens, davon
// 1.378 Denk-Tokens fuer "Erklaer mir kurz, was smejj.com macht" — das Gegenteil
// der Absicht. Massgeblich ist, was der NUTZER mitbringt: sein Auftrag und die
// Dateien, die er anhaengt. Nicht das, was der Server sich selbst dazugesucht hat.
//
// Dieselbe Regel gilt in BEIDEN Wegen (chatThinkingMode fuer /api/chat,
// denkBremse fuer /api/agent). Vorher entschieden sie verschieden, und genau
// solche Ungleichheit war hier schon einmal ein Fehler, kein Entwurf.
