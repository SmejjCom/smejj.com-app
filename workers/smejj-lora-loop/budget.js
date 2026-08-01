// smejj.com Dauertrainings-Schleife — Kosten-Tor und Notaus
// (Single Responsibility: darf JETZT GPU-Zeit gekauft werden, ja oder nein).
//
// Das ist der sicherheitskritische Teil dieser Schleife. Alles andere kostet
// bei einem Fehler Zeit; dieses Modul kostet bei einem Fehler Geld, und zwar
// unbeaufsichtigt rund um die Uhr.
//
// Vier voneinander unabhaengige Bremsen, jede fuer sich ausreichend:
//   1. FREIGABE-TOR    — ohne hinterlegte schriftliche Betreiber-Freigabe mit
//                        GPU-Klasse und Monatsbetrag startet nichts. Das ist
//                        die Rote-Liste-Regel des Auftrags, maschinell erzwungen.
//   2. GESAMTDECKEL    — harte Obergrenze in USD ueber die ganze Kampagne.
//                        Verbrauch wird dauerhaft mitgeschrieben, nicht im
//                        Arbeitsspeicher (ein Neustart darf den Zaehler nicht
//                        auf null setzen — sonst ist der Deckel wirkungslos).
//   3. LAUFZEITDECKEL  — je Zyklus. Ein haengender Trainingslauf darf nicht
//                        unbemerkt stundenlang Karte belegen.
//   4. NOTAUS          — ein Schalter, der sofort sperrt und den Container
//                        beendet, unabhaengig von allem anderen.
//
// Bewusst NICHT hier: die automatische Aufladung des Salad-Guthabens. Sie
// bleibt aus. Das leere Guthaben ist die letzte, vom Anbieter erzwungene
// Bremse, und die soll scharf bleiben.

/**
 * Preise je GPU-Stunde. Gemessen im Salad-Konto des Betreibers am 2026-08-01.
 * Kein Schaetzwert und kein Listenpreis aus dem Netz — wenn Salad die Preise
 * aendert, MUSS diese Tabelle nachgemessen werden, sonst rechnet der Deckel
 * mit falschen Zahlen und haelt nicht, was er verspricht.
 */
export const GPU_PREISE_USD_PRO_STUNDE = Object.freeze({
  "rtx3090": 0.25,
  "rtxa5000": 0.25,
  "rtx4090": 0.30,
  "rtx5090": 0.45
});

/** VRAM je Klasse — fuer die Vorpruefung, ob das Basismodell ueberhaupt passt. */
export const GPU_VRAM_GB = Object.freeze({
  "rtx3090": 24,
  "rtxa5000": 24,
  "rtx4090": 24,
  "rtx5090": 32
});

export const STUNDEN_PRO_MONAT = 24 * 30;

function positiveZahl(wert) {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

function flagJa(env, name) {
  return String(env?.[name] || "NO").trim().toUpperCase() === "YES";
}

/** Monatskosten bei Dauerbetrieb — die Zahl, die dem Betreiber genannt wird. */
export function monatskostenUsd(gpuKlasse) {
  const preis = GPU_PREISE_USD_PRO_STUNDE[String(gpuKlasse || "").toLowerCase()];
  return preis ? Number((preis * STUNDEN_PRO_MONAT).toFixed(2)) : 0;
}

/**
 * Wie lange das vorhandene Guthaben bei Dauerbetrieb reicht. Der Auftrag
 * verlangt ausdruecklich, das dem Betreiber VOR dem Start vorzurechnen.
 */
export function reichweiteTage(gpuKlasse, guthabenUsd) {
  const preis = GPU_PREISE_USD_PRO_STUNDE[String(gpuKlasse || "").toLowerCase()];
  const guthaben = positiveZahl(guthabenUsd);
  if (!preis || !guthaben) return 0;
  return Number((guthaben / (preis * 24)).toFixed(1));
}

/**
 * Liest die Kostengrenzen aus der Umgebung.
 *
 * `freigabeId` traegt die Referenz der schriftlichen Freigabe. Sie wird nicht
 * inhaltlich geprueft — das kann Software nicht —, aber ihr FEHLEN sperrt.
 * Zusammen mit `freigabeGpuKlasse` und `freigabeMonatsbetragUsd` erzwingt das,
 * dass die Freigabe die im Auftrag geforderten Angaben wirklich enthielt.
 */
export function leseKostengrenzen(env = process.env) {
  const gpuKlasse = String(env.SMEJJ_LORA_GPU_KLASSE || "").trim().toLowerCase();
  const grenzen = {
    gpuKlasse,
    preisProStundeUsd: GPU_PREISE_USD_PRO_STUNDE[gpuKlasse] || 0,
    vramGb: GPU_VRAM_GB[gpuKlasse] || 0,
    maxGesamtUsd: positiveZahl(env.SMEJJ_LORA_MAX_USD_GESAMT),
    maxZyklusMinuten: positiveZahl(env.SMEJJ_LORA_MAX_ZYKLUS_MINUTEN),
    maxZyklen: positiveZahl(env.SMEJJ_LORA_MAX_ZYKLEN),
    freigabeId: String(env.SMEJJ_LORA_FREIGABE_ID || "").trim(),
    freigabeGpuKlasse: String(env.SMEJJ_LORA_FREIGABE_GPU_KLASSE || "").trim().toLowerCase(),
    freigabeMonatsbetragUsd: positiveZahl(env.SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD),
    notaus: flagJa(env, "SMEJJ_LORA_NOTAUS")
  };

  const fehlend = [
    !grenzen.gpuKlasse && "SMEJJ_LORA_GPU_KLASSE",
    grenzen.gpuKlasse && !grenzen.preisProStundeUsd && `SMEJJ_LORA_GPU_KLASSE:unbekannte_klasse:${grenzen.gpuKlasse}`,
    !grenzen.maxGesamtUsd && "SMEJJ_LORA_MAX_USD_GESAMT",
    !grenzen.maxZyklusMinuten && "SMEJJ_LORA_MAX_ZYKLUS_MINUTEN"
  ].filter(Boolean);

  return Object.freeze({ ...grenzen, vollstaendig: fehlend.length === 0, fehlend: Object.freeze(fehlend) });
}

/**
 * Prueft die schriftliche Freigabe. Getrennt vom Kostendeckel, weil es zwei
 * verschiedene Fragen sind: "darf ueberhaupt Geld ausgegeben werden" und
 * "wie viel". Ein gesetzter Deckel ohne Freigabe ist kein Startgrund.
 *
 * Die Freigabe muss zur tatsaechlich gebuchten GPU-Klasse passen. Eine Freigabe
 * fuer eine RTX 3090 (180 USD/Monat) deckt keine RTX 5090 (324 USD/Monat) —
 * das waere fast das Doppelte ohne Zustimmung.
 */
export function pruefeFreigabe(grenzen) {
  const gruende = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{5,120}$/.test(grenzen.freigabeId)) {
    gruende.push("freigabe_fehlt:SMEJJ_LORA_FREIGABE_ID");
  }
  if (!grenzen.freigabeGpuKlasse) {
    gruende.push("freigabe_ohne_gpu_klasse");
  } else if (grenzen.freigabeGpuKlasse !== grenzen.gpuKlasse) {
    gruende.push(`freigabe_gpu_klasse_abweichend:${grenzen.freigabeGpuKlasse}!=${grenzen.gpuKlasse}`);
  }
  if (!grenzen.freigabeMonatsbetragUsd) {
    gruende.push("freigabe_ohne_monatsbetrag");
  } else {
    const tatsaechlich = monatskostenUsd(grenzen.gpuKlasse);
    // Toleranz nach oben: der freigegebene Betrag muss die echten Kosten
    // decken. Ist er kleiner, wurde etwas anderes freigegeben als gebucht wird.
    if (tatsaechlich && grenzen.freigabeMonatsbetragUsd + 0.01 < tatsaechlich) {
      gruende.push(`freigabe_monatsbetrag_zu_klein:${grenzen.freigabeMonatsbetragUsd}<${tatsaechlich}`);
    }
  }
  return { freigegeben: gruende.length === 0, gruende };
}

/**
 * Die eigentliche Entscheidung vor jedem Zyklus.
 *
 * @param {object} eingabe
 * @param {object} eingabe.grenzen        aus leseKostengrenzen
 * @param {number} eingabe.verbrauchtUsd  bisher verbraucht (aus dem dauerhaften Checkpoint)
 * @param {number} eingabe.zyklenBisher
 * @param {boolean} eingabe.datenVorhanden  ohne Datensatz keine GPU (Auftrag: "Kaufe keine Rechenzeit, bevor Daten da sind")
 * @param {boolean} eingabe.trainerErreichbar
 */
export function darfZyklusStarten({
  grenzen,
  verbrauchtUsd = 0,
  zyklenBisher = 0,
  datenVorhanden = false,
  trainerErreichbar = false
} = {}) {
  const gruende = [];

  // Notaus zuerst und ohne Ausnahme.
  if (grenzen?.notaus) gruende.push("notaus_aktiv");

  if (!grenzen?.vollstaendig) {
    for (const fehlend of grenzen?.fehlend || ["grenzen_fehlen"]) gruende.push(`kostengrenze_fehlt:${fehlend}`);
  }

  const freigabe = pruefeFreigabe(grenzen || {});
  if (!freigabe.freigegeben) gruende.push(...freigabe.gruende);

  const verbraucht = Math.max(0, Number(verbrauchtUsd) || 0);
  const deckel = grenzen?.maxGesamtUsd || 0;
  const restUsd = deckel ? Number((deckel - verbraucht).toFixed(4)) : 0;

  // Ein Zyklus muss VOLLSTAENDIG ins Restbudget passen. Ihn zu starten und
  // mitten im Lauf am Deckel abzubrechen kostet dasselbe Geld und liefert
  // nichts — der abgebrochene Lauf hat kein messbares Ergebnis.
  const zykluskostenUsd = geschaetzteZykluskostenUsd(grenzen);
  if (deckel && restUsd < zykluskostenUsd) {
    gruende.push(`budget_erschoepft:rest=${restUsd}<zyklus=${zykluskostenUsd}`);
  }

  if (grenzen?.maxZyklen && zyklenBisher >= grenzen.maxZyklen) {
    gruende.push(`zyklus_obergrenze_erreicht:${zyklenBisher}>=${grenzen.maxZyklen}`);
  }

  // Beide fail-closed: ohne Daten und ohne erreichbaren Dienst wird nichts
  // geraten und nichts gekauft.
  if (!datenVorhanden) gruende.push("keine_trainingsdaten");
  if (!trainerErreichbar) gruende.push("trainer_nicht_erreichbar");

  return {
    darfStarten: gruende.length === 0,
    gruende,
    restUsd,
    zykluskostenUsd,
    verbrauchtUsd: verbraucht
  };
}

/** Was ein Zyklus im schlimmsten Fall kostet: volle Laufzeitgrenze mal Stundenpreis. */
export function geschaetzteZykluskostenUsd(grenzen) {
  const preis = grenzen?.preisProStundeUsd || 0;
  const minuten = grenzen?.maxZyklusMinuten || 0;
  if (!preis || !minuten) return 0;
  return Number(((minuten / 60) * preis).toFixed(4));
}

/** Tatsaechliche Kosten eines gelaufenen Zyklus. */
export function tatsaechlicheKostenUsd(grenzen, gelaufeneMinuten) {
  const preis = grenzen?.preisProStundeUsd || 0;
  const minuten = Math.max(0, Number(gelaufeneMinuten) || 0);
  return Number(((minuten / 60) * preis).toFixed(4));
}

/**
 * Muss der Container JETZT beendet werden?
 *
 * Getrennt von darfZyklusStarten, weil es die andere Richtung ist: nicht "darf
 * ein neuer Lauf beginnen", sondern "muss ein laufender sofort enden". Ein
 * Notaus oder ein gerissener Deckel darf nicht bis zum naechsten Takt warten.
 */
export function mussNotausAusloesen({ grenzen, verbrauchtUsd = 0, laufendeMinuten = 0 } = {}) {
  const gruende = [];
  if (grenzen?.notaus) gruende.push("notaus_aktiv");
  const deckel = grenzen?.maxGesamtUsd || 0;
  if (deckel && Number(verbrauchtUsd) >= deckel) gruende.push(`gesamtdeckel_erreicht:${verbrauchtUsd}>=${deckel}`);
  const maxMinuten = grenzen?.maxZyklusMinuten || 0;
  if (maxMinuten && Number(laufendeMinuten) > maxMinuten) {
    gruende.push(`zykluslaufzeit_ueberschritten:${laufendeMinuten}>${maxMinuten}`);
  }
  return { notaus: gruende.length > 0, gruende };
}
