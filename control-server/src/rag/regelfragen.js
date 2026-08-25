// smejj.com — Fragen nach den eigenen REGELN erkennen und die Suche mit dem
// Vokabular des zustaendigen Regeldokuments anreichern.
//
// Dasselbe Verfahren wie infrastrukturFrage.js, nur fuer weitere Fragearten.
// Warum genau dieses Verfahren und kein anderes — gemessen am 2026-08-05:
//
// DIE SCHWELLE BLEIBT UNANGETASTET. Eine allgemeine Senkung von 20 auf 12 wurde
// gebaut und wieder zurueckgenommen: sie brachte +0,5 Punkte (im Rauschband von
// 1,7) und versorgte dabei die Halluzinationsfaelle mit Kontext. "Wie viele
// aktive Nutzerkonten hat smejj.com heute?" bekam bei 12 einen Auszug aus
// FREE_ONLY_MASTER_POLICY :: Skalierungsregel (Punktzahl 13,3) — ein
// autoritaetsstark aussehender, voellig unzustaendiger Text. tests/
// rag-infrastruktur.test.mjs haelt genau das fest, und der Waechter hat recht.
//
// WAS STATTDESSEN DER ENGPASS IST. Die Deckenmessung ueber 295 Faelle zeigte:
// BM25 findet OHNE Tor 75 % der beantwortbaren Faelle, MIT Tor bei 20 nur 27 %.
// Das Ranking ist nicht kaputt — die Punktzahl ist eine SUMME ueber die
// Fragewoerter, und kurze Fragen erreichen 20 nie. Vier Ranking-Ansaetze
// (Quellen-Gewichte, Nachsortierer, Begriffserweiterung, Einbettungsmodell)
// wurden gemessen und blieben allesamt wirkungslos.
//
// DIE ANREICHERUNG LOEST GENAU DAS. Eine erkannte Frage wird um die NAMEN und
// ROLLENBEZEICHNUNGEN ihres Regeldokuments ergaenzt. Die Punktzahl steigt aus
// eigener Kraft ueber die unveraenderte Schwelle, und der beste Treffer ist dann
// das zustaendige Dokument statt einer Zufallspassage.
//
// WAS DIE SUCHWORTE NICHT ENTHALTEN duerfen: Wertungen, Zahlen, Ja/Nein. Sonst
// legte die Anreicherung dem Modell eine Antwort in den Mund, statt nur den
// richtigen Abschnitt zu finden. Die Antwort kommt weiterhin aus dem Dokument.
// Ein Test haelt das fest.

// Die Befehlssperre kommt aus infrastrukturFrage.js — GETEILT, nicht kopiert.
// Sie ist sicherheitskritisch ("Loesche bitte alle alten Dateien im
// Objektspeicher" traegt Regelvokabular, ist aber eine Handlungsaufforderung und
// verschlechterte sich am 2026-08-01 mit Kontext von 67 % auf 33 %). Zwei Kopien
// derselben Regel driften auseinander, und zwar unbemerkt.
import { BEFEHLSFORM } from "./infrastrukturFrage.js";

/**
 * Fragewoerter dieser Klassen. Bewusst BREITER als bei der Infrastrukturfrage:
 * Regelfragen beginnen typisch mit einer Modalform ("Duerfen wir …?",
 * "Muss dafuer …?") statt mit einem klassischen Fragewort.
 */
const REGEL_FRAGEWORT = /\b(darf|duerfen|dürfen|muss|müssen|muessen|soll|sollen|braucht|brauchen|ist|sind|wann|wie|was|welche[rsnm]?|wer|warum|weshalb|wo|womit)\b/i;

/**
 * Die Regelklassen. Aufnahmekriterium ist eine BAUARTAUSSAGE ueber das
 * Repository, ausdruecklich NICHT die Eval-Suite: aufgenommen wird eine Klasse
 * nur, wenn MASTER_PROMPT.md, AI_Guidelines.md oder AGENTS.md fuer sie ein
 * verbindliches Dokument benennen. Waere die Auswahl aus den Eval-Ergebnissen
 * abgeleitet, wuerde die Suite sich selbst bestaetigen.
 */
export const REGELKLASSEN = Object.freeze([
  {
    id: "schutz",
    // Traegerdokumente: AGENTS.md (Change-Lock), MASTER_PROMPT.md (Rote Liste),
    // docs/frontend/START_DESIGN_LOCK.md, docs/frontend/FAVICON_LOCK.md.
    begriff: /\b(lock[a-z]*|sperre[a-z]*|freigabe[a-z]*|freigeben|rote liste|rollback[a-z]*|regression[a-z]*|loeschen|löschen|ueberschreiben|überschreiben|rotieren|rotation|merge[a-z]*|mergen|force[- ]?push|branch[a-z]*|backup[a-z]*|favicon[a-z]*|startseite[a-z]*|design|verifiziert[a-z]*|rueckbau|rückbau|ausbauen|abschalten|deaktivieren)\b/i,
    suchworte: Object.freeze([
      "Change-Lock", "Design-Lock", "Favicon-Lock", "Zugangs-Lock", "Daten-Lock",
      "Rote", "Liste", "Freigabe", "schriftliche", "Betreiber",
      "Non-Regression", "Rollback", "verifizierte", "Funktionen"
    ])
  },
  {
    id: "trainingsdaten",
    // Traegerdokument: docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md,
    // vom MASTER_PROMPT ausdruecklich als verbindlich benannt.
    dokument: "SMEJJ_1_0_TRAINING_DATA_POLICY.md",
    begriff: /\b(trainingsdaten|training[a-z]*|distillation|capture|einwilligung[a-z]*|rechte[a-z]*|sanitization|korpus|datensatz|datensaetze|datensätze|task capsule[a-z]*|capsules)\b/i,
    suchworte: Object.freeze([
      "Trainingsdaten", "Policy", "Capture", "Sanitization", "Einwilligung",
      "Rechtepruefung", "Rechtefreigabe", "Distillation", "Fremdmodell",
      "immutable", "verschluesselt", "IDrive", "e2"
    ])
  },
  {
    id: "memory",
    // Traegerdokument: AI_Guidelines.md, Abschnitt "6. Memory System".
    dokument: "AI_Guidelines.md",
    begriff: /\b(memory|gedaechtnis|gedächtnis|memory_bank|erinner[a-z]*|lernen|lernt)\b/i,
    suchworte: Object.freeze([
      "Memory", "System", "validierte", "Ergebnisse", "Task", "Capsule",
      "Benchmarks", "Patterns", "Vermutungen", "Halluzinationen"
    ])
  },
  {
    id: "selbstbild",
    // Traegerdokument: Project_Goals.md (Mission) — vom MASTER_PROMPT als
    // Pflichtlektuere benannt; MASTER_PROMPT.md traegt dieselbe Projektdefinition.
    //
    // BEFUND (A-Z-Simulatorlauf 2026-08-26, live gemessen): "Was ist smejj.com?"
    // erreichte nackt 5,6 Punkte (Schwelle 20) — Platz 1 war eine MAIL-Doku —
    // und die Schnellspur halluzinierte "Plattform fuer intelligente
    // Immobilienbewertung". Mit dieser Anreicherung: 36,4, Platz 1
    // MASTER_PROMPT (Projektdefinition), Platz 2 Project_Goals#Mission.
    //
    // Der Begriff verlangt die IDENTITAETS-Frageform MIT smejj-/Plattform-Bezug
    // in einem: ein blosses "Worum geht es?" (ohne Bezug) kann sich auf ein
    // angehaengtes Dokument beziehen und bekommt bewusst KEINEN Kontext —
    // "kein Kontext ist besser als falscher Kontext". "Wie viele Nutzer hat
    // smejj.com?" (Halluzinationsfall) matcht nicht: "wie viele" ist keine
    // Identitaetsfrage. Steht als LETZTE Klasse: "Was ist das Memory-System
    // von smejj.com?" gehoert der memory-Klasse, nicht dem Selbstbild.
    dokument: "Project_Goals.md",
    begriff: /\b(?:was\s+(?:ist|kann|macht|bietet|bedeutet)|worum\s+geht\s+es\s+(?:bei|auf)|wof(?:ü|ue)r\s+(?:steht|ist)|wozu\s+dient)\s+(?:smejj[.a-z]*|diese[srm]?\s+(?:projekt|plattform|seite|app|website))\b|\bwer\s+(?:bist\s+du|seid\s+ihr)\b/i,
    suchworte: Object.freeze([
      "smejj.com", "Projekt", "Ziel", "Mission", "AI", "Autonomous",
      "Coding", "OS", "Plattform", "Modell", "Chat", "Assistent"
    ])
  }
]);

/**
 * Welche Regelklasse trifft auf die Frage zu?
 *
 * Drei Bedingungen, alle noetig — wortgleich zur Infrastrukturerkennung:
 *   1. keine Befehlsform,
 *   2. ein Begriff der Klasse kommt vor,
 *   3. es ist als Frage formuliert (Fragewort oder Fragezeichen).
 *
 * Bei mehreren Treffern gewinnt die ERSTE Klasse in REGELKLASSEN. Zwei
 * Vokabulare zu mischen waere schlechter als eines: die Anreicherung soll die
 * Suche auf EIN Dokument lenken, nicht auf zwei halbe.
 *
 * Pur und ohne I/O, damit die Regel testbar bleibt.
 *
 * @param {string} task Frage des Nutzers
 * @returns {{id: string, suchworte: readonly string[]}|null}
 */
export function erkenneRegelfrage(task) {
  const text = String(task || "").trim();
  if (!text) return null;
  if (BEFEHLSFORM.test(text)) return null;
  if (!REGEL_FRAGEWORT.test(text) && !text.includes("?")) return null;
  for (const klasse of REGELKLASSEN) {
    if (klasse.begriff.test(text)) return { id: klasse.id, suchworte: klasse.suchworte, dokument: klasse.dokument || null };
  }
  return null;
}

/**
 * Das ZUSTAENDIGE Regeldokument einer Frage — oder null.
 *
 * WARUM ES DAS GIBT (gemessen 2026-08-12): Auf die Frage "Sind Task Capsules
 * als Trainingsdaten nutzbar?" lieferte die Suche TRAININGSWEG, MASTER_PROMPT
 * und README; die zustaendige TRAINING_DATA_POLICY landete mit 37,18 auf
 * Platz 4, knapp hinter README (37,83). Bei einer Frage nach der REGEL ist
 * das der falsche Treffer — nicht weil das Ranking schlecht rechnet, sondern
 * weil Nachbardokumente dasselbe Vokabular tragen. Die Zustaendigkeit stand
 * bis dahin nur im Kommentar; jetzt steht sie im Code und ist benutzbar.
 *
 * Klassen ohne EIN eindeutiges Traegerdokument (z. B. "schutz": AGENTS.md,
 * MASTER_PROMPT.md und zwei Lock-Dokumente) liefern bewusst null — eine
 * erfundene Zustaendigkeit waere schlimmer als keine.
 */
export function zustaendigesDokument(task) {
  return erkenneRegelfrage(task)?.dokument || null;
}

/**
 * Reichert eine erkannte Regelfrage fuer die SUCHE an.
 *
 * Nur die Suchanfrage wird ergaenzt — der Prompt des Nutzers bleibt unberuehrt,
 * und der eingespeiste Kontext ist unveraendert der gefundene Abschnitt.
 * Jede andere Frage kommt unveraendert zurueck.
 *
 * @param {string} task Frage des Nutzers
 * @returns {string} angereicherte Suchanfrage oder die urspruengliche
 */
export function erweitereRegelfrage(task) {
  const text = String(task || "");
  const klasse = erkenneRegelfrage(text);
  if (!klasse) return text;
  return `${text} ${klasse.suchworte.join(" ")}`;
}
