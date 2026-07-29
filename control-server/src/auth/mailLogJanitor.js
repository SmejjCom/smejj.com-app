// smejj.com — Taktgeber fuer das Aufraeumen des Zustellprotokolls.
//
// WARUM ES DIESE DATEI GIBT
//
// `raeumeAuf()` in mailDeliveryLog.js war fertig, wurde aber von niemandem
// aufgerufen. Damit war die Zusage an den Betreiber — "Aufbewahrung 90 Tage,
// danach automatische Loeschung" — eine Absicht, kein Verhalten. Eine
// Aufbewahrungsfrist, die nur im Code steht und nie ablaeuft, ist schlimmer als
// keine: sie wurde zugesagt.
//
// DREI ENTSCHEIDUNGEN
//
//   1. VERZOEGERTER ERSTER LAUF. Nicht beim Start, sondern einige Minuten
//      spaeter. Ein Container, der mehrfach hintereinander neu ausgerollt wird
//      (bei Salad der Normalfall), wuerde sonst jedes Mal sofort listen.
//   2. DER TAKTGEBER HAELT DEN PROZESS NICHT WACH (`unref`). Ein Zeitgeber, der
//      ein Skript am Beenden hindert, faellt spaeter als haengender Test auf und
//      wird dann falsch reparariert.
//   3. EIN FEHLER BLEIBT EIN FEHLER, ABER KIPPT NICHTS. Klappt das Aufraeumen
//      nicht, steht das in der Ausgabe — der Server laeuft weiter. Das Loeschen
//      ist Hygiene, nicht Betrieb.
//
// Was gelöscht werden darf, entscheidet ausschliesslich `darfGeloeschtWerden()`
// in mailDeliveryLog.js. Dieses Modul kennt keine Schluessel und bildet keine.
import { AUFBEWAHRUNG_TAGE, raeumeAuf } from "./mailDeliveryLog.js";

const ERSTER_LAUF_MS = 5 * 60 * 1000;
const TAKT_MS = 24 * 60 * 60 * 1000;

/**
 * Startet den taeglichen Lauf. Gibt eine Funktion zum Anhalten zurueck.
 * @returns {{stop: () => void, laeuft: boolean}}
 */
export function starteMailLogAufraeumen({
  env = process.env,
  setIntervalImpl = setInterval,
  setTimeoutImpl = setTimeout,
  clearIntervalImpl = clearInterval,
  clearTimeoutImpl = clearTimeout,
  aufraeumen = raeumeAuf,
  protokoll = console
} = {}) {
  // Ohne Objektspeicher gibt es kein Protokoll, das aelter werden koennte.
  // Dann startet auch kein Taktgeber — statt jeden Tag ins Leere zu greifen.
  if (!env.IDRIVE_E2_ENDPOINT || !env.IDRIVE_E2_BUCKET) {
    return { stop() {}, laeuft: false };
  }

  let takt = null;

  async function lauf() {
    try {
      const ergebnis = await aufraeumen({ env });
      if (!ergebnis?.ok) {
        protokoll.warn?.(`mail-zustellprotokoll: Aufraeumen fehlgeschlagen (${ergebnis?.error || "unbekannt"})`);
        return;
      }
      // Auch die Null wird gemeldet: nur so ist "es laeuft und es gibt nichts
      // zu tun" von "es laeuft gar nicht" zu unterscheiden.
      protokoll.log?.(
        `mail-zustellprotokoll: ${ergebnis.geloescht} von ${ergebnis.gefunden} Eintraegen aelter als `
        + `${AUFBEWAHRUNG_TAGE} Tage geloescht (Grenze ${ergebnis.grenzeTag})`
        + (ergebnis.unvollstaendig ? " — unvollstaendig, der naechste Lauf macht weiter" : "")
      );
    } catch (error) {
      protokoll.warn?.(`mail-zustellprotokoll: Aufraeumen abgebrochen (${String(error?.message || error).slice(0, 120)})`);
    }
  }

  const start = setTimeoutImpl(() => {
    void lauf();
    takt = setIntervalImpl(() => { void lauf(); }, TAKT_MS);
    takt?.unref?.();
  }, ERSTER_LAUF_MS);
  start?.unref?.();

  return {
    laeuft: true,
    stop() {
      clearTimeoutImpl(start);
      if (takt) clearIntervalImpl(takt);
    }
  };
}
