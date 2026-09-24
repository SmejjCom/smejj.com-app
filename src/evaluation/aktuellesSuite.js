// smejj.com — Messlatte "Aktuelles" (Plan "smejj lernt selbst", Stufe 1, Betreiber 24.09.2026).
//
// Frage: Weiss smejj, was das eigene Radar in den letzten Tagen geprueft und
// gespeichert hat? Genau hier soll smejj gegen die grossen Modelle gewinnen
// (frisches, belegtes Wissen) — also muss es hier auch gemessen werden.
//
// Rein, ohne I/O und ohne Modell: aus geprueften Radar-Eintraegen wird jede
// Woche eine Eval-Suite im gewohnten Format (src/evaluation/evalSuite.js). Die
// Frage nennt nur den GEGENSTAND (Name/Produkt), nie die Aussage selbst; die
// Erwartung sind die tragenden Details der Aussage (Zahlen, weitere Namen).
// Bewertet wird mit derselben scoreCase-Logik wie jede andere Suite.
import { computeEvalSuiteSha256 } from "./evalSuite.js";

export const AKTUELLES_SUITE_ID = "smejj-aktuelles-woche";
export const AKTUELLES_TAGE = 7;
export const AKTUELLES_MAX_FAELLE = 30;

// Woerter, die gross geschrieben werden, aber keinen Gegenstand benennen.
const KEIN_NAME = new Set([
  "der", "die", "das", "ein", "eine", "the", "a", "an", "in", "im", "am", "on", "at", "for", "mit", "und", "and",
  "laut", "nach", "seit", "ab", "bis", "neu", "neue", "neuer", "neues", "new", "this", "that", "it", "its",
  "januar", "februar", "maerz", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember",
  "january", "february", "march", "may", "june", "july", "october", "december",
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag", "ki", "ai", "api", "usd", "eur"
]);

// Mehrteilige Namen: "Gemini 3.1 Flash", "GPT-5", "Claude Opus", "Llama 4".
const NAME_MUSTER = /\b([A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*(?:\s+(?:[A-Z][A-Za-z0-9]*|\d+(?:\.\d+)*)(?:[-.][A-Za-z0-9]+)*){0,2})/g;
// Zahlen mit Einheit: "3 USD", "1,5 Mio.", "128k", "40 %", "2.5".
const ZAHL_MUSTER = /\d+(?:[.,]\d+)?\s?(?:%|k\b|m\b|mio\.?|mrd\.?|usd|eur|\$|€|tokens?)?/gi;

// Deutsch schreibt jedes Hauptwort gross ("Preis", "Million") — ein grosses
// Anfangszeichen allein macht darum keinen Namen. Als Name zaehlt nur, was
// eine Ziffer traegt ("GPT-5", "Gemini 3.5 Flash") oder mehrere Grossbuchstaben
// hat ("OpenAI", "DeepSeek", "NVIDIA"). Firmen mit schlichtem Namen ("Google")
// bleiben Rueckfall-Gegenstand, nie Detail.
const MARKENARTIG = (name) => /\d/.test(name) || /[A-Z].*[A-Z]/.test(name.split(/\s+/)[0]);

function namenAus(aussage) {
  const treffer = String(aussage || "").match(NAME_MUSTER) || [];
  const namen = [];
  for (const roh of treffer) {
    const name = roh.trim();
    const erstes = name.split(/\s+/)[0].toLowerCase();
    if (KEIN_NAME.has(erstes) || name.length < 2) continue;
    if (!namen.some((n) => n.name.toLowerCase() === name.toLowerCase())) namen.push({ name, marke: MARKENARTIG(name) });
  }
  return namen;
}

function zahlenAus(aussage) {
  const treffer = String(aussage || "").match(ZAHL_MUSTER) || [];
  // Jahreszahlen und einzelne Ziffern tragen fast nie die Aussage.
  return [...new Set(treffer.map((z) => z.trim()).filter((z) => z.length >= 2 && !/^(19|20)\d\d$/.test(z)))];
}

/**
 * Zerlegt eine Aussage in Gegenstand (fuer die Frage) und Details (Erwartung).
 * @returns {{gegenstand: string, details: string[]} | null} null = nicht messbar
 */
export function zerlegeAussage(aussage) {
  const namen = namenAus(aussage);
  if (namen.length === 0) return null;
  // Gegenstand: das erste Produkt/Markenwort; sonst der erste Satzanfang-Name.
  const gegenstand = (namen.find((n) => n.marke) || namen[0]).name;
  const g = gegenstand.toLowerCase();
  const details = [...zahlenAus(aussage), ...namen.filter((n) => n.marke).map((n) => n.name)]
    .filter((d) => !g.includes(d.toLowerCase()) && !d.toLowerCase().includes(g))
    .slice(0, 4);
  // Ohne ein pruefbares Detail wuerde schon das Nennen des Gegenstands reichen —
  // das misst nichts.
  return details.length ? { gegenstand, details } : null;
}

// Radar-Eintraege tragen erstelltAm/aktualisiertAm (src/radar/wissensbasis.js baueEintrag).
const zeitVon = (e) => Date.parse(e?.aktualisiertAm || e?.erstelltAm || "");

function istFrisch(eintrag, jetzt, tage) {
  const zeit = zeitVon(eintrag);
  return Number.isFinite(zeit) && zeit < jetzt && jetzt - zeit <= tage * 86400000;
}

/**
 * Stichtag der Woche: Montag 00:00 UTC. Bis zum naechsten Montag entsteht
 * daraus immer DIESELBE Suite — sonst aenderte jeder neue Radar-Fund den
 * Fall-Hash und der Messlauf finge alle 12 h von vorn an.
 */
export function wochenStichtag(jetztMs = Date.now()) {
  const d = new Date(jetztMs);
  const tag = (d.getUTCDay() + 6) % 7; // Montag = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - tag);
}

/**
 * Baut die Wochen-Suite aus Radar-Eintraegen.
 * @param {object[]} eintraege  aktuelle Fassungen der Radar-Wissensbasis
 * @param {{jetzt?: number, tage?: number, maxFaelle?: number, themenTitel?: Record<string,string>}} optionen
 *   jetzt = Stichtag (siehe wochenStichtag): nur Eintraege der 7 Tage DAVOR.
 */
export function baueAktuellesSuite(eintraege = [], { jetzt = Date.now(), tage = AKTUELLES_TAGE, maxFaelle = AKTUELLES_MAX_FAELLE, themenTitel = {} } = {}) {
  const gesehen = new Set();
  const faelle = [];
  const kandidaten = (Array.isArray(eintraege) ? eintraege : [])
    .filter((e) => e && e.pruefstatus === "geprueft" && !e.zurueckgenommen && istFrisch(e, jetzt, tage))
    .sort((a, b) => zeitVon(b) - zeitVon(a) || String(a.id).localeCompare(String(b.id)));
  for (const eintrag of kandidaten) {
    if (faelle.length >= maxFaelle) break;
    const teile = zerlegeAussage(eintrag.aussage);
    if (!teile) continue;
    const schluessel = teile.gegenstand.toLowerCase();
    if (gesehen.has(schluessel)) continue; // ein Fall je Gegenstand
    gesehen.add(schluessel);
    const thema = themenTitel[eintrag.themaId] || eintrag.themaId || "KI";
    faelle.push({
      id: `aktuell-${String(eintrag.id || eintrag.schluessel || faelle.length).slice(0, 24)}`,
      profile: "web",
      weight: 1,
      maxTokens: 500,
      system: "Du bist smejj. Antworte kurz, sachlich und mit konkreten Fakten (Zahlen, Namen, Datum).",
      prompt: `Was gibt es in den letzten Tagen Neues zu ${teile.gegenstand}? (Bereich: ${thema}) Nenne die wichtigsten Fakten.`,
      notes: `Radar-Aussage: ${String(eintrag.aussage).slice(0, 300)}`,
      assertions: [
        { type: "contains_any", values: teile.details, critical: false },
        { type: "contains_any", values: [teile.gegenstand], critical: false },
        { type: "not_matches", pattern: "(keine (aktuellen )?informationen|weiß ich nicht|weiss ich nicht|no (recent )?information|i don't know|mein wissensstand)", ignoreCase: true, critical: false },
        { type: "min_length", value: 60, critical: false }
      ]
    });
  }
  const suite = {
    schemaVersion: 1,
    suiteId: AKTUELLES_SUITE_ID,
    version: new Date(jetzt).toISOString().slice(0, 10),
    createdAt: new Date(jetzt).toISOString(),
    description: `Messlatte Aktuelles: ${faelle.length} Fragen aus gepruefter Radar-Wissensbasis der letzten ${tage} Tage.`,
    eligibleForTraining: false,
    budgets: { minScore: 0.5, latencyMsP95: 60000, firstTokenMs: 45000, maxCasesPerRun: maxFaelle },
    cases: faelle
  };
  suite.integrity = { algorithm: "sha256", canonicalization: "json-key-sort-v1" };
  suite.integrity.contentSha256 = computeEvalSuiteSha256(suite);
  return suite;
}
