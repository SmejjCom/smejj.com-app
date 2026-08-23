// smejj.com — die Läufe der Autopiloten Nr. 44-60 (Schutz, Sicherheit,
// Kosten, Wachstum, Tagesmappe), gebaut 2026-08-24 auf Betreiber-Freigabe
// ("Ja, alle 17 bauen").
//
// Eigene Datei aus demselben Grund wie autopilotSelbsttests.js und
// dienstSondenAutopilot.js: autopilotLaeufer.js stand bei 790 Zeilen, die
// 800-Zeilen-Regel lässt dort keine 17 neuen Läufe zu. Der Taktgeber bindet
// diese Liste ein — Reihenfolge und Meldeweg bleiben bei ihm.
//
// JEDER Lauf hier folgt den Hausregeln: Selbsttest mit kaputter UND gesunder
// Probe zuerst, dann echte Messung; Zahlen in der Meldung; stumme Quellen
// werden benannt, nie verschwiegen.
import { autopilotUebersicht } from "../admin/opsAutopiloten.js";
import { laufRueckRoller } from "./rueckRollerAutopilot.js";
import { laufLogWache } from "./logWacheAutopilot.js";
import { laufDatenSicherung, laufWiederherstellungsProbe } from "./datenSicherungAutopilot.js";
import { laufGeheimnisSpaeher } from "./geheimnisSpaeherAutopilot.js";
import { laufZertifikatsWache } from "./zertifikatsWacheAutopilot.js";
import { laufFehlerFaenger } from "./fehlerFaengerAutopilot.js";
import { laufMissbrauchsWache } from "./missbrauchsWacheAutopilot.js";
import { laufKontoWache } from "./kontoWacheAutopilot.js";
import { laufInhaltsSchutz } from "./inhaltsSchutzAutopilot.js";
import { laufAbhaengigkeitsWache } from "./abhaengigkeitsWacheAutopilot.js";
import { laufKostenWache } from "./kostenWacheAutopilot.js";
import { laufLastProbe } from "./lastProbeAutopilot.js";
import { laufAuffindbarkeitsWache } from "./auffindbarkeitsWacheAutopilot.js";
import { laufWillkommensWache } from "./willkommensWacheAutopilot.js";
import { laufExperimentMeister } from "./experimentMeisterAutopilot.js";
import { laufTagesmappe } from "./tagesmappeAutopilot.js";

/** Die Kennungen — für IM_LAEUFER_BETRIEBEN (Selbstheilung) und die Tests. */
export const SCHUTZ_UND_WACHSTUM_IDS = Object.freeze([
  "rueck-roller", "log-wache", "daten-sicherung", "wiederherstellungs-probe",
  "geheimnis-spaeher", "zertifikats-wache", "fehler-faenger", "missbrauchs-wache",
  "konto-wache", "inhalts-schutz", "abhaengigkeits-wache", "kosten-wache",
  "last-probe", "auffindbarkeits-wache", "willkommens-wache", "experiment-meister",
  "tagesmappe"
]);

/**
 * Liefert die [id, arbeit]-Paare für den Taktgeber.
 *
 * @param {{dateien?: Array, mitNetz?: boolean}} kontext dieselbe Dateiliste
 *   wie bei den Repo-Autopiloten (ein Lesen, mehrfach nutzen) und derselbe
 *   Netz-Schalter wie bei den Dienst-Sonden.
 */
export function baueSchutzUndWachstumLaeufe({ dateien = [], mitNetz = true } = {}) {
  return [
    // Reihenfolge mit Absicht: erst die Wachen ohne Netz (billig, immer
    // aussagekräftig), dann die getakteten Netz-Läufe. Der Rück-Roller liest
    // die Ampel und läuft darum NACH den Kern-Läufen des Taktgebers — er
    // steht hier trotzdem vorn, weil er den Stand des LETZTEN Durchgangs
    // bewertet: eine Deploy-Havarie ist nach 30 Minuten immer noch eine.
    ["rueck-roller", () => laufRueckRoller({ uebersicht: autopilotUebersicht })],
    ["log-wache", () => laufLogWache()],
    ["geheimnis-spaeher", () => laufGeheimnisSpaeher(dateien)],
    ["fehler-faenger", () => laufFehlerFaenger()],
    ["missbrauchs-wache", () => laufMissbrauchsWache()],
    ["konto-wache", () => laufKontoWache()],
    ["inhalts-schutz", () => laufInhaltsSchutz()],
    ["kosten-wache", () => laufKostenWache()],
    ["willkommens-wache", () => laufWillkommensWache()],
    ["experiment-meister", () => laufExperimentMeister()],
    ["daten-sicherung", () => laufDatenSicherung()],
    ["wiederherstellungs-probe", () => laufWiederherstellungsProbe()],
    ["tagesmappe", () => laufTagesmappe()],
    ["zertifikats-wache", () => laufZertifikatsWache({ mitNetz })],
    ["abhaengigkeits-wache", () => laufAbhaengigkeitsWache({ mitNetz })],
    ["last-probe", () => laufLastProbe({ mitNetz })],
    ["auffindbarkeits-wache", () => laufAuffindbarkeitsWache({ mitNetz })]
  ];
}
