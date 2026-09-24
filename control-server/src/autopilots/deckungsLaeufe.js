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
import { laufWebhookWache } from "./webhookWacheAutopilot.js";
import { laufDnsWache } from "./dnsWacheAutopilot.js";
import { laufMesslatte } from "./messlatteAutopilot.js";
import { fuehreRadarLaufAus, radarStand } from "./aiRadarAutopilot.js";

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
  "smejj-versions-takt",
  // Nr. 84 (2026-09-05): die Webhook- und Smee-Wache. Prueft die Strecke des
  // ZWEITEN Weges — und dass der eigene Eingang Fremde abweist. Ein oeffentlich
  // erreichbares Tor waere schlimmer als ein ausgefallener Zweitweg.
  "webhook-wache",
  // smejj ai radar (2026-09-21): die zweite Schiene — Internetrecherche und
  // Wissensbasis, getrennt von der Trainingsschiene.
  "smejj-ai-radar",
  // Nr. 87 (2026-09-22): die DNS-Wache. Am 21.09. war smejj.com ~8 min nicht
  // aufloesbar (Nameserver des Anbieters), die Seite lief, keine Ampel sah es.
  "dns-wache",
  // Nr. 88 (2026-09-24): die Messlatte — woechentlich Radar-Wissen der Vorwoche
  // und goldene Fragen ueber den Nutzerweg, mit Vorwochenvergleich.
  "messlatte"
]);

/**
 * smejj ai radar (Spur 2, Betreiber-Auftrag 21.09.2026): recherchiert im Takt,
 * prueft die Quellen und erweitert die Wissensbasis. Ohne Netz meldet er nur
 * den gemessenen Stand — er behauptet nie einen Lauf, den es nicht gab.
 *
 * Der Radar entscheidet SELBST, ob er faellig ist (Themen-Intervalle) und ob er
 * darf (Budget, Notaus). Der Laeufer ist nur der Taktgeber.
 */
export async function laufAiRadar({ mitNetz = true, stand = radarStand, lauf = fuehreRadarLaufAus } = {}) {
  const jetzt = await stand().catch((f) => ({ fehler: String(f?.message || f).slice(0, 80) }));
  if (jetzt?.fehler) return { ok: false, meldung: `smejj ai radar: Stand nicht lesbar (${jetzt.fehler})` };
  if (!jetzt.laeufeLesbar || !jetzt.wissenLesbar) {
    return { ok: false, meldung: "smejj ai radar: Ablage nicht lesbar — es wird nichts recherchiert (fail-closed)" };
  }
  const kopf = `Wissen ${jetzt.wissenAktiv}/${jetzt.wissenGesamt} aktiv, heute ${jetzt.verbrauch?.anfragenHeute ?? "?"} von ${jetzt.grenzen.anfragenJeTag} Anfragen`;
  if (!jetzt.eingeschaltet) return { ok: true, meldung: `smejj ai radar ist AUS (Betreiber-Schalter); ${kopf}` };
  if (jetzt.zustand === "pausiert") return { ok: true, meldung: `smejj ai radar pausiert (${jetzt.grund || "ohne Grund"}); ${kopf}` };
  if (!mitNetz) return { ok: true, meldung: `smejj ai radar bereit; ${kopf}` };
  if (jetzt.naechsteFaelligkeitAm) {
    return { ok: true, meldung: `smejj ai radar wartet bis ${jetzt.naechsteFaelligkeitAm.slice(0, 16).replace("T", " ")} UTC; ${kopf}` };
  }

  const ergebnis = await lauf({ grund: "takt" });
  if (!ergebnis.ok) return { ok: false, meldung: `smejj ai radar kam nicht zum Zug: ${ergebnis.grund}; ${kopf}` };
  // Dem Nutzer gewichen: ehrlich benennen statt "0 Anfrage(n) zu keins" (23.09.2026).
  if (ergebnis.grund === "nutzer_hat_vorrang" || ergebnis.grund === "schonfrist_nach_nutzeranfrage") {
    return { ok: true, meldung: `smejj ai radar verschoben — ${ergebnis.grund === "nutzer_hat_vorrang" ? "ein Mensch arbeitet gerade" : "Schonfrist nach einer Nutzeranfrage"}; ${kopf}` };
  }
  const gespeichert = ergebnis.gespeicherteIds.length;
  const themen = ergebnis.themen.map((t) => t.titel).join(", ") || "keins";
  return {
    ok: true,
    meldung: `smejj ai radar: ${ergebnis.anfragen} Anfrage(n) zu ${themen}; `
      + `${ergebnis.quellenGeprueft} Quellen geprueft, ${gespeichert} Erkenntnis(se) gespeichert`
  };
}

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
    // smejj ai radar (Spur 2): recherchiert nur, wenn ein Thema faellig ist und
    // das Budget es hergibt — die Entscheidung liegt im Radar selbst.
    ["smejj-ai-radar", () => laufAiRadar({ mitNetz })],
    // Nr. 83: liest Register + Bewertungen aus der Ablage (ohne e2-Konfiguration
    // aus dem Speicher), haengt den Alias um, gibt dem Router den Stand.
    ["smejj-versions-takt", () => laufSmejjVersionsTakt()],
    // Nr. 84: fragt den Gesundheitsbericht des Smee-Dienstes und klopft am
    // eigenen Eingang — ohne gueltigen Beweis, er MUSS abweisen. Keine
    // Testereignisse durch den echten Webhook-Weg.
    ["webhook-wache", () => laufWebhookWache({ mitNetz })],
    // Nr. 87: fragt die zwei Nameserver direkt und Google-DNS (DNSSEC), vergleicht
    // mit dem eingefrorenen Soll — nur Lesen, keine Kosten, kein neuer Anbieter.
    ["dns-wache", () => laufDnsWache({ mitNetz })],
    // Nr. 88: Hintergrund-Messlaeufe gegen die Bruecke (woechentlich), Stand aus der Ablage.
    ["messlatte", () => laufMesslatte({ mitNetz })]
  ];
}
