// smejj.com Dauertrainings-Schleife — Taktgeber
// (Single Responsibility: wann laeuft der naechste Zyklus, und was wird gemerkt).
//
// `tick()` ist billig und mehrfach aufrufbar: der Prozess ruft es alle 30
// Sekunden, und es tut nur dann etwas, wenn der Zyklusabstand seit dem letzten
// dauerhaft vermerkten Lauf verstrichen ist. Genau wie beim bestehenden
// workers/smejj-training-loop/ ist das der Grund, warum ein Absturz nichts
// kostet: der Zustand liegt auf IDrive e2, nicht im Arbeitsspeicher.

import { fuehreZyklusAus } from "./cycle.js";
import { leseBestenStand, leseRegister, leseZustand, schreibeBestenStand, schreibeRegister, schreibeZustand, standardZustand } from "./state.js";
import { registerMitEintrag } from "./versionen.js";

export function erzeugeLoop({ config, env = process.env, log = console.log, deps = {} }) {
  let status = { state: "starting", lastTickAt: null, letzterGrund: null };
  let laeuft = false;
  let zustandImSpeicher = null;
  // Die aktive Version = der aktuelle Kandidat auf dem besten-stand. Nur fuer
  // /health und Berichte; die Schaltung an Nutzer bleibt modelPromotion + Mensch.
  let aktiveVersion = deps.besterStand?.version || null;
  const verlauf = [];

  function aufzeichnen(eintrag) {
    verlauf.push(eintrag);
    while (verlauf.length > config.verlaufMax) verlauf.shift();
  }

  async function tick(jetzt = () => new Date()) {
    // Ein Zyklus dauert laenger als der Takt. Ohne diese Sperre startet der
    // Takt weitere Laeufe in den laufenden hinein — und jeder davon mietet
    // eine eigene GPU.
    if (laeuft) return zustandImSpeicher || standardZustand();
    laeuft = true;
    try {
      status = { ...status, lastTickAt: jetzt().toISOString() };

      if (!config.trainingEnabled) {
        status = { ...status, state: "aus", letzterGrund: "SMEJJ_LORA_TRAINING_ENABLED!=YES" };
        return zustandImSpeicher || standardZustand();
      }

      // Der Kostenzaehler MUSS lesbar sein. Ist er es nicht, wird nicht
      // trainiert — lieber ein Stillstand als ein Deckel, der nicht haelt.
      const gelesen = zustandImSpeicher
        ? { ok: true, zustand: zustandImSpeicher }
        : await leseZustand({ env, key: config.zustandKey, idriveConfig: deps.idriveConfig, request: deps.zustandRequest });
      if (!gelesen.ok) {
        status = { ...status, state: "gesperrt", letzterGrund: `zustand_nicht_lesbar:${gelesen.fehler}` };
        log(`[smejj-lora-loop] Zustand nicht lesbar (${gelesen.fehler}) — kein Zyklus. Ohne Kostenzaehler kein Training.`);
        return standardZustand();
      }
      const zustand = gelesen.zustand;

      if (!faelligkeit(zustand.letzterZyklusAm, config.zyklusAbstandMs, jetzt)) {
        status = { ...status, state: "wartet" };
        zustandImSpeicher = zustand;
        return zustand;
      }

      const besterStand = deps.besterStand !== undefined
        ? deps.besterStand
        : await leseBestenStand({ env, key: config.bestenKey, idriveConfig: deps.idriveConfig, request: deps.bestenRequest });
      aktiveVersion = aktiveVersion || besterStand?.version || null;

      const ergebnis = await fuehreZyklusAus({
        grenzen: config.grenzen,
        zyklusIndex: zustand.zyklusIndex,
        verbrauchtUsd: zustand.verbrauchtUsd,
        besterStand,
        basismodell: config.basismodell,
        datensatz: config.datensatz,
        trainerBasisUrl: config.trainer.basisUrl,
        trainerApiKey: config.trainer.apiKey,
        maxRunden: config.maxRunden,
        pruefeDaten: deps.pruefeDaten,
        messe: deps.messe,
        speichereBesten: deps.speichereBesten
          || ((stand) => schreibeBestenStand(stand, { env, key: config.bestenKey, idriveConfig: deps.idriveConfig, request: deps.bestenRequest })),
        speichereVersion: deps.speichereVersion
          || (async (eintrag) => {
            // Lesefehler werden absichtlich NICHT geschluckt: ein leeres
            // Ersatzregister wuerde die Versionsgeschichte beim Schreiben
            // ausloeschen (siehe state.js#leseRegister).
            const register = await leseRegister({ env, key: config.versionsKey, idriveConfig: deps.idriveConfig, request: deps.versionsRequest });
            return schreibeRegister(registerMitEintrag(register, eintrag), { env, key: config.versionsKey, idriveConfig: deps.idriveConfig, request: deps.versionsRequest });
          }),
        fetchImpl: deps.fetchImpl,
        warte: deps.warte,
        abfrageAbstandMs: config.abfrageAbstandMs,
        log,
        jetzt
      });
      if (ergebnis.version && ergebnis.alsBestemGespeichert) aktiveVersion = ergebnis.version;

      const naechster = naechsterZustand(zustand, ergebnis, jetzt);
      zustandImSpeicher = naechster;
      const geschrieben = await schreibeZustand(naechster, { env, key: config.zustandKey, idriveConfig: deps.idriveConfig, request: deps.zustandRequest });
      if (!geschrieben) {
        // Der Zaehler im Prozess stimmt, die Ablage nicht. Das muss laut und
        // sichtbar sein: nach dem naechsten Neustart faellt der Verbrauch
        // zurueck, und der Deckel greift dann zu spaet.
        log("[smejj-lora-loop] WARNUNG: Kostenzaehler NICHT abgelegt. Nach einem Neustart rechnet der Deckel zu niedrig. IDRIVE_E2_* pruefen.");
      }

      aufzeichnen(verlaufEintrag(ergebnis, naechster, geschrieben));
      log(`[smejj-lora-loop] VERLAUF zyklus=${ergebnis.zyklusIndex} kennung=${ergebnis.kennung ?? "-"}`
        + ` gestartet=${ergebnis.gestartet} punktzahl=${ergebnis.kennzahlen?.punktzahl ?? "?"}`
        + ` kritisch=${ergebnis.kennzahlen?.kritischeFehler ?? "?"} kosten=${ergebnis.kostenUsd}USD`
        + ` verbraucht=${naechster.verbrauchtUsd}USD bester=${ergebnis.besser}`
        + ` gruende=${ergebnis.gruende.join("|") || "-"} abgelegt=${geschrieben}`);

      status = {
        state: ergebnis.gestartet ? "laeuft" : "gesperrt",
        lastTickAt: status.lastTickAt,
        letzterGrund: ergebnis.gruende[0] || null
      };
      return naechster;
    } catch (error) {
      status = { ...status, state: "fehler", letzterGrund: String(error?.message || error).slice(0, 160) };
      log(`[smejj-lora-loop] tick-Fehler: ${String(error?.message || error).slice(0, 200)}`);
      return zustandImSpeicher || standardZustand();
    } finally {
      laeuft = false;
    }
  }

  return Object.freeze({
    tick,
    getStatus: () => ({ ...status, verlaufAnzahl: verlauf.length, aktiveVersion }),
    getVerlauf: () => verlauf.map((e) => ({ ...e })),
    getZustand: () => ({ ...(zustandImSpeicher || standardZustand()) })
  });
}

function faelligkeit(letzterLauf, abstandMs, jetzt) {
  if (!letzterLauf) return true;
  const zeit = Date.parse(letzterLauf);
  if (!Number.isFinite(zeit)) return true;
  return jetzt().getTime() - zeit >= abstandMs;
}

/**
 * Der Zyklus-Index wird NUR erhoeht, wenn wirklich trainiert wurde.
 *
 * Sonst wanderte das Gitter waehrend einer Sperrphase durch: nach zwei Tagen
 * ohne Freigabe waere es "erschoepft", ohne dass eine einzige Konfiguration
 * gemessen wurde. Die Kosten werden dagegen immer aufaddiert, auch bei einem
 * Abbruch — abgebrochene GPU-Zeit ist bezahlte GPU-Zeit.
 */
function naechsterZustand(zustand, ergebnis, jetzt) {
  return {
    ...zustand,
    zyklusIndex: ergebnis.gestartet ? zustand.zyklusIndex + 1 : zustand.zyklusIndex,
    verbrauchtUsd: Number((zustand.verbrauchtUsd + (ergebnis.kostenUsd || 0)).toFixed(4)),
    letzterZyklusAm: jetzt().toISOString(),
    zyklenGestartet: zustand.zyklenGestartet + (ergebnis.gestartet ? 1 : 0),
    zyklenAbgebrochen: zustand.zyklenAbgebrochen + (ergebnis.gestartet && !ergebnis.ok ? 1 : 0),
    letzteGruende: [...ergebnis.gruende].slice(0, 10)
  };
}

/** Nur Kennzahlen und Kennungen — nie Prompts, Antworten oder Trainingsinhalte. */
function verlaufEintrag(ergebnis, zustand, abgelegt) {
  return {
    zeitpunkt: ergebnis.zeitpunkt,
    zyklusIndex: ergebnis.zyklusIndex,
    kennung: ergebnis.kennung,
    gestartet: ergebnis.gestartet,
    ok: ergebnis.ok,
    gruende: ergebnis.gruende,
    punktzahl: ergebnis.kennzahlen?.punktzahl ?? null,
    bestanden: ergebnis.kennzahlen?.bestanden ?? null,
    faelle: ergebnis.kennzahlen?.faelle ?? null,
    kritischeFehler: ergebnis.kennzahlen?.kritischeFehler ?? null,
    wiederholungen: ergebnis.kennzahlen?.wiederholungen ?? null,
    kostenUsd: ergebnis.kostenUsd,
    verbrauchtUsdGesamt: zustand.verbrauchtUsd,
    gelaufeneMinuten: ergebnis.gelaufeneMinuten,
    besser: ergebnis.besser,
    alsBestemGespeichert: ergebnis.alsBestemGespeichert,
    version: ergebnis.version,
    versionAbgelegt: ergebnis.versionAbgelegt,
    abbruchBestaetigt: ergebnis.abbruchBestaetigt,
    abgelegt
  };
}
