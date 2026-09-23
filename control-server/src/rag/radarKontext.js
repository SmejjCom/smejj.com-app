// smejj ai radar — eigener Abrufweg fuers Radar-Wissen (Befund 21.09.2026).
//
// WARUM NICHT EINFACH IN DEN PROJEKT-INDEX: Gemessen am selben Tag, live: die
// Radar-Eintraege landeten im gemeinsamen Index, erreichten dort aber BM25-Werte
// um 3 — die Relevanzschwelle des Projektwissens liegt bei 20 (ragRanking.js,
// bewusst hoch: "kein Kontext ist besser als falscher Kontext"). Ergebnis: der
// Chat antwortete "Ich habe keinen Zugriff auf internes gespeichertes Wissen",
// obwohl zehn Eintraege bereitlagen.
//
// Die Schwelle zu senken waere der falsche Weg — sie schuetzt die Antworten
// gegen halb passende Regeldokumente. Das Radar-Wissen ist eine ANDERE Sorte:
// wenige, kurze, tagesaktuelle Saetze mit Quelle. Es bekommt deshalb einen
// eigenen kleinen Index mit eigener Schwelle und einen eigenen Block im Prompt,
// der klar sagt, woher er kommt und wie sicher er ist.
import { buildIndex, searchIndex } from "./bm25Index.js";
import { ladeRadarChunks } from "../autopilots/aiRadarAutopilot.js";

const INDEX_TTL_MS = 120_000;      // Radar-Wissen aendert sich mehrmals taeglich.
/** Eigene Schwelle: BM25 auf wenigen kurzen Texten liefert kleine Zahlen. */
export const RADAR_MIN_SCORE = 1.2;
let cache = null;

let erneuerung = null;

async function neuBauen(jetztMs, lader) {
  const chunks = await lader().catch(() => []);
  cache = { gebautAm: jetztMs, chunks, index: chunks.length ? buildIndex(chunks) : null };
  return cache;
}

// Veraltet = der alte Stand antwortet SOFORT, erneuert wird im Hintergrund
// (23.09.2026): die Chat-Bruecke wartet hoechstens 1,2 s — ein e2-Abruf mitten
// in ihrer Frist liesse jede Frage nach Ablauf der 2 Minuten leer ausgehen.
export async function radarIndex({ jetztMs = Date.now(), lader = ladeRadarChunks } = {}) {
  if (!cache) return neuBauen(jetztMs, lader);
  if (jetztMs - cache.gebautAm > INDEX_TTL_MS && !erneuerung) {
    erneuerung = neuBauen(jetztMs, lader).finally(() => { erneuerung = null; });
  }
  return cache;
}

/** Testhilfe und Notausgang: beim naechsten Ruf wird neu gebaut. */
export function radarIndexVerwerfen() { cache = null; erneuerung = null; }

/**
 * Der Prompt-Block. Leer, wenn nichts passt — nie ein "leider nichts gefunden".
 * Jede Zeile traegt Quelle, Stand und Pruefstatus; Einzelquellen sind als solche
 * gekennzeichnet, damit die Antwort sie nicht als gesichert ausgibt.
 */
export async function baueRadarKontext(frage, { k = 3, minScore = RADAR_MIN_SCORE, jetztMs = Date.now(), lader = ladeRadarChunks } = {}) {
  try {
    const { index } = await radarIndex({ jetztMs, lader });
    if (!index) return "";
    const treffer = searchIndex(index, String(frage || ""), k).filter((t) => t.score >= minScore);
    if (!treffer.length) return "";
    const zeilen = treffer.map((t) => `- ${t.snippet || t.heading}`);
    return [
      "Aktuelles aus der eigenen Recherche (smejj ai radar) — kurz gepruefte Fundstellen,",
      "jede mit Quelle und Stand. Benutze sie NUR, wenn sie zur Frage passt, nenne die",
      "Quelle und sage dazu, wenn eine Angabe nur auf EINER Quelle beruht:",
      ...zeilen
    ].join("\n");
  } catch {
    return "";
  }
}
