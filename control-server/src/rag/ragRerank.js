// smejj.com — Nachsortierer (Reranker) fuer die RAG-Treffer.
//
// Warum es dieses Modul gibt (gemessen am 2026-08-04, 295 Faelle):
// BM25 kennt Wortdeckung, aber keinen Themenbezug. Gemessen zog die Frage
// "Sind Task Capsules als Trainingsdaten nutzbar?" den Abschnitt
// "7. Kosten-Guardrails"; die zustaendige Trainingsdaten-Policy lag auf Platz 5.
// Die Frage nach dem Change-Lock zog die "Skalierungsregel", der Change-Lock
// selbst lag auf Platz 3. Der Versuch, das ueber Quellen-Gewichte zu heilen,
// wurde gemessen und verworfen: Autoritaet mischt nur um, WELCHES themenfremde
// Dokument gewinnt.
//
// Dieses Modul geht den anderen Weg: BM25 liefert ein groesseres Becken, und ein
// kurzer Modellaufruf waehlt daraus die Passage, die die Frage wirklich
// beantwortet — oder keine. Beide Ausgaenge sind der Zweck:
//   1) die richtige Quelle nach vorn holen,
//   2) falschen Kontext ABLEHNEN statt ihn einzuspeisen.
//
// Der Modellaufruf wird injiziert. Ohne ihn tut dieses Modul nichts — es gibt
// keinen versteckten Netzzugriff und die Auswahllogik ist ohne Netz testbar.
import { searchIndex } from "./bm25Index.js";
import { rankHits } from "./ragRanking.js";
import { erweitereInfrastrukturfrage } from "./infrastrukturFrage.js";
import { RAW_HIT_POOL } from "./ragContextBlock.js";

/** Wie viele Treffer dem Nachsortierer vorgelegt werden. */
export const NACHSORTIER_BECKEN = 10;

/** Zeichen je Passage im Auswahl-Prompt. Genug zum Erkennen, kurz genug fuer Tempo. */
export const PASSAGE_ZEICHEN = 400;

/** Token fuer die Antwort. Es wird nur eine Zahl erwartet. */
export const ANTWORT_TOKEN = 60;

/** Warum ein Ergebnis so aussieht, wie es aussieht — steht im Bericht. */
export const GRUND = Object.freeze({
  GEWAEHLT: "gewaehlt",
  BESTAETIGT: "bestaetigt",
  ABGELEHNT: "abgelehnt",
  KEIN_BECKEN: "kein_becken",
  FEHLER: "fehler"
});

/**
 * Baut das Trefferbecken fuer die Nachsortierung.
 *
 * Unterschied zur normalen Suche: die Relevanzschwelle (minTopScore) bleibt
 * unveraendert — sie ist der Torwaechter und entscheidet, ob die Frage ueberhaupt
 * durch Projektwissen gedeckt ist. Der Verduennungsfilter (minRelativeScore)
 * faellt dagegen weg: er existiert, damit hinter einem guten Treffer nicht zwei
 * schwache den Prompt verwaessern. Genau diese Aufgabe uebernimmt jetzt der
 * Nachsortierer, der ohnehin nur EINE Passage auswaehlt. Bliebe der Filter
 * bestehen, waeren die gemessenen Treffer auf Platz 5 und 7 gar nicht erst im
 * Becken — und der Nachsortierer koennte nur bestaetigen, was BM25 schon meinte.
 */
export function beckenFuerNachsortierung(index, frage, { minTopScore } = {}) {
  return rankHits(searchIndex(index, erweitereInfrastrukturfrage(String(frage || "")), RAW_HIT_POOL), {
    limit: NACHSORTIER_BECKEN,
    minRelativeScore: 0,
    ...(Number.isFinite(minTopScore) ? { minTopScore } : {})
  });
}

/**
 * Formt die Auswahlfrage an das Modell.
 * Bewusst knapp und ohne Spielraum: es wird eine Zahl erwartet, nichts sonst.
 */
export function baueAuswahlPrompt(frage, kandidaten) {
  const liste = kandidaten.map((treffer, index) => {
    const kopf = `[${index + 1}] ${treffer.source}${treffer.heading ? ` :: ${treffer.heading}` : ""}`;
    const text = String(treffer.snippet || treffer.text || "").slice(0, PASSAGE_ZEICHEN);
    return `${kopf}\n${text}`;
  }).join("\n\n");
  return [
    `Frage: ${frage}`,
    "",
    "Passagen:",
    liste,
    "",
    "Welche Passage beantwortet die Frage am ehesten? Antworte NUR mit der Nummer.",
    "Beantwortet KEINE der Passagen die Frage, antworte 0."
  ].join("\n");
}

/**
 * Liest die Wahl aus der Modellantwort.
 * @returns {number|null} 0 = keine passt; 1..anzahl = Treffer; null = unlesbar
 *
 * Unlesbar ist NICHT dasselbe wie 0: bei 0 hat das Modell entschieden, bei null
 * hat es nicht geantwortet. Das eine ist ein Ergebnis, das andere ein Ausfall —
 * und sie fuehren zu verschiedenen Rueckfallebenen.
 */
export function leseWahl(text, anzahl) {
  const treffer = String(text || "").match(/\d+/);
  if (!treffer) return null;
  const zahl = Number(treffer[0]);
  if (!Number.isInteger(zahl) || zahl < 0 || zahl > anzahl) return null;
  return zahl;
}

/**
 * Waehlt aus einem Becken die Passage, die die Frage beantwortet.
 *
 * Rueckfallebene bei Ausfall des Nachsortierers ist BEWUSST das heutige Verhalten
 * (bester BM25-Treffer), nicht "kein Kontext": ein Netzfehler darf keine
 * funktionierende Eigenschaft abschalten (Non-Regression-Pflicht). Der Grund
 * steht im Ergebnis, damit ein haeufiger Ausfall nicht unbemerkt als Erfolg zaehlt.
 *
 * @param {string} frage
 * @param {Array} kandidaten Becken aus beckenFuerNachsortierung
 * @param {{callModel: Function}} deps callModel(prompt, {maxTokens}) => Promise<string>
 * @returns {Promise<{treffer: Array, wahl: number|null, grund: string}>}
 */
export async function nachsortiere(frage, kandidaten, { callModel } = {}) {
  const becken = Array.isArray(kandidaten) ? kandidaten : [];
  if (becken.length === 0) return { treffer: [], wahl: null, grund: GRUND.KEIN_BECKEN };
  if (typeof callModel !== "function") return { treffer: becken.slice(0, 1), wahl: null, grund: GRUND.FEHLER };

  let antwort;
  try {
    antwort = await callModel(baueAuswahlPrompt(frage, becken), { maxTokens: ANTWORT_TOKEN });
  } catch {
    return { treffer: becken.slice(0, 1), wahl: null, grund: GRUND.FEHLER };
  }

  const wahl = leseWahl(antwort, becken.length);
  if (wahl === null) return { treffer: becken.slice(0, 1), wahl: null, grund: GRUND.FEHLER };
  // Die Ablehnung ist kein Fehlschlag, sondern der halbe Zweck: kein Kontext ist
  // besser als falscher Kontext. Gemessen brach genau daran training (-14,4) ein.
  if (wahl === 0) return { treffer: [], wahl: 0, grund: GRUND.ABGELEHNT };
  return {
    treffer: [becken[wahl - 1]],
    wahl,
    grund: wahl === 1 ? GRUND.BESTAETIGT : GRUND.GEWAEHLT
  };
}

/** Zaehlwerk fuer einen ganzen Lauf — gehoert in den Bericht, nicht in ein Protokoll. */
export function neueNachsortierStatistik() {
  return { becken: 0, bestaetigt: 0, gewaehlt: 0, abgelehnt: 0, fehler: 0, keinBecken: 0 };
}

/** Bucht ein Ergebnis auf die Statistik. */
export function bucheNachsortierung(statistik, grund) {
  if (!statistik) return statistik;
  if (grund === GRUND.BESTAETIGT) statistik.bestaetigt += 1;
  else if (grund === GRUND.GEWAEHLT) statistik.gewaehlt += 1;
  else if (grund === GRUND.ABGELEHNT) statistik.abgelehnt += 1;
  else if (grund === GRUND.FEHLER) statistik.fehler += 1;
  else if (grund === GRUND.KEIN_BECKEN) statistik.keinBecken += 1;
  if (grund !== GRUND.KEIN_BECKEN) statistik.becken += 1;
  return statistik;
}
