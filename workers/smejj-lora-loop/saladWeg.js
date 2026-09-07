// smejj.com Dauertrainings-Schleife — der Job-Weg als Ganzes.
//
// Diese Datei ist die Montage: sie setzt Trainer (saladJobTrainer.js), Messer
// (saladJobMesser.js), Datenpruefung und Versionsvergabe zu den drei
// Abhaengigkeiten zusammen, die loop.js einreicht. Sie entscheidet nichts
// selbst — jede Entscheidung liegt in einem der Module darunter.
//
// WARUM DIE VERSIONSVERGABE HIER LIEGT UND NICHT IM ZYKLUS: cycle.js kennt nur
// Zyklus-Indizes (0, 1, 2 …). Die Modellversion ist ein NAME, unter dem ein
// Adapter dauerhaft in der Ablage liegt und den ein Mensch spaeter wiederfindet.
// Wuerde der Zyklus die Namen vergeben, hiesse der erste Lauf nach jedem
// Neustart wieder "0" — und ueberschriebe den Adapter, den es schon gibt.

import { baueSaladJobMesser } from "./saladJobMesser.js";
import { baueSaladJobTrainer, clientFuer } from "./saladJobTrainer.js";

/**
 * Der Versionsname eines Zyklus. Reine Funktion.
 *
 * Der Zyklus-Index zaehlt nur GESTARTETE Laeufe hoch (loop.js#naechsterZustand),
 * nicht Takte. Zyklus 0 mit Startnummer 5 ist damit smejj-1-5, Zyklus 1 ist
 * smejj-1-6 — ohne Luecken durch Wartezeiten, und nach einem Neustart wieder
 * derselbe Name, weil der Index dauerhaft in e2 liegt.
 */
export function versionFuer(zyklusIndex, { praefix = "smejj-1-", start = 5 } = {}) {
  const index = Math.max(0, Math.floor(Number(zyklusIndex) || 0));
  return `${praefix}${start + index}`;
}

/**
 * Liegt der Datensatz bereit?
 *
 * Fail-closed und ABSICHTLICH streng: geprueft wird nicht, ob irgendein Objekt
 * unter dem Praefix liegt, sondern ob die Datei da ist, aus der train.py
 * wirklich liest. Am 2026-08-03 meldete eine Datenpruefung "vorhanden", weil
 * sie gegen eine kaputte Konfiguration fragte (bucket: undefined) — ein 404
 * beweist nichts, solange die Abfrage selbst nicht steht.
 */
export function baueDatenPruefung({ e2, datensatzName }) {
  return async function pruefeDaten() {
    if (!e2 || !datensatzName) return { vorhanden: false, gruende: ["datenpruefung_unvollstaendig"] };
    try {
      const manifest = await e2.getJson(`datasets/${datensatzName}/manifest.json`, null);
      if (!manifest) return { vorhanden: false, gruende: [`datensatz_manifest_fehlt:${datensatzName}`] };
      const zeilen = Number(manifest.zeilen ?? manifest.paare ?? manifest.count);
      if (!Number.isFinite(zeilen) || zeilen <= 0) {
        return { vorhanden: false, gruende: [`datensatz_leer:${datensatzName}`] };
      }
      return { vorhanden: true, zeilen, name: datensatzName };
    } catch (fehler) {
      // Eine Ablage, die nicht antwortet, ist kein "vermutlich schon da".
      return { vorhanden: false, gruende: [`datensatz_nicht_lesbar:${String(fehler?.message || fehler).slice(0, 120)}`] };
    }
  };
}

/**
 * Baut alle Abhaengigkeiten fuer einen Zyklus des Job-Wegs.
 *
 * Wird JE ZYKLUS neu aufgerufen, nicht einmal beim Start: Trainer und Messer
 * tragen die Versionsnummer, und die aendert sich mit jedem Zyklus. Ein einmal
 * gebauter Trainer schriebe alle Adapter unter denselben Namen.
 */
export function baueJobWeg({
  konfig,
  zyklusIndex,
  e2,
  suite,
  suiteDatei,
  client,
  warteUndStarte,
  maxTrainingMinuten = 420,
  maxMessMinuten,
  jetzt = () => new Date(),
  log = () => {}
} = {}) {
  const version = versionFuer(zyklusIndex, { praefix: konfig?.versionPraefix, start: konfig?.versionStart });
  const datensatzName = konfig?.datensatzName;
  const saladClient = client || clientFuer(konfig);

  return {
    version,
    datensatzName,
    client: saladClient,
    trainer: baueSaladJobTrainer({
      client: saladClient, e2, konfig, version, datensatzName,
      maxMinuten: maxTrainingMinuten, warteUndStarte, jetzt, log
    }),
    messe: baueSaladJobMesser({
      client: saladClient, e2, konfig, version, suite, suiteDatei,
      warteUndStarte, ...(maxMessMinuten ? { maxMinuten: maxMessMinuten } : {}), jetzt, log
    }),
    pruefeDaten: baueDatenPruefung({ e2, datensatzName })
  };
}
