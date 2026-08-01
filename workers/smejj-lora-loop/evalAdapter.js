// smejj.com Dauertrainings-Schleife — Messung eines frisch trainierten Standes
// (Single Responsibility: Zyklus-Ergebnis gegen die BESTEHENDE Pruefsuite messen).
//
// Ruft bewusst runEvalCycle aus workers/smejj-training-loop/evalCycle.js auf,
// also dieselbe Strecke wie `npm run eval:models:live` und wie der laufende
// Eval-Zyklus. Der Auftrag verbietet ausdruecklich, die Suite zu lockern,
// Schwellen zu verschieben oder Faelle zu entfernen — der sicherste Schutz
// dagegen ist, gar keine zweite Messimplementierung zu besitzen.
//
// Die Suite wird immer aus der lokalen, im Abbild mitgelieferten,
// git-verwalteten Datei gelesen. Kaeme sie ueber das Netz, koennte ein
// veraenderter Ablage-Inhalt die Messlatte senken, ohne dass es im Code
// sichtbar waere.

import { runEvalCycle } from "../smejj-training-loop/evalCycle.js";

/**
 * Baut die `messe`-Funktion, die cycle.js einreicht.
 *
 * WICHTIG — die Wiederholungen: eine Einzelziehung je Fall streut um bis zu
 * 12 Prozentpunkte (temperature 0.35, Beleg im Task Capsule
 * job_einbruch_aufklaerung_20260731). Ein Zyklus, der einmal misst, wuerde
 * Rauschen als Fortschritt oder Rueckschritt verbuchen und die Bestenliste
 * mit Zufall fuellen. Deshalb wird `wiederholungen` durchgereicht und nicht
 * auf 1 gesetzt, auch wenn das jeden Zyklus laenger macht.
 */
export function baueMesser({ config, repoRoot, log = () => {} }) {
  return async function messe({ konfiguration, messEndpunkt }) {
    if (!messEndpunkt) {
      // Ohne Adresse gibt es nichts zu messen. Fail-closed: kein geschaetztes
      // Ergebnis, keine Uebernahme in die Bestenliste.
      return { ok: false, gruende: ["kein_mess_endpunkt"] };
    }
    try {
      const ergebnis = await runEvalCycle({
        repoRoot,
        suitePath: config.suitePath,
        // Der Vergleich mit dem bisher Besten passiert in sweep.js#istNeuerBester,
        // nicht ueber den Regressions-Vergleich der Suite: hier wird jeder
        // Kandidat gegen DIESELBE Latte gemessen, nicht gegen seinen Vorgaenger.
        baseline: null,
        modelId: `smejj-1-0-${konfiguration?.kennung || "kandidat"}`,
        chatEndpoint: messEndpunkt,
        delayMs: config.evalDelayMs,
        wiederholungen: config.evalWiederholungen,
        // Kein Bericht in die Ablage: der Verlauf der Schleife fuehrt die
        // Kennzahlen, und ein Bericht je Zyklus wuerde die Ablage zumuellen.
        writeReport: async () => {},
        reportTarget: `ops/smejj-lora-loop/kandidaten/${konfiguration?.kennung || "kandidat"}.json`,
        log
      });
      if (!ergebnis.ok) return { ok: false, gruende: [ergebnis.reason || "messung_abgelehnt"] };
      return { ok: true, kennzahlen: ergebnis.kennzahlen, urteil: ergebnis.verdict };
    } catch (error) {
      return { ok: false, gruende: [`messung_fehler:${String(error?.message || error).slice(0, 120)}`] };
    }
  };
}

/**
 * Prueft, ob ueberhaupt ein Datensatz da ist.
 *
 * Der Auftrag ist an dieser Stelle unmissverstaendlich: "Ohne Daten ist eine
 * GPU nutzlos. Kaufe keine Rechenzeit, bevor Daten da sind." Diese Funktion ist
 * die maschinelle Fassung dieses Satzes. Sie prueft die ANWESENHEIT des
 * Manifests, nicht seinen Inhalt — der Inhalt wurde bereits beim Bau des
 * Korpus geprueft (src/training/opencorpus/corpus.js).
 */
/**
 * Standard-Manifestleser gegen IDrive e2. Getrennt von baueDatenPruefung, damit
 * Tests die Ablage ersetzen koennen, ohne Zugangsdaten zu brauchen.
 */
export function baueManifestLeser({ env = process.env, idriveConfig, request } = {}) {
  return async function leseManifest(schluessel) {
    const [{ idriveConfigFromEnv }, { signedS3Request }] = await Promise.all([
      import("../maus-engine/artifact-uploader.mjs"),
      import("../glm-salad/s3.js")
    ]);
    const config = idriveConfig || idriveConfigFromEnv(env);
    const anfrage = request || signedS3Request;
    return JSON.parse(await anfrage(config, "GET", schluessel));
  };
}

export function baueDatenPruefung({ config, leseManifest }) {
  return async function pruefeDaten() {
    if (!config.datensatz.schluessel || !config.datensatz.manifestSchluessel) {
      return { vorhanden: false, gruende: ["datensatz_nicht_konfiguriert"] };
    }
    if (typeof leseManifest !== "function") {
      return { vorhanden: false, gruende: ["manifest_leser_fehlt"] };
    }
    try {
      const manifest = await leseManifest(config.datensatz.manifestSchluessel);
      const anzahlTrain = Number(manifest?.proSplit?.train) || 0;
      if (anzahlTrain <= 0) return { vorhanden: false, gruende: ["korpus_ohne_trainingsanteil"] };
      return { vorhanden: true, anzahlTrain, gruende: [] };
    } catch (error) {
      return { vorhanden: false, gruende: [`manifest_nicht_lesbar:${String(error?.message || error).slice(0, 100)}`] };
    }
  };
}
