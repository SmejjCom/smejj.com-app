// smejj.com — Deckungs-Wächter-Läufe (Nr. 66-70), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// Eigene Datei wie schutzUndWachstumLaeufe.js (800-Zeilen-Regel für den
// Autopilot-Läufer): die fünf Läufe der Abdeckungs-Lücken — Mail-Zustellung,
// DSGVO-Fristen, EU-AI-Act, Abos, Flags. Alles reine Lese-Läufe ohne externen
// Netz-Schalter; jeder beginnt in seinem Modul mit einem Selbsttest aus
// kaputter UND gesunder Probe (belegt in tests/deckungs-waechter.test.mjs).
import { laufEmailZustell } from "./emailZustellAutopilot.js";
import { laufDsgvoFristen } from "./dsgvoFristenAutopilot.js";
import { laufAiAct } from "./aiActAutopilot.js";
import { laufAboUmsatz } from "./aboUmsatzAutopilot.js";
import { laufFlaggen } from "./flaggenAutopilot.js";
import { laufUmgebungsWache } from "./umgebungsWacheAutopilot.js";
import { laufModellEvolution } from "./modellEvolutionAutopilot.js";

/** Die Kennungen, damit der Läufer sie in IM_LAEUFER_BETRIEBEN aufführen kann. */
export const DECKUNG_IDS = Object.freeze([
  "email-zustell", "dsgvo-fristen", "ai-act-wache", "abo-umsatz-wache", "flaggen-wache",
  // Nr. 71 (2026-09-02): die Umgebung selbst — Zhipu-Coding-Adresse und Pflichtschluessel.
  "umgebungs-wache",
  // Nr. 72 (2026-09-03): der Modell-Evolutions-Takt — Messen, Schwaeche, Tore,
  // Protokoll je Zyklus. Wohnt hier, weil autopilotLaeufer.js bei 798 Zeilen steht.
  "modell-evolution"
]);

/** Die [kennung, lauf]-Paare für laufeAlle — ohne Argumente, ohne Netz-Schalter. */
export function baueDeckungsLaeufe() {
  return [
    ["email-zustell", () => laufEmailZustell()],
    ["dsgvo-fristen", () => laufDsgvoFristen()],
    ["ai-act-wache", () => laufAiAct()],
    ["abo-umsatz-wache", () => laufAboUmsatz()],
    ["flaggen-wache", () => laufFlaggen()],
    ["umgebungs-wache", () => laufUmgebungsWache()],
    // Nr. 72: laeuft VOR der Tagesmappe (schutzUndWachstumLaeufe), damit die
    // Karte im selben Takt in der Mappe liegt.
    ["modell-evolution", () => laufModellEvolution()]
  ];
}
