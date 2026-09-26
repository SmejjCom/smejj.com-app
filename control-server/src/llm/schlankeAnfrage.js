// smejj.com — schlanke Anfrage fuer Modelle mit kleinem Kontextfenster.
//
// WOZU (13.09.2026, gemessen): smejj 1 laeuft auf dem Hausmodell-Dienst mit
// 4.096 Tokens Fenster auf 2 Kernen. Der Chat schickt jeder Frage einen
// Begleittext mit — Systemregeln, Verlauf, Projektwissen —, laut
// Verbrauchsprotokoll rund 1.300 Tokens schon bei "Was ist 17 mal 3?". Dieselbe
// Frage mit kurzem Text brachte das erste Wort nach 6 bis 8 Sekunden; mit dem
// vollen Begleittext kam in 45 Sekunden keines, und der Router wich auf GLM aus.
//
// Ein 4B-Modell kann den langen Begleittext ohnehin nicht nutzen: die Regeln
// fuer grosse Modelle (Werkzeuge, Rueckfrage-Karten, Quellenformat) verwirren
// es eher, und Verlauf plus Projektwissen fuellen das Fenster, bevor die Frage
// kommt. Also bekommt es genau das, was es tragen kann: eine kurze Rolle und
// die Frage selbst.
//
// Rein und ohne I/O — damit die Regel pruefbar bleibt.
import { getModelDefinition } from "../../../src/shared/modelRegistry.js";

/** Ab dieser Fenstergroesse bekommt ein Modell den vollen Begleittext. */
export const VOLLES_FENSTER_AB = 16_384;
/** Antwortlaenge fuer kleine Modelle — 5 Woerter je Sekunde, 512 sind rund 100 s. */
export const MAX_ANTWORT_TOKENS = 512;

export { SCHLANKE_ROLLE, kompakteFrage, MAX_KONTEXT_ZEICHEN, MAX_FRAGE_ZEICHEN } from "../../../src/training/quellenFormat.js";
import { SCHLANKE_ROLLE, kompakteFrage } from "../../../src/training/quellenFormat.js";

/** Braucht dieses Backend die schlanke Fassung? Nur bei bekannt kleinem Fenster. */
export function brauchtSchlankeAnfrage(backend) {
  const modell = getModelDefinition(backend?.logicalModelId);
  const fenster = Number(modell?.contextTokens || 0);
  return fenster > 0 && fenster < VOLLES_FENSTER_AB;
}

/**
 * Nimmt aus den vollen Nachrichten nur die letzte Nutzerfrage.
 *
 * Von der Frage bleibt der ANFANG: /api/agent setzt die eigentliche Aufgabe
 * nach vorn ("Frage/Aufgabe: ...") und haengt Web-, Projekt- und Dateikontext
 * dahinter an. Wer kuerzt, kuerzt also den Anhang, nicht die Frage.
 */
export function schlankeNachrichten(messages) {
  const liste = Array.isArray(messages) ? messages : [];
  const letzte = [...liste].reverse().find((m) => m?.role === "user");
  const text = inhaltAlsText(letzte?.content).replace(/^Frage\/Aufgabe:\s*/i, "").trim();
  return [
    { role: "system", content: SCHLANKE_ROLLE },
    { role: "user", content: kompakteFrage(text) || "Hallo" }
  ];
}

/** Antwortgrenze: nie mehr als MAX_ANTWORT_TOKENS, nie weniger als erbeten. */
export function schlankeMaxTokens(erbeten) {
  const zahl = Number(erbeten);
  return Number.isFinite(zahl) && zahl > 0 ? Math.min(zahl, MAX_ANTWORT_TOKENS) : MAX_ANTWORT_TOKENS;
}

function inhaltAlsText(inhalt) {
  if (typeof inhalt === "string") return inhalt;
  if (Array.isArray(inhalt)) return inhalt.map((teil) => (typeof teil === "string" ? teil : teil?.text || "")).join("\n");
  return "";
}
