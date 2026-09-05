// smejj.com — Deckungs-Wächter-Läufe (Nr. 66-71, 72-80), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.")
// und Audit A bis Z 2026-09-03 (Betreiber-Wahl "Runde 2: Nr. 74-82 bauen").
//
// Eigene Datei wie schutzUndWachstumLaeufe.js (800-Zeilen-Regel für den
// Autopilot-Läufer). Jeder Lauf beginnt in seinem Modul mit einem Selbsttest
// aus kaputter UND gesunder Probe (belegt in tests/deckungs-waechter.test.mjs
// und tests/runde2-waechter.test.mjs). Läufe mit Netz respektieren `mitNetz`
// (Boot-Takt ohne Netz, Tests ohne Aussenwelt).
import { laufEmailZustell } from "./emailZustellAutopilot.js";
import { laufDsgvoFristen } from "./dsgvoFristenAutopilot.js";
import { laufAiAct } from "./aiActAutopilot.js";
import { laufAboUmsatz } from "./aboUmsatzAutopilot.js";
import { laufFlaggen } from "./flaggenAutopilot.js";
import { laufUmgebungsWache } from "./umgebungsWacheAutopilot.js";
import { laufModellEvolution } from "./modellEvolutionAutopilot.js";
import { laufEinwilligungsWache } from "./einwilligungsWacheAutopilot.js";
import { laufTiefeSpurMessung } from "./tiefeSpurMessungAutopilot.js";
import { laufBauWache } from "./bauWacheAutopilot.js";
import { laufProjektwissenFrische } from "./projektwissenFrischeAutopilot.js";
import { laufSprachseitenWache } from "./sprachseitenWacheAutopilot.js";
import { laufRedTeamProbe } from "./redTeamProbeAutopilot.js";
import { laufAgentenSonde } from "./agentenSondeAutopilot.js";
import { laufBesucherPuls } from "./besucherPulsAutopilot.js";
import { laufSchutzEchtheit } from "./schutzEchtheitAutopilot.js";
import { laufSmejjVersionsTakt } from "./smejjVersionsTaktAutopilot.js";

/** Die Kennungen, damit der Läufer sie in IM_LAEUFER_BETRIEBEN aufführen kann. */
export const DECKUNG_IDS = Object.freeze([
  "email-zustell", "dsgvo-fristen", "ai-act-wache", "abo-umsatz-wache", "flaggen-wache",
  // Nr. 71 (2026-09-02): die Umgebung selbst — Zhipu-Coding-Adresse und Pflichtschluessel.
  "umgebungs-wache",
  // Nr. 72 (2026-09-03): der Modell-Evolutions-Takt — Messen, Schwaeche, Tore,
  // Protokoll je Zyklus. Wohnt hier, weil autopilotLaeufer.js bei 798 Zeilen steht.
  "modell-evolution",
  // Nr. 74-80 (Audit 03.09., Runde 2): die Luecken der Deckungs-Matrix.
  "einwilligungs-wache", "tiefe-spur-messung", "bau-wache", "projektwissen-frische",
  "sprachseiten-wache", "red-team-probe", "agenten-sonde",
  // Nr. 81 (2026-09-04): der Besucher-Puls — die fehlende Zahl im Nutzer-Trichter.
  "besucher-puls",
  // Nr. 82 (2026-09-04 abends): Schutz-Echtheit. Jede Sperre vergleicht ihr
  // Manifest mit der Arbeitskopie — beide koennen gleich und trotzdem falsch
  // sein. An diesem Tag bewachte der Start-Lock vier Fassungen, die smejj.com
  // nicht ausliefert, und meldete dabei gruen.
  "schutz-echtheit",
  // Nr. 83 (2026-09-05): der smejj-Versions-Takt — Register, Entscheidung, Alias, Rueckweg.
  "smejj-versions-takt"
]);

/** Die [kennung, lauf]-Paare für laufeAlle. */
export function baueDeckungsLaeufe({ mitNetz = true, kontenLeser = null } = {}) {
  return [
    ["email-zustell", () => laufEmailZustell()],
    ["dsgvo-fristen", () => laufDsgvoFristen()],
    ["ai-act-wache", () => laufAiAct()],
    ["abo-umsatz-wache", () => laufAboUmsatz()],
    ["flaggen-wache", () => laufFlaggen()],
    ["umgebungs-wache", () => laufUmgebungsWache()],
    // Nr. 72: laeuft VOR der Tagesmappe (schutzUndWachstumLaeufe), damit die
    // Karte im selben Takt in der Mappe liegt.
    ["modell-evolution", () => laufModellEvolution()],
    // Nr. 74: Umgebung ohne Netz, Ledger-Zaehlung nur mit Netz.
    ["einwilligungs-wache", () => laufEinwilligungsWache({ mitNetz })],
    // Nr. 75/79: Hintergrund-Messlaeufe gegen die Bruecke (taeglich), Stand aus der Ablage.
    ["tiefe-spur-messung", () => laufTiefeSpurMessung({ mitNetz })],
    ["red-team-probe", () => laufRedTeamProbe({ mitNetz })],
    ["bau-wache", () => laufBauWache({ mitNetz })],
    ["projektwissen-frische", () => laufProjektwissenFrische({ mitNetz })],
    ["sprachseiten-wache", () => laufSprachseitenWache({ mitNetz })],
    ["agenten-sonde", () => laufAgentenSonde({ mitNetz })],
    // Nr. 81: reine Speicher-Zaehlung, Ablage hoechstens alle 5 Minuten.
    ["besucher-puls", () => laufBesucherPuls({ kontenLeser })],
    // Nr. 82: liest nur oeffentliche Dateien von smejj.com und vergleicht
    // Hashes — keine Anmeldung, kein Auftrag, keine Kosten.
    ["schutz-echtheit", () => laufSchutzEchtheit({ mitNetz })],
    // Nr. 83: liest Register + Bewertungen aus der Ablage (ohne e2-Konfiguration
    // aus dem Speicher), haengt den Alias um, gibt dem Router den Stand.
    ["smejj-versions-takt", () => laufSmejjVersionsTakt()]
  ];
}
