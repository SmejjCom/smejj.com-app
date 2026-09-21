// smejj.com — Themen der Marktwache (Spur 2, Betreiber 21.09.2026:
// "eine zweite Spur greift Internet und recherchiert aktuelle Sachen,
// Konkurrenzen und so weiter").
//
// WARUM EINE EIGENE DATEI: Die Wissens-Ernte (Autopilot Nr. 23) hatte vier fest
// verdrahtete Technik-Themen. Markt, Preise und Wettbewerb kamen darin nicht
// vor — genau das, was der Betreiber sehen will. Die Liste steht hier, ist rein
// (kein I/O) und per Umgebungswert austauschbar, damit ein neues Thema keinen
// Code-Umbau braucht.
//
// GRENZE: Diese Themen fuehren zu einer WEBSUCHE, deren Funde in den
// Wissensspeicher gehen — nicht ins Training. Fremde Texte werden als kurzes
// Zitat mit Quelle abgelegt, nie als eigener Inhalt ausgegeben.

/** Markt und Wettbewerb zuerst: das ist der neue Teil (Spur 2). */
export const MARKT_THEMEN = Object.freeze([
  "KI-Assistenten Markt Neuigkeiten Anbieter Vergleich",
  "ChatGPT Gemini Claude Perplexity neue Funktionen diese Woche",
  "KI-Anbieter Preise API Kosten Aenderungen",
  "Open-Source Sprachmodelle neue Veroeffentlichungen Qwen Llama Mistral",
  "KI-Regeln Gesetze EU AI Act Google Play Apple App Store KI-Richtlinien"
]);

/** Technik-Themen der bisherigen Ernte — bleiben erhalten. */
export const TECHNIK_THEMEN = Object.freeze([
  "Trending JavaScript & TypeScript frameworks 2026",
  "Latest AI model architectures & LoRA fine-tuning papers",
  "Node.js & web standards API security advisories",
  "Cloud native distributed systems & serverless optimizations"
]);

export const STANDARD_THEMEN = Object.freeze([...MARKT_THEMEN, ...TECHNIK_THEMEN]);

/**
 * Die Themenliste. `SMEJJ_MARKT_THEMEN` (durch | getrennt) ersetzt die
 * Standardliste vollstaendig; ein leerer oder unbrauchbarer Wert wird ignoriert,
 * statt die Wache stumm zu schalten.
 */
export function themenListe(env = process.env) {
  const roh = String(env?.SMEJJ_MARKT_THEMEN || "").trim();
  if (!roh) return [...STANDARD_THEMEN];
  const eigene = roh.split("|").map((t) => t.trim()).filter((t) => t.length >= 8);
  return eigene.length ? eigene : [...STANDARD_THEMEN];
}

/**
 * Welches Thema ist dran? Reihum nach der Zahl der bisherigen Laeufe — nicht
 * gewuerfelt: eine zufaellige Wahl kann ein Thema tagelang wiederholen und ein
 * anderes nie treffen (Lehre aus Nr. 23).
 */
export function themaFuer(laufNummer, themen = STANDARD_THEMEN) {
  const liste = Array.isArray(themen) && themen.length ? themen : [...STANDARD_THEMEN];
  const index = Math.abs(Math.floor(Number(laufNummer) || 0)) % liste.length;
  return liste[index];
}
