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
import { naechsteVersion, versionsEintrag } from "./versionen.js";
import { brichTrainingAb, starteTraining, trainerErreichbar, trainingZustand } from "./trainerClient.js";

const ABFRAGE_ABSTAND_MS = 30_000;
/**
 * Wie viele Statusabfragen IN FOLGE unklar sein duerfen, bevor der Lauf
 * abgebrochen wird.
 *
 * Am 2026-08-06 von 3 auf 16 erhoeht (Betreiber-Freigabe „Toleranz der
 * Trainingsschleife", Nachweis docs/approvals/2026-08-06-toleranz-trainingsschleife.md).
 *
 * WARUM: 3 Abfragen sind rund 90 Sekunden. In der Nacht auf den 2026-08-06
 * wurden Ausfaelle der Salad-Zugangsschicht von 7 bis 78 Minuten gemessen —
 * die Statusabfrage der Schleife 24-mal ueber 12 Minuten nachgestellt ergab
 * 14 mal HTTP 503 AM STUECK, waehrend der Trainer selbst gesund war
 * (`bereit: true`, Modell auf der GPU). Drei bezahlte Laeufe starben daran,
 * obwohl die Karte normal weiterrechnete.
 *
 * 16 x (30 s Abstand + 20 s Zeitgrenze) ≈ 8 Minuten. Das deckt die kurzen
 * Aussetzer ab, an denen die Zyklen 4 und 6 starben. Ein Ausfall wie die 78
 * Minuten fuehrt weiterhin zum Abbruch — richtig so, das ist kein Schluckauf.
 *
 * Die Karte bleibt dabei NICHT unbeaufsichtigt: Laufzeit- und Kostendeckel
 * werden oben in derselben Schleife bei JEDEM Durchgang geprueft
 * (mussNotausAusloesen) und sind unveraendert.
 */
const UNBEKANNT_TOLERANZ = 16;

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
  speichereVersion,
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
    // VERWAISTEN LAUF AUFRAEUMEN.
    //
    // Stirbt die Schleife mitten in einem Zyklus (am 2026-08-06 viermal durch
    // Sitzungsende), rechnet der Lauf auf dem Trainer ungestoert weiter — nur
    // misst ihn niemand mehr. Zweimal gemessen: 69,7 und 72,2 Minuten bezahlte
    // Rechenzeit fuer nichts, und ueber die Einzellauf-Sperre blockierte er
    // zusaetzlich JEDEN weiteren Zyklus, bis jemand von Hand eingriff.
    //
    // Der Trainer nennt bei 409 die Kennung des Blockierers. Eine frisch
    // gestartete Schleife verfolgt per Definition keinen Lauf — was hier noch
    // laeuft, gehoert also niemandem mehr und wird beendet. Der naechste Takt
    // startet dann sauber.
    if (start.aktiverLauf) {
      const beendet = await sicher(
        () => brichTrainingAb({ basisUrl: trainerBasisUrl, apiKey: trainerApiKey, laufId: start.aktiverLauf, fetchImpl }),
        false
      );
      log(`[smejj-lora-loop] Verwaister Lauf ${start.aktiverLauf} belegte den Trainer —`
        + ` Abbruch ${beendet ? "bestaetigt" : "NICHT bestaetigt, Container-Gruppe pruefen"}.`);
    }
    return ergebnis({ gestartet: false, gruende: start.gruende, zyklusIndex, konfiguration, kostenUsd: 0, jetzt });
  }

  // --- ab hier laeuft die Karte und kostet Geld ---
  let zustand = { zustand: "laeuft", gelaufeneMinuten: 0 };
  let abgebrochen = null;
  let unbekanntInFolge = 0;
  while (zustand.zustand === "laeuft" || zustand.zustand === "unbekannt") {
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
    // Ein unklarer Zustand bleibt ein Abbruchgrund — aber erst nach mehreren
    // Fehlversuchen IN FOLGE. Gemessen am 2026-08-05: EIN 20-s-Timeout einer
    // Statusabfrage (Zyklus 2, r32, Minute 24,8 — davor 24 Minuten saubere
    // Antworten) hat einen bezahlten Lauf verworfen. Die Karte bleibt dabei
    // nie unbeaufsichtigt: das Fenster ist begrenzt (siehe UNBEKANNT_TOLERANZ
    // — Stand 2026-08-06 rund 8 Minuten), und Laufzeit- und Kostendeckel oben
    // im Takt greifen bei JEDEM Durchgang weiter.
    //
    // Die Dauer bewusst NICHT zweimal hingeschrieben: hier stand bis zum
    // 2026-08-06 „rund 2,5 Minuten", waehrend die Konstante darueber laengst
    // auf 8 Minuten stand. Eine Zahl an zwei Stellen laeuft auseinander.
    if (zustand.zustand === "unbekannt") {
      unbekanntInFolge += 1;
      if (unbekanntInFolge >= UNBEKANNT_TOLERANZ) {
        abgebrochen = [`trainer_zustand_unbekannt:${zustand.fehler || ""}`];
        break;
      }
      continue;
    }
    unbekanntInFolge = 0;
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
  let version = null;
  let versionAbgelegt = null;
  if (vergleich.besser) {
    // Nur ein Stand, der das Gate (istNeuerBester) bestanden hat, bekommt
    // einen Versionsnamen — siehe versionen.js (Kopfzeilen zur Abgrenzung
    // gegen die menschliche Befoerderung). Fail-soft mit lauter Meldung: ein
    // verweigerter Name darf den bereits bezahlten Zyklus nicht sprengen.
    version = await sicher(
      () => naechsteVersion(besterStand, basismodell?.hfRepo)?.version || null,
      null
    );
    const eintrag = version
      ? await sicher(() => versionsEintrag({
          version,
          konfiguration,
          kennzahlen: messung.kennzahlen,
          adapterSchluessel: zustand.adapterSchluessel,
          basismodell,
          datensatz,
          freigabeId: grenzen.freigabeId,
          zyklusIndex,
          gemessenAm: jetzt().toISOString()
        }), null)
      : null;
    if (version && !eintrag) {
      log(`[smejj-lora-loop] Zyklus ${zyklusIndex}: Version ${version} VERWEIGERT`
        + ` (kein Artefakt oder ungueltige Kennzahlen) — bester-stand ohne Versionsnamen.`);
      version = null;
    }
    alsBestemGespeichert = await sicher(() => speichereBesten?.({
      zyklusIndex,
      konfiguration,
      version,
      // Die Basis reist im besten-stand mit: ohne sie ist ein spaeterer
      // Generationswechsel (smejj-2-0) nicht maschinell beweisbar.
      basismodell,
      kennzahlen: messung.kennzahlen,
      adapterSchluessel: zustand.adapterSchluessel,
      gemessenAm: jetzt().toISOString()
    }), false) === true;
    // Register ist Chronik, nicht Tor: schlaegt sie fehl, bleibt der
    // beste-stand (und damit die Version) unberuehrt — aber es wird laut.
    if (eintrag) {
      versionAbgelegt = await sicher(() => speichereVersion?.(eintrag), false) === true;
      if (!versionAbgelegt) {
        log(`[smejj-lora-loop] Zyklus ${zyklusIndex}: Version ${version} im besten-stand, ABER Register NICHT abgelegt.`);
      }
    }
  }

  log(`[smejj-lora-loop] Zyklus ${zyklusIndex} ${konfiguration.kennung}:`
    + ` punktzahl=${messung.kennzahlen?.punktzahl} kritisch=${messung.kennzahlen?.kritischeFehler}`
    + ` kosten=${kostenUsd}USD ${vergleich.besser
      ? `NEUER BESTER ${version}${versionAbgelegt === false ? " (Register offen)" : ""}`
      : `verworfen (${vergleich.gruende.join(", ")})`}`);

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
    version,
    versionAbgelegt,
    adapterSchluessel: zustand.adapterSchluessel,
    jetzt
  });
}

/** Einheitliche Ergebnisform, damit der Verlauf immer dieselben Felder hat. */
function ergebnis({
  gestartet, gruende = [], zyklusIndex, konfiguration = null, kostenUsd = 0,
  gelaufeneMinuten = 0, kennzahlen = null, besser = false, alsBestemGespeichert = false,
  version = null, versionAbgelegt = null, adapterSchluessel = null,
  abbruchBestaetigt = null, restUsd = null, jetzt = () => new Date()
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
    version,
    versionAbgelegt,
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
