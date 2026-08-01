// smejj.com Dauertrainings-Schleife — EIN Zyklus
// (Single Responsibility: Konfiguration -> Training -> Messung -> behalten oder verwerfen).
//
// Ein Zyklus ist die Einheit, in der Geld ausgegeben wird. Er ist deshalb so
// gebaut, dass jeder Ausstieg vor dem Start kostenlos ist und jeder Ausstieg
// nach dem Start die Karte nachweislich beendet.
//
// Der Ablauf folgt genau den fuenf Schritten des Auftrags:
//   1. Konfiguration systematisch waehlen (sweep.js)
//   2. LoRA-Feintuning auf dem Basismodell (trainerClient.js)
//   3. Gegen die BESTEHENDE Pruefsuite messen, mehrfach je Fall
//   4. Besser als der beste Stand? behalten, sonst verwerfen und protokollieren
//   5. Ergebnis in den Verlauf
//
// Schritt 3 ruft bewusst dieselbe Messstrecke wie `npm run eval:models:live`
// auf (ueber die eingereichte `messe`-Funktion, die workers/smejj-training-loop/
// evalCycle.js kapselt). Eine zweite Messimplementierung waere die sicherste
// Art, sich die Zahlen schoenzurechnen.

import {
  darfZyklusStarten,
  mussNotausAusloesen,
  tatsaechlicheKostenUsd
} from "./budget.js";
import { gitterErschoepft, istNeuerBester, konfigurationFuer } from "./sweep.js";
import { brichTrainingAb, starteTraining, trainerErreichbar, trainingZustand } from "./trainerClient.js";

const ABFRAGE_ABSTAND_MS = 30_000;

function jetztMinuten(start, jetzt) {
  return (jetzt().getTime() - start) / 60_000;
}

/**
 * Fuehrt einen Zyklus aus.
 *
 * Alle Aussenkontakte sind einreichbar, damit die Tests jeden Ausgang
 * durchspielen koennen, ohne eine GPU zu mieten.
 */
export async function fuehreZyklusAus({
  grenzen,
  zyklusIndex,
  verbrauchtUsd = 0,
  besterStand = null,
  basismodell,
  datensatz,
  trainerBasisUrl,
  trainerApiKey,
  maxRunden = 3,
  // Einreichbare Abhaengigkeiten
  pruefeDaten,
  messe,
  speichereBesten,
  fetchImpl,
  warte = (ms) => new Promise((r) => setTimeout(r, ms)),
  abfrageAbstandMs = ABFRAGE_ABSTAND_MS,
  log = () => {},
  jetzt = () => new Date()
} = {}) {
  const startZeit = jetzt().getTime();

  // Das Gitter ist durch: nichts Neues mehr zu probieren. Kein Fehler, aber
  // auch kein Grund, weiter Geld auszugeben.
  if (gitterErschoepft(zyklusIndex, maxRunden)) {
    return ergebnis({ gestartet: false, gruende: ["gitter_erschoepft"], zyklusIndex, kostenUsd: 0, jetzt });
  }

  // Reihenfolge mit Absicht: erst die billigen Pruefungen, die am haeufigsten
  // sperren, dann die Netzabfrage.
  const datenBefund = await sicher(() => pruefeDaten?.(), { vorhanden: false, gruende: ["datenpruefung_fehlgeschlagen"] });
  const erreichbar = await sicher(
    () => trainerErreichbar({ basisUrl: trainerBasisUrl, apiKey: trainerApiKey, fetchImpl }),
    false
  );

  const tor = darfZyklusStarten({
    grenzen,
    verbrauchtUsd,
    zyklenBisher: zyklusIndex,
    datenVorhanden: datenBefund?.vorhanden === true,
    trainerErreichbar: erreichbar === true
  });
  if (!tor.darfStarten) {
    // Nicht als Fehler protokollieren: ein gesperrter Zyklus ist der
    // Normalzustand, solange keine Freigabe vorliegt.
    log(`[smejj-lora-loop] Zyklus ${zyklusIndex} nicht gestartet: ${tor.gruende.join(", ")}`);
    return ergebnis({
      gestartet: false,
      gruende: tor.gruende,
      zyklusIndex,
      kostenUsd: 0,
      restUsd: tor.restUsd,
      jetzt
    });
  }

  const konfiguration = konfigurationFuer(zyklusIndex);
  log(`[smejj-lora-loop] Zyklus ${zyklusIndex} startet: ${konfiguration.kennung}` +
    ` (geschaetzt ${tor.zykluskostenUsd} USD, Rest ${tor.restUsd} USD)`);

  const start = await starteTraining({
    basisUrl: trainerBasisUrl, apiKey: trainerApiKey, konfiguration, basismodell, datensatz, fetchImpl
  });
  if (!start.ok) {
    return ergebnis({ gestartet: false, gruende: start.gruende, zyklusIndex, konfiguration, kostenUsd: 0, jetzt });
  }

  // --- ab hier laeuft die Karte und kostet Geld ---
  let zustand = { zustand: "laeuft", gelaufeneMinuten: 0 };
  let abgebrochen = null;
  while (zustand.zustand === "laeuft") {
    const laufendeMinuten = jetztMinuten(startZeit, jetzt);
    const notaus = mussNotausAusloesen({ grenzen, verbrauchtUsd, laufendeMinuten });
    if (notaus.notaus) {
      abgebrochen = notaus.gruende;
      break;
    }
    await warte(abfrageAbstandMs);
    zustand = await sicher(
      () => trainingZustand({ basisUrl: trainerBasisUrl, apiKey: trainerApiKey, laufId: start.laufId, fetchImpl }),
      { zustand: "unbekannt", gelaufeneMinuten: 0 }
    );
    // Ein unklarer Zustand ist ein Abbruchgrund. Weiterfragen hiesse, eine
    // laufende Karte unbeaufsichtigt zu lassen.
    if (zustand.zustand === "unbekannt") {
      abgebrochen = [`trainer_zustand_unbekannt:${zustand.fehler || ""}`];
      break;
    }
  }

  const gelaufeneMinuten = Math.max(zustand.gelaufeneMinuten || 0, jetztMinuten(startZeit, jetzt));
  const kostenUsd = tatsaechlicheKostenUsd(grenzen, gelaufeneMinuten);

  if (abgebrochen) {
    const beendet = await sicher(
      () => brichTrainingAb({ basisUrl: trainerBasisUrl, apiKey: trainerApiKey, laufId: start.laufId, fetchImpl }),
      false
    );
    // Ehrlich melden statt "abgebrochen" zu behaupten: reagiert der Dienst
    // nicht, muss der Betreiber die Container-Gruppe selbst stoppen.
    log(`[smejj-lora-loop] Zyklus ${zyklusIndex} ABGEBROCHEN (${abgebrochen.join(", ")});` +
      ` Dienst bestaetigt Abbruch: ${beendet ? "ja" : "NEIN — Container-Gruppe pruefen"}`);
    return ergebnis({
      gestartet: true, gruende: abgebrochen, zyklusIndex, konfiguration, kostenUsd,
      gelaufeneMinuten, abbruchBestaetigt: beendet === true, jetzt
    });
  }

  if (zustand.zustand !== "fertig") {
    log(`[smejj-lora-loop] Zyklus ${zyklusIndex} fehlgeschlagen (${zustand.zustand}), ${kostenUsd} USD verbraucht.`);
    return ergebnis({
      gestartet: true, gruende: [`training_${zustand.zustand}`], zyklusIndex, konfiguration,
      kostenUsd, gelaufeneMinuten, jetzt
    });
  }

  // --- Schritt 3: messen ---
  const messung = await sicher(
    () => messe?.({ konfiguration, messEndpunkt: zustand.messEndpunkt, adapterSchluessel: zustand.adapterSchluessel }),
    null
  );
  if (!messung?.ok) {
    // Ein trainierter Stand ohne Messung ist wertlos, aber die Kosten sind
    // angefallen — beides muss im Verlauf stehen.
    log(`[smejj-lora-loop] Zyklus ${zyklusIndex}: Training fertig, MESSUNG fehlgeschlagen (${messung?.gruende?.join(", ") || "unbekannt"}).`);
    return ergebnis({
      gestartet: true, gruende: ["messung_fehlgeschlagen"], zyklusIndex, konfiguration,
      kostenUsd, gelaufeneMinuten, jetzt
    });
  }

  // --- Schritt 4: behalten oder verwerfen ---
  const vergleich = istNeuerBester(messung.kennzahlen, besterStand);
  let alsBestemGespeichert = false;
  if (vergleich.besser) {
    alsBestemGespeichert = await sicher(() => speichereBesten?.({
      zyklusIndex,
      konfiguration,
      kennzahlen: messung.kennzahlen,
      adapterSchluessel: zustand.adapterSchluessel,
      gemessenAm: jetzt().toISOString()
    }), false) === true;
  }

  log(`[smejj-lora-loop] Zyklus ${zyklusIndex} ${konfiguration.kennung}:` +
    ` punktzahl=${messung.kennzahlen?.punktzahl} kritisch=${messung.kennzahlen?.kritischeFehler}` +
    ` kosten=${kostenUsd}USD ${vergleich.besser ? "NEUER BESTER" : `verworfen (${vergleich.gruende.join(", ")})`}`);

  return ergebnis({
    gestartet: true,
    gruende: vergleich.besser ? [] : vergleich.gruende,
    zyklusIndex,
    konfiguration,
    kostenUsd,
    gelaufeneMinuten,
    kennzahlen: messung.kennzahlen,
    besser: vergleich.besser,
    alsBestemGespeichert,
    adapterSchluessel: zustand.adapterSchluessel,
    jetzt
  });
}

/** Einheitliche Ergebnisform, damit der Verlauf immer dieselben Felder hat. */
function ergebnis({
  gestartet, gruende = [], zyklusIndex, konfiguration = null, kostenUsd = 0,
  gelaufeneMinuten = 0, kennzahlen = null, besser = false, alsBestemGespeichert = false,
  adapterSchluessel = null, abbruchBestaetigt = null, restUsd = null, jetzt = () => new Date()
}) {
  return Object.freeze({
    zeitpunkt: jetzt().toISOString(),
    zyklusIndex,
    gestartet,
    ok: gestartet && gruende.length === 0,
    gruende: Object.freeze([...gruende]),
    kennung: konfiguration?.kennung || null,
    konfiguration,
    kostenUsd,
    gelaufeneMinuten: Number(gelaufeneMinuten.toFixed?.(2) ?? gelaufeneMinuten),
    kennzahlen,
    besser,
    alsBestemGespeichert,
    adapterSchluessel,
    abbruchBestaetigt,
    restUsd
  });
}

/** Ein Fehler in einer eingereichten Funktion darf den Zyklus nicht sprengen. */
async function sicher(fn, ersatz) {
  try {
    const wert = await fn();
    return wert === undefined ? ersatz : wert;
  } catch {
    return ersatz;
  }
}
