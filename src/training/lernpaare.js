// smejj.com — Lernpaare: Frage + Antwort, die ein Mensch mit Daumen hoch als
// gut markiert hat (Betreiber-Auftrag 17.09.2026: "Im Chat echte
// Frage-Antwort-Paare sammeln ... nur mit Einwilligung").
//
// WARUM NICHT EINFACH DAS FEEDBACK-SIGNAL: Das Schwungrad (Nr. 19) legt jeden
// Daumen ab, auch ohne Trainings-Einwilligung — es dient der Qualitaetsarbeit.
// Trainingsmaterial darf daraus nur werden, wenn der Mensch dem Training
// ausdruecklich zugestimmt hat. Diese Pruefung ist dieselbe wie bei den
// erfassten Fragen (capturePersistenceAllowed), nur fuer ein ganzes Paar.
//
// GRENZE: Ein abgelegtes Paar ist ein KANDIDAT. Ob es in einen Trainingslauf
// darf, entscheidet beim Datensatzbau evaluateTrainingEligibility — dort
// stehen auch die Rechte an Antworten fremder Anbieter.
import { isCaptureEnabled } from "./constants.js";
import { consentDecisionReference } from "./consent.js";
import { capturePersistenceAllowed } from "./policy.js";
import { sanitizeTrainingValue, scanSensitiveStrings } from "./sanitize.js";

/** Unterordner im erlaubten Praefix training/fragen/ — kein neuer Zeabur-Wert noetig. */
export const LERNPAAR_PRAEFIX = "training/fragen/lernpaare";

export const LERNPAAR_GRENZEN = Object.freeze({ frageMin: 8, frageMax: 2000, antwortMin: 3, antwortMax: 4000 });

export const LERNPAAR_ABLEHNUNG = Object.freeze({
  SCHALTER_AUS: "erfassung_abgeschaltet",
  KEINE_EINWILLIGUNG: "einwilligung_fehlt_oder_veraltet",
  FRAGE_LAENGE: "frage_laenge",
  ANTWORT_LAENGE: "antwort_laenge",
  FEHLERTEXT: "antwort_ist_fehlertext",
  SENSIBEL: "sensible_daten_erkannt"
});

// Antworten, die keine Antworten sind: Rueckfall- und Fehlertexte der eigenen
// Kette. Ein Daumen hoch darauf (aus Versehen) darf kein Lernziel werden.
const FEHLERTEXTE = [
  /konnte gerade nicht antworten/i,
  /^verstanden\. ich kann daraus eine konkrete aufgabe machen/i,
  /bitte (gleich )?noch einmal versuchen/i
];

function sauber(text) {
  if (scanSensitiveStrings(text).length > 0) return false;
  return String(sanitizeTrainingValue(text)?.value ?? "") === text;
}

/**
 * Darf dieses Paar als Lernpaar abgelegt werden?
 * @returns {{erfassen: boolean, grund: string|null, satz: object|null}}
 */
export function pruefeLernpaar(frage, antwort, { consentDecision, env = process.env, now = new Date().toISOString() } = {}) {
  const ab = (grund) => ({ erfassen: false, grund, satz: null });
  if (!isCaptureEnabled(env)) return ab(LERNPAAR_ABLEHNUNG.SCHALTER_AUS);
  if (!capturePersistenceAllowed({}, consentDecision, { now })) return ab(LERNPAAR_ABLEHNUNG.KEINE_EINWILLIGUNG);

  const f = String(frage || "").trim();
  const a = String(antwort || "").trim();
  const g = LERNPAAR_GRENZEN;
  if (f.length < g.frageMin || f.length > g.frageMax) return ab(LERNPAAR_ABLEHNUNG.FRAGE_LAENGE);
  if (a.length < g.antwortMin || a.length > g.antwortMax) return ab(LERNPAAR_ABLEHNUNG.ANTWORT_LAENGE);
  if (FEHLERTEXTE.some((muster) => muster.test(a))) return ab(LERNPAAR_ABLEHNUNG.FEHLERTEXT);
  if (!sauber(f) || !sauber(a)) return ab(LERNPAAR_ABLEHNUNG.SENSIBEL);

  return {
    erfassen: true,
    grund: null,
    satz: {
      frage: f,
      antwort: a,
      herkunft: "daumen_hoch",
      erfasstAm: now,
      einwilligung: consentDecisionReference(consentDecision)
    }
  };
}

/** Objektschluessel: nach Tag getrennt, ohne jede Kennung des Menschen. */
export function lernpaarObjektSchluessel(erfasstAm, id) {
  const tag = String(erfasstAm || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) throw new Error("lernpaar_zeitpunkt_ungueltig");
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) throw new Error("lernpaar_id_ungueltig");
  return `${LERNPAAR_PRAEFIX}/${tag.slice(0, 4)}/${tag.slice(5, 7)}/${tag.slice(8, 10)}/${id}.json`;
}
