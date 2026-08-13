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
import { starteAutopilotLaeufer, baueEskalationsVersand } from "./autopilotLaeufer.js";
import { sendAuthMail } from "../auth/mailer.js";

/** Startet alle Autopilot-Hintergrunddienste. Wirft nie; unref ueberall. */
export function starteAutopiloten({ env = process.env } = {}) {
  // Zustellprotokoll: 90 Tage aufbewahren (Betreiber-Freigabe 2026-07-29).
  starteMailLogAufraeumen({ env });
  // Eigenmeldung der Sonden: der laufende Container bezeugt sich selbst.
  starteSelbstmessung();
  // Neustart-Festigkeit: abgelegte Herzschlaege zurueckholen, dann Alarm-Wache.
  ladeHerzschlaege().catch(() => {});
  starteAlarmWache();
  // Bruecken-Waechter wird ABGEFRAGT — er hat eine oeffentliche Adresse.
  starteWaechterAbfrage();
  // Wochenbericht: montags eine Mail mit der Lage der Woche.
  starteWochenbericht();
  // Der Taktgeber (Nr. 32) betreibt die Module alle 30 Minuten mit echten
  // Aufgaben; die Selbstheilung (Nr. 33) belebt Rotes hoechstens dreimal
  // wieder und eskaliert dann genau einmal per Mail.
  starteAutopilotLaeufer({ sendeAlarm: baueEskalationsVersand(sendAuthMail, env) });
}
