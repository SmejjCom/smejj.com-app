// smejj.com Dauertrainings-Schleife — dauerhafter Zustand
// (Single Responsibility: Zyklus-Zaehler, Kostenzaehler und bester Stand).
//
// WARUM NICHT IM ARBEITSSPEICHER: jeder Push auf den Arbeits-Branch loest einen
// Neubau aus und ersetzt den Container (gemessene Falle des Projekts). Laege
// der Kostenzaehler nur im Prozess, faenge er nach jedem Deploy wieder bei null
// an — der Gesamtdeckel waere damit kein Deckel, sondern eine Bitte.
//
// Verwendet die allgemeinen IDrive-Zugangsdaten, NICHT die
// einwilligungsgebundenen Trainingsdaten-Zugaenge: hier stehen nur Zaehler und
// Kennzahlen, nie Trainingsinhalte.

import { idriveConfigFromEnv } from "../maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../glm-salad/s3.js";

export function standardZustand() {
  return Object.freeze({
    version: 1,
    zyklusIndex: 0,
    verbrauchtUsd: 0,
    letzterZyklusAm: null,
    zyklenGestartet: 0,
    zyklenAbgebrochen: 0,
    letzteGruende: []
  });
}

/**
 * Liest den Zustand. Ein Lesefehler gibt NICHT den Standardwert zurueck,
 * sondern meldet den Fehlschlag — anders als beim Eval-Loop, wo ein verlorener
 * Checkpoint nur einen doppelten Messlauf kostet. Hier steht der Kostenzaehler
 * drin: ihn stillschweigend auf 0 zu setzen wuerde den Deckel aufheben.
 * Der Aufrufer behandelt `ok: false` als Sperrgrund.
 */
export async function leseZustand({ env = process.env, key, idriveConfig, request = signedS3Request } = {}) {
  try {
    const config = idriveConfig || idriveConfigFromEnv(env);
    const body = await request(config, "GET", key);
    return { ok: true, zustand: Object.freeze({ ...standardZustand(), ...JSON.parse(body) }) };
  } catch (error) {
    const meldung = String(error?.message || error);
    // Ein 404 beim allerersten Start ist kein Fehler, sondern der Normalfall.
    if (/_404/.test(meldung)) return { ok: true, zustand: standardZustand(), ersterStart: true };
    return { ok: false, zustand: standardZustand(), fehler: meldung.slice(0, 160) };
  }
}

/**
 * Schreibt den Zustand. Ein Schreibfehler ist hier ebenfalls ernst: der
 * naechste Start wuerde mit einem zu niedrigen Kostenzaehler weiterrechnen.
 * Deshalb Rueckgabewert statt stillem Schlucken.
 */
/**
 * Abstaende der Schreibversuche. Der Kostenzaehler ist die Grundlage des
 * Deckels — ein verlorener Schreibvorgang macht ihn nach einem Neustart zu
 * niedrig, und dann greift die Geldbremse zu spaet.
 *
 * GEMESSEN AM 2026-08-05/06: zweimal in Folge `abgelegt=false`, jeweils
 * zeitgleich mit einem fehlgeschlagenen Trainer-Aufruf. Beide Gegenstellen
 * waren Minuten spaeter tadellos erreichbar (IDrive 0,19-0,32 s) — es sind
 * kurze Aussetzer der lokalen Leitung, keine Stoerung der Gegenstelle.
 * Danach klafften Schleife (0,9145 USD) und IDrive (0,7234 USD) auseinander.
 *
 * Ein einzelner Versuch ist fuer einen Wert, an dem eine Geldbremse haengt,
 * zu wenig.
 */
const SCHREIB_VERSUCHE_MS = [0, 1500, 4000];

export async function schreibeZustand(zustand, { env = process.env, key, idriveConfig, request = signedS3Request, warte = (ms) => new Promise((f) => setTimeout(f, ms)) } = {}) {
  let letzter = null;
  for (const pause of SCHREIB_VERSUCHE_MS) {
    if (pause) await warte(pause);
    try {
      const config = idriveConfig || idriveConfigFromEnv(env);
      await request(config, "PUT", key, `${JSON.stringify(zustand, null, 2)}\n`, "application/json; charset=utf-8");
      return true;
    } catch (fehler) {
      letzter = fehler;
    }
  }
  // Der Aufrufer meldet das laut. Hier bleibt es bei `false`: eine Ausnahme
  // wuerde den Zyklus reissen, und der Zaehler im Speicher stimmt ja noch.
  return false;
}

export async function leseBestenStand({ env = process.env, key, idriveConfig, request = signedS3Request } = {}) {
  try {
    const config = idriveConfig || idriveConfigFromEnv(env);
    return JSON.parse(await request(config, "GET", key));
  } catch {
    // Kein bester Stand = es gab noch keinen. Der erste erfolgreiche Zyklus
    // wird dann automatisch der Beste (siehe sweep.js#istNeuerBester).
    return null;
  }
}

/**
 * Legt einen neuen besten Stand ab.
 *
 * Wichtig: das ist KEINE Befoerderung. Der Eintrag sagt nur "von allen bisher
 * probierten Konfigurationen war diese die beste". Ob das Modell Nutzer sieht,
 * entscheidet src/evaluation/modelPromotion.js und dort ein Mensch.
 */
export async function schreibeBestenStand(stand, { env = process.env, key, idriveConfig, request = signedS3Request } = {}) {
  try {
    const config = idriveConfig || idriveConfigFromEnv(env);
    const koerper = { ...stand, promotionStatus: "not-approved", schemaVersion: 1 };
    await request(config, "PUT", key, `${JSON.stringify(koerper, null, 2)}\n`, "application/json; charset=utf-8");
    return true;
  } catch {
    return false;
  }
}
