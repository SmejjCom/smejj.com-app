// smejj.com — Modul W: Tagesprojektion im Autopilot-Takt frisch halten
// (Single Responsibility: WANN die Analytik-Projektion neu gezaehlt wird).
//
// BEFUND 15.09. (Live-Audit Adminbereich): "Tagesprojektion 15229 min alt",
// 0 Laeufe und 0 Mails — obwohl am 08.09. ein Lauf lag und 100 Mails in 14
// Tagen zugestellt wurden. Die Projektion hatte KEINEN Erbauer ausser dem
// Seitenaufruf selbst: neu gezaehlt wurde nur, wenn jemand /admin/analytik/
// oeffnete, und dann im Hintergrund, dessen Ergebnis niemand ansah — ein
// `ok:false` des Neubaus verschwand spurlos. Die Seite zeigte weiter den alten
// Stand und fuer alle Tage danach eine 0.
//
// Deshalb zaehlt jetzt der vorhandene Autopilot-Takt (autopilotTaktstart.js,
// alle 30 Minuten) neu, sobald die Projektion aelter als TAKT_AB_SEKUNDEN ist.
// Kein neuer Dienst, keine neuen Kosten: vier Auflistungen je Stunde auf
// IDrive e2, ein Objekt von rund 1 KB. Scheitert der Neubau, steht der Grund
// im Log und in der Analytik-Antwort (letzterNeubauStand).
import { baueProjektion, leseProjektion } from "./analytikProjektion.js";
import { zaehleAnalytikQuellen } from "./opsAnalytik.js";

/** Knapp unter zwei Takten: bei 30 Minuten Takt wird etwa stuendlich gezaehlt. */
export const TAKT_AB_SEKUNDEN = 50 * 60;

/**
 * Baut die Projektion neu, wenn sie fehlt oder zu alt ist. Wirft nie.
 * @returns {Promise<{ok:boolean, gebaut:boolean, grund?:string, alterSekunden?:number|null, gebautAm?:string}>}
 */
export async function halteAnalytikFrisch({
  env = process.env,
  jetztMs = Date.now(),
  fetchImpl = fetch,
  abSekunden = TAKT_AB_SEKUNDEN,
  lese = leseProjektion,
  baue = baueProjektion,
  zaehle = zaehleAnalytikQuellen
} = {}) {
  try {
    // Ohne Lesedurchgriff: der Takt soll den Stand auf IDrive e2 sehen, nicht
    // den, den diese Instanz vor zwanzig Sekunden gemerkt hat.
    const vorhanden = await lese({ env, fetchImpl, jetztMs, leseCacheMs: 0 });
    if (!vorhanden.ok && vorhanden.error === "speicher_nicht_eingerichtet") {
      return { ok: false, gebaut: false, grund: "speicher_nicht_eingerichtet" };
    }
    const alter = Number(vorhanden.alterSekunden);
    if (vorhanden.ok && Number.isFinite(alter) && alter < abSekunden) {
      return { ok: true, gebaut: false, alterSekunden: alter };
    }
    const gebaut = await baue({
      env, fetchImpl, jetztMs,
      zaehleAlles: () => zaehle({ env, jetztMs, fetchImpl })
    });
    return gebaut.ok
      ? { ok: true, gebaut: true, gebautAm: gebaut.gebautAm }
      : { ok: false, gebaut: false, grund: String(gebaut.error || "unbekannt").slice(0, 120) };
  } catch (error) {
    return { ok: false, gebaut: false, grund: String(error?.message || "ausnahme").slice(0, 120) };
  }
}
