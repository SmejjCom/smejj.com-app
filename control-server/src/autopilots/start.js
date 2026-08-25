// smejj.com — EIN Einstieg fuer alle Autopilot-Hintergrunddienste.
//
// Ausgelagert aus src/server.js am 2026-08-13 (800-Zeilen-Regel): sieben
// starte*-Aufrufe samt Begruendungen gehoeren fachlich zusammen — und der
// HTTP-Einstieg soll HTTP bleiben. Die Reihenfolge hier ist bewusst:
// erst die abgelegten Herzschlaege zurueckholen (Neustart-Festigkeit),
// dann messen, dann alarmieren.
import {
  ladeHerzschlaege,
  starteAlarmWache,
  starteSelbstmessung,
  starteWaechterAbfrage,
  starteWochenbericht
} from "../admin/opsAutopiloten.js";
import { starteMailLogAufraeumen } from "../auth/mailLogJanitor.js";
import { baueEskalationsVersand } from "./autopilotLaeufer.js";
import { starteAutopilotLaeufer } from "./autopilotTaktstart.js";
import { starteModellEinkaeufer } from "./modellEinkaeufer.js";
// Nutzerreise-Waechter: der dichte 15-Minuten-A-bis-Z-Takt des Probe-Nutzers
// (Betreiber-Auftrag 2026-08-25).
import { starteNutzerreiseTakt } from "./nutzerreiseWaechter.js";
// Log-Wache (Nr. 45): die Prozess-Haken muessen VOR dem ersten Fehler haengen.
import { registriereProzessWache } from "./logWacheAutopilot.js";
import { interneMeldung } from "../admin/opsAutopiloten.js";
import { sendAuthMail } from "../auth/mailer.js";

/** Startet alle Autopilot-Hintergrunddienste. Wirft nie; unref ueberall.
 *
 * JEDER Aufruf einzeln abgesichert (2026-08-13, nach dem 502-Vorfall):
 * Die Ueberwachung existiert fuer die App — nicht umgekehrt. Ein Fehler in
 * einem Waechter darf den HTTP-Server niemals am Booten hindern; er wird
 * protokolliert und der Rest startet trotzdem.
 */
export function starteAutopiloten({ env = process.env } = {}) {
  const sicher = (name, fn) => {
    try { fn(); } catch (fehler) {
      console.error(`[autopiloten] ${name} startete NICHT: ${String(fehler?.message || fehler).slice(0, 160)}`);
    }
  };
  // Log-Wache (Nr. 45) zuerst: was vor den Haken passiert, sieht niemand.
  sicher("logWacheProzessHaken", () => registriereProzessWache());
  // Zustellprotokoll: 90 Tage aufbewahren (Betreiber-Freigabe 2026-07-29).
  sicher("mailLogAufraeumen", () => starteMailLogAufraeumen({ env }));
  // Eigenmeldung der Sonden: der laufende Container bezeugt sich selbst.
  sicher("selbstmessung", () => starteSelbstmessung());
  // Neustart-Festigkeit: abgelegte Herzschlaege zurueckholen, dann Alarm-Wache.
  sicher("herzschlaege", () => { ladeHerzschlaege().catch(() => {}); });
  sicher("alarmWache", () => starteAlarmWache());
  // Bruecken-Waechter wird ABGEFRAGT — er hat eine oeffentliche Adresse.
  sicher("waechterAbfrage", () => starteWaechterAbfrage());
  // Wochenbericht: montags eine Mail mit der Lage der Woche.
  sicher("wochenbericht", () => starteWochenbericht());
  // Der Taktgeber (Nr. 32) betreibt die Module alle 30 Minuten mit echten
  // Aufgaben; die Selbstheilung (Nr. 33) belebt Rotes hoechstens dreimal
  // wieder und eskaliert dann genau einmal per Mail.
  sicher("autopilotLaeufer", () => starteAutopilotLaeufer({ sendeAlarm: baueEskalationsVersand(sendAuthMail, env) }));
  // Modell-Einkaeufer (Nr. 34): Wochen-Arena + 12-h-Zwischenmeldung. Dieser
  // Aufruf FEHLTE nach dem Auszug aus server.js (2026-08-13 abends entdeckt):
  // der Import stand da, gerufen wurde nie — der Einkaeufer war grau und
  // haette auch seine Wochen-Arena nie gefahren. Der Test
  // "start.js ruft jeden importierten starte*-Dienst auch auf" haelt die
  // ganze Fehlerklasse seitdem fest.
  sicher("modellEinkaeufer", () => starteModellEinkaeufer({ env, melde: interneMeldung }));
  // Probe-Nutzer (Nr. 29) im dichten Takt: alle 15 Minuten die ganze App als
  // Nutzer — Startseite, Buendel-Gleichheit, Nachlade-Kette, API-Kernpfade,
  // Anmeldung, Chat, Speicher. Der 30-Minuten-Durchgang bleibt unveraendert.
  sicher("nutzerreiseTakt", () => starteNutzerreiseTakt({ melde: interneMeldung }));
}
