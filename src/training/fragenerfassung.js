// smejj.com — Erfassung echter Nutzerfragen als Trainingsmaterial.
//
// WARUM NUR DIE FRAGE, NIE DIE ANTWORT:
// Antworten stammen aus Fremdmodellen (GLM, Kimi, Groq). Die
// Trainingsdaten-Policy sperrt Fremdmodell-Ausgaben fuer Training und
// Distillation, solange keine gepruefte Rechtefreigabe vorliegt. Eine erfasste
// Antwort waere also unbrauchbar — und zugleich das groessere
// Datenschutzrisiko, weil sie den Gespraechsinhalt verdoppelt.
//
// Die FRAGE dagegen ist genau das, was fehlt: der Projektkorpus hat 699 Fakten
// mit drei fest verdrahteten Fragenformen, waehrend die Pruefsuite 295
// natuerliche Fragen stellt. Diese Luecke ist der gemessene Grund, warum das
// Training bisher verschlechtert (95,88 % -> 67,89 %). Echte Nutzerfragen sind
// die einzige zulaessige Quelle fuer Vielfalt, die kein Modell erzeugt hat.
//
// FAIL-CLOSED IN VIER STUFEN. Jede muss ausdruecklich JA sagen; Schweigen ist
// Nein. Die Reihenfolge ist Absicht — das Grundsaetzlichste zuerst:
//   1. Schalter     SMEJJ_TRAINING_CAPTURE_ENABLED=YES
//   2. Einwilligung delegiert an capturePersistenceAllowed (policy.js)
//   3. Form         keine leere, keine ueberlange, keine Befehlszeile
//   4. Inhalt       nichts, was nach Zugangsdaten oder Personenbezug aussieht
//
// Was hier NICHT passiert: kein Schreiben, kein Netz, keine Zufallswerte.
// Dieses Modul entscheidet und formt; ablegen tut es der Aufrufer. Damit ist
// die Entscheidung ohne Infrastruktur pruefbar — und eine falsche Entscheidung
// faellt im Test auf, nicht im Betrieb an fremden Daten.
import { isCaptureEnabled } from "./constants.js";
import { consentDecisionReference } from "./consent.js";
// Die Einwilligungspruefung wird NICHT nachgebaut, sondern delegiert.
// capturePersistenceAllowed verlangt eine frische, aufgeloeste, verifizierte
// Entscheidung mit status "granted", captureAllowed, trainingAllowed,
// rightsConfirmed, recordedBy "authenticated-human" und brauchbarer evidenceId.
// Ein eigener, schwaecherer Nachbau waere genau die Art Drift, die bei
// personenbezogenen Daten niemandem auffaellt, bis es zu spaet ist.
import { capturePersistenceAllowed } from "./policy.js";
import { sanitizeTrainingValue, scanSensitiveStrings } from "./sanitize.js";

/** Laengengrenzen. Zu kurz traegt kein Thema, zu lang ist ein Textbeitrag. */
export const FRAGE_MIN_ZEICHEN = 12;
export const FRAGE_MAX_ZEICHEN = 400;

/**
 * Befehlsformen werden nicht erfasst.
 *
 * Eine Handlungsaufforderung ("Loesche die Backups") ist keine Wissensfrage —
 * sie taugt nicht als Trainingsbeispiel und ist zugleich die Form, in der
 * Nutzer am ehesten Konkretes ueber ihre eigenen Daten schreiben.
 */
const BEFEHLSFORM = /^\s*(loesche|lösche|entferne|starte|stoppe|baue|erzeuge|schreibe|aendere|ändere|mach|setze|lege|installiere|deploye|kopiere|verschiebe|sende|schicke)\b/i;

/** Gruende, aus denen eine Frage nicht erfasst wird. Fuer Bericht und Test. */
export const ABLEHNUNG = Object.freeze({
  SCHALTER_AUS: "erfassung_abgeschaltet",
  KEINE_EINWILLIGUNG: "einwilligung_fehlt_oder_veraltet",
  ZU_KURZ: "frage_zu_kurz",
  ZU_LANG: "frage_zu_lang",
  BEFEHLSFORM: "befehlsform",
  KEINE_FRAGE: "kein_fragezeichen",
  SENSIBEL: "sensible_daten_erkannt"
});

/**
 * Darf diese Frage erfasst werden — und wenn ja, in welcher Form?
 *
 * @param {string} frage die Nutzereingabe
 * @param {{consentDecision?: object, env?: object, now?: string}} optionen
 * @returns {{erfassen: boolean, grund: string|null, satz: object|null}}
 */
export function pruefeFrage(frage, { consentDecision, env = process.env, now = new Date().toISOString() } = {}) {
  const ab = (grund) => ({ erfassen: false, grund, satz: null });

  // 1. Der projektweite Schalter. Er steht zuerst, weil er alles andere
  //    ueberstimmt — auch eine vorliegende Einwilligung.
  if (!isCaptureEnabled(env)) return ab(ABLEHNUNG.SCHALTER_AUS);

  // 2. Die Einwilligung, vollstaendig delegiert. Eine vom Aufrufer
  //    mitgeschickte Kopie einer Entscheidung wird dabei nie zur Autoritaet.
  if (!capturePersistenceAllowed({}, consentDecision, { now })) return ab(ABLEHNUNG.KEINE_EINWILLIGUNG);

  const text = String(frage || "").trim();
  if (text.length < FRAGE_MIN_ZEICHEN) return ab(ABLEHNUNG.ZU_KURZ);
  if (text.length > FRAGE_MAX_ZEICHEN) return ab(ABLEHNUNG.ZU_LANG);
  if (BEFEHLSFORM.test(text)) return ab(ABLEHNUNG.BEFEHLSFORM);
  if (!text.includes("?")) return ab(ABLEHNUNG.KEINE_FRAGE);

  // 4. Inhalt. Wenn die Sanitization etwas AENDERN musste, wird nicht die
  //    bereinigte Fassung erfasst, sondern gar nichts: eine Frage, die ein
  //    Geheimnis enthielt, ist als Beispiel wertlos, und ihr Rest verraet
  //    moeglicherweise weiterhin den Zusammenhang.
  if (scanSensitiveStrings(text).length > 0) return ab(ABLEHNUNG.SENSIBEL);
  if (String(sanitizeTrainingValue(text)?.value ?? "") !== text) return ab(ABLEHNUNG.SENSIBEL);

  return {
    erfassen: true,
    grund: null,
    satz: {
      text,
      herkunft: "nutzerfrage",
      erfasstAm: now,
      // Der Beleg, WELCHE Einwilligung diese Erfassung deckt. Ohne ihn liesse
      // sich spaeter nicht zeigen, dass sie gedeckt war — und ein Widerruf
      // koennte die betroffenen Saetze nicht finden. consentDecisionReference
      // liefert genau die belegtauglichen Felder: keine Klarnamen, keine
      // Ledger-Innereien.
      einwilligung: consentDecisionReference(consentDecision)
    }
  };
}

/**
 * Zaehlwerk eines Erfassungszeitraums. Gehoert in den Betriebsbericht: eine
 * Erfassung, die staendig ablehnt, ist ein Hinweis auf einen fehlenden
 * Einwilligungsweg — nicht auf schweigsame Nutzer.
 */
export function neueErfassungsStatistik() {
  return { geprueft: 0, erfasst: 0, abgelehnt: {} };
}

/** Bucht ein Ergebnis auf die Statistik. */
export function bucheErfassung(statistik, ergebnis) {
  if (!statistik) return statistik;
  statistik.geprueft += 1;
  if (ergebnis?.erfassen === true) {
    statistik.erfasst += 1;
    return statistik;
  }
  const grund = ergebnis?.grund || "unbekannt";
  statistik.abgelehnt[grund] = (statistik.abgelehnt[grund] || 0) + 1;
  return statistik;
}
