// smejj.com — Alarm bei Angriffsmustern am Adminbereich (Single Responsibility:
// aus vielen kleinen Abwehrvorgaengen EIN sichtbares Ereignis machen).
//
// Warum das noetig ist (Befund 2026-08-06): Vortuer und Step-up wehren zwar ab,
// aber vollkommen lautlos. Ein Angreifer konnte stundenlang gegen die Tuer
// laufen, ohne dass irgendwo etwas stand. Eine Abwehr, von der niemand erfaehrt,
// verhindert den einen Versuch — nicht den naechsten.
//
// Drei Festlegungen:
//   1. NICHT jedes Ereignis meldet. Ein einzelnes 429 ist Normalbetrieb (die
//      Konsole selbst laedt beim Start einen Schwung Dateien). Gemeldet wird
//      erst ein MUSTER: Schwelle innerhalb eines Zeitfensters.
//   2. Der Nachweis geht ins Audit-Log — dort schaut man ohnehin hin, und die
//      Hash-Kette macht ihn faelschungssicher.
//   3. Die Mail ist gedeckelt (eine je Art und Ruhezeit). Ein Alarm, der das
//      Postfach flutet, wird nach dem dritten Mal ignoriert — dann waere er
//      schlimmer als keiner.
//
// In-memory wie der Step-up: eine Replika, Neustart = Zaehler zurueck. Das ist
// vertretbar, weil der Zaehler nur Muster erkennt und keine Rechte traegt.
import { appendAuditEntry } from "./auditLog.js";
import { sendAuthMail } from "../auth/mailer.js";

export const ARTEN = Object.freeze({
  vortuer: "vortuer_drosselung",
  stepUpFalsch: "step_up_code_falsch",
  stepUpVerbrannt: "step_up_zu_viele_versuche"
});

// Schwelle und Fenster je Art. Bewusst unterschiedlich: ein falscher Code ist
// ein viel selteneres Ereignis als ein gedrosselter Seitenaufruf.
const REGELN = Object.freeze({
  [ARTEN.vortuer]: { schwelle: 25, fensterMs: 5 * 60_000, ruheMs: 30 * 60_000 },
  [ARTEN.stepUpFalsch]: { schwelle: 5, fensterMs: 10 * 60_000, ruheMs: 30 * 60_000 },
  [ARTEN.stepUpVerbrannt]: { schwelle: 2, fensterMs: 30 * 60_000, ruheMs: 30 * 60_000 }
});

/** art -> { zeiten: number[], zuletztGemeldet: number } */
const zaehler = new Map();

function eintragFuer(art) {
  let eintrag = zaehler.get(art);
  if (!eintrag) {
    eintrag = { zeiten: [], zuletztGemeldet: 0 };
    zaehler.set(art, eintrag);
  }
  return eintrag;
}

/**
 * Meldet ein einzelnes Abwehr-Ereignis. Loest NUR aus, wenn das Muster die
 * Schwelle reisst und die Ruhezeit abgelaufen ist.
 *
 * Wirft nie: ein fehlgeschlagener Alarm darf keine Abwehr blockieren.
 *
 * @param {string} art          eine der ARTEN
 * @param {object} [details]    z. B. { kennung: "1.2.3.4" } — nie Geheimnisse
 * @returns {Promise<{gemeldet: boolean, anzahl: number}>}
 */
export async function meldeEreignis(art, details = {}, { env = process.env, now = Date.now, mail = sendAuthMail } = {}) {
  const regel = REGELN[art];
  if (!regel) return { gemeldet: false, anzahl: 0 };
  const jetzt = now();
  const eintrag = eintragFuer(art);

  // Alles ausserhalb des Fensters faellt raus — der Zaehler waechst nicht ewig.
  eintrag.zeiten = eintrag.zeiten.filter((z) => jetzt - z < regel.fensterMs);
  eintrag.zeiten.push(jetzt);
  const anzahl = eintrag.zeiten.length;

  if (anzahl < regel.schwelle) return { gemeldet: false, anzahl };
  if (jetzt - eintrag.zuletztGemeldet < regel.ruheMs) return { gemeldet: false, anzahl };

  eintrag.zuletztGemeldet = jetzt;
  // Nach dem Melden von vorn zaehlen, sonst meldet dieselbe Welle nach jeder
  // Ruhezeit erneut, obwohl laengst nichts Neues passiert ist.
  eintrag.zeiten = [];

  const minuten = Math.round(regel.fensterMs / 60_000);
  const text = `${anzahl} Vorgaenge der Art "${art}" innerhalb von ${minuten} Minuten.`;

  try {
    await appendAuditEntry({
      actor: { email: "system", name: "Sicherheitswache", role: "system" },
      action: "security.alarm",
      target: art,
      before: null,
      after: { anzahl, fensterMinuten: minuten, ...details },
      reason: text,
      ip: String(details?.kennung || "")
    }, { env });
  } catch { /* Nachweis fehlgeschlagen — die Mail unten ist der zweite Weg. */ }

  const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(/[,;\s]+/).filter(Boolean)[0];
  if (empfaenger) {
    try {
      await mail({
        to: empfaenger,
        subject: "smejj.com Adminbereich — Sicherheitsalarm",
        text: `${text}\n\nDas ist eine Abwehrmeldung, kein Einbruch: die Anfragen wurden `
          + `bereits abgewiesen. Der Eintrag steht im Audit-Log unter "security.alarm".\n\n`
          + `Wenn du gerade selbst getestet hast, kannst du das ignorieren.`,
        art: "admin-sicherheitsalarm"
      }, env);
    } catch { /* Mailweg gestoert — der Audit-Eintrag steht trotzdem. */ }
  }

  return { gemeldet: true, anzahl };
}

export function __clearAlarmForTests() {
  zaehler.clear();
}
