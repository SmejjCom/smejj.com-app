// Der Trainer-Anschluss ueber Salad-Jobs — und der Nachweis, dass er denselben
// Vertrag erfuellt wie der HTTP-Weg.
//
// WAS HIER WIRKLICH GEPRUEFT WIRD, und warum es kein Formalismus ist:
//
// Der alte Weg (Dauerdienst) ist am 2026-08-03 daran gescheitert, dass ein
// "running, ready=true" von Salad als "die Anwendung arbeitet" gelesen wurde.
// 28 Stunden Stillstand, null Zyklen. Der Job-Weg darf denselben Fehler nicht
// wiederholen — deshalb pruefen die Faelle unten vor allem EINES: dass der
// Herzschlag des Jobs die Wahrheit ist und der Gruppenzustand nur der Rahmen.
//
// Kein Fall in dieser Datei mietet eine GPU. Alle Aussenkontakte sind
// eingereicht.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MODUS_TRAINING,
  baueSaladJobTrainer,
  brichTrainingAb,
  jobParameterAus,
  neueJobId,
  starteTraining,
  trainerErreichbar,
  trainingZustand
} from "../workers/smejj-lora-loop/saladJobTrainer.js";
import { HTTP_TRAINER, fuehreZyklusAus } from "../workers/smejj-lora-loop/cycle.js";
import { konfigurationFuer } from "../workers/smejj-lora-loop/sweep.js";

/** Ablage-Attrappe: nur getJson, wie cycle.js und der Adapter sie brauchen. */
function e2Attrappe(inhalt = {}) {
  return {
    async getJson(schluessel, ersatz = null) {
      return Object.prototype.hasOwnProperty.call(inhalt, schluessel) ? inhalt[schluessel] : ersatz;
    }
  };
}

/** Salad-Client-Attrappe. `lese` liefert den Gruppenzustand, `stoppe` protokolliert. */
function clientAttrappe({ leseAntwort, starteOk = true, stoppeOk = true, spur = {} } = {}) {
  return {
    async lese() { return leseAntwort; },
    async starte() { spur.gestartet = (spur.gestartet || 0) + 1; return { ok: starteOk, status: starteOk ? 200 : 400 }; },
    async stoppe() { spur.gestoppt = (spur.gestoppt || 0) + 1; return { ok: stoppeOk, status: stoppeOk ? 202 : 500 }; },
    async erzeuge() { return { ok: true, status: 201 }; },
    async aktualisiere() { return { ok: true, status: 200 }; }
  };
}

const GRUPPE_LAEUFT = { ok: true, status: 200, daten: { current_state: { status: "running" }, replicas: 1, container: { environment_variables: {} } } };
const GRUPPE_GESTOPPT = { ok: true, status: 200, daten: { current_state: { status: "stopped" }, replicas: 1, container: { environment_variables: {} } } };
const GRUPPE_FEHLT = { ok: false, status: 404 };

// --- Vertragstreue -----------------------------------------------------------

test("der Job-Weg erfuellt exakt denselben Vertrag wie der HTTP-Weg", () => {
  const vertrag = Object.keys(HTTP_TRAINER).filter((k) => typeof HTTP_TRAINER[k] === "function").sort();
  assert.deepEqual(vertrag, ["brichTrainingAb", "starteTraining", "trainerErreichbar", "trainingZustand"]);

  const jobWeg = baueSaladJobTrainer({ client: clientAttrappe({ leseAntwort: GRUPPE_FEHLT }), e2: e2Attrappe(), konfig: { salad: {} }, version: "smejj-1-5", datensatzName: "smejj-1-1" });
  for (const name of vertrag) {
    assert.equal(typeof jobWeg[name], "function", `dem Job-Weg fehlt ${name} — cycle.js wuerde beim Aufruf abstuerzen`);
  }
});

test("cycle.js benutzt weiterhin den HTTP-Weg, wenn kein Trainer eingereicht wird", async () => {
  // Rueckwaertskompatibilitaet: der Standard darf sich durch die neue Naht nicht
  // veraendert haben. Ohne trainerBasisUrl meldet der HTTP-Weg "nicht erreichbar".
  const ergebnis = await fuehreZyklusAus({
    grenzen: { freigabe: null, gesamtdeckelUsd: 10 },
    zyklusIndex: 0,
    pruefeDaten: async () => ({ vorhanden: true }),
    warte: async () => {}
  });
  assert.equal(ergebnis.gestartet, false);
  assert.ok(ergebnis.gruende.length > 0, "ein gesperrter Zyklus muss seinen Grund nennen");
});

// --- Erreichbarkeit ----------------------------------------------------------

test("eine noch nicht angelegte Gruppe (404) ist ERREICHBAR, nicht gesperrt", async () => {
  // Das ist der Fall, der die alte Schleife fuer immer gesperrt haette: vor dem
  // ersten Lauf gibt es die Gruppe nicht. Ein 404 als Nein zu werten heisst,
  // den ersten Zyklus nie zu starten — und genau null Zyklen sind gelaufen.
  assert.equal(await trainerErreichbar({ client: clientAttrappe({ leseAntwort: GRUPPE_FEHLT }) }), true);
});

test("antwortet die Salad-API gar nicht, ist der Trainer NICHT erreichbar", async () => {
  const kaputt = { async lese() { throw new Error("fetch failed"); } };
  assert.equal(await trainerErreichbar({ client: kaputt }), false);
  assert.equal(await trainerErreichbar({}), false, "ohne Client ist die Antwort Nein, nicht ein Absturz");
});

// --- Zustand: der Herzschlag ist die Wahrheit --------------------------------

test("meldet der Herzschlag 'fertig', ist der Lauf fertig — samt Adapter", async () => {
  const e2 = e2Attrappe({
    "con/logs/jobs/job-1/status.json": { fertig: true, ok: true, phase: "fertig", minuten: 187 },
    "con/versions/smejj-1-5/training.json": { adapterPrefix: "con/versions/smejj-1-5/adapter", schritte: 430 }
  });
  const z = await trainingZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT }), e2, laufId: "job-1", version: "smejj-1-5" });
  assert.equal(z.zustand, "fertig");
  assert.equal(z.adapterSchluessel, "con/versions/smejj-1-5/adapter");
  assert.equal(z.gelaufeneMinuten, 187);
});

test("meldet der Herzschlag einen Fehler, ist der Lauf fehlgeschlagen — auch bei 'running' von Salad", async () => {
  // DER KERNFALL der Kapsel vom 2026-08-03: Salad sagt "running", der Prozess
  // ist tot. Wer der Gruppe glaubt, wartet bis zur Zeitgrenze auf ein Ergebnis,
  // das nie kommt — und bezahlt die ganze Zeit.
  const e2 = e2Attrappe({ "con/logs/jobs/job-2/status.json": { fertig: true, ok: false, phase: "fehler", fehler: "CUDA out of memory", minuten: 12 } });
  const z = await trainingZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT }), e2, laufId: "job-2", version: "smejj-1-5" });
  assert.equal(z.zustand, "fehlgeschlagen");
  assert.match(z.fehler, /CUDA/);
});

test("Gruppe gestoppt OHNE Abschluss im Herzschlag = abgestuerzt, nicht fertig", async () => {
  // Der stille Absturz: der Job stirbt hart, schreibt kein Ende, Salad baut die
  // Gruppe ab. Ohne diese Regel gaebe es kein Ergebnis und keinen Fehler — die
  // Schleife wartete ewig.
  const e2 = e2Attrappe({ "con/logs/jobs/job-3/status.json": { fertig: false, phase: "training", minuten: 40 } });
  const z = await trainingZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_GESTOPPT }), e2, laufId: "job-3", version: "smejj-1-5" });
  assert.equal(z.zustand, "fehlgeschlagen");
  assert.match(z.fehler, /ohne_abschluss/);
});

test("laufender Job ohne Ende-Meldung ist 'laeuft' und nennt seine Phase", async () => {
  const e2 = e2Attrappe({ "con/logs/jobs/job-4/status.json": { fertig: false, phase: "training", schritt: 120, minuten: 55 } });
  const z = await trainingZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT }), e2, laufId: "job-4", version: "smejj-1-5" });
  assert.equal(z.zustand, "laeuft");
  assert.equal(z.phase, "training");
  assert.equal(z.gelaufeneMinuten, 55);
});

test("schweigt die Salad-API und fehlt der Herzschlag, ist der Zustand UNBEKANNT — nicht fehlgeschlagen", async () => {
  // Am 2026-08-06 starben drei bezahlte Laeufe an Aussetzern der Zugangsschicht
  // (7 bis 78 Minuten), waehrend die Karte normal weiterrechnete. "unbekannt"
  // faellt in cycle.js unter die Toleranz von 16 Abfragen; "fehlgeschlagen"
  // haette den Lauf sofort verworfen.
  const kaputt = { async lese() { throw new Error("503"); } };
  const z = await trainingZustand({ client: kaputt, e2: e2Attrappe(), laufId: "job-5", version: "smejj-1-5" });
  assert.equal(z.zustand, "unbekannt");
});

test("ein unvollstaendiger Aufruf ergibt 'unbekannt', keinen Absturz", async () => {
  assert.equal((await trainingZustand({})).zustand, "unbekannt");
  assert.equal((await trainingZustand({ client: {}, e2: e2Attrappe() })).zustand, "unbekannt");
});

// --- Start -------------------------------------------------------------------

test("die Sweep-Konfiguration kommt vollstaendig beim Job an", () => {
  // Ginge sie hier verloren, liefen alle 27 Zyklen mit identischen Einstellungen
  // und jeder Unterschied im Ergebnis waere Rauschen, das wie Fortschritt aussieht.
  const konf = konfigurationFuer(4);
  const p = jobParameterAus(konf, { version: "smejj-1-5", datensatzName: "smejj-1-1" });
  const train = JSON.parse(p.CON_TRAIN_KONFIG);
  assert.equal(train.rang, konf.loraRang);
  assert.equal(train.alpha, konf.loraAlpha);
  assert.equal(train.lernrate, konf.lernrate);
  assert.equal(train.epochen, konf.epochen);
  assert.equal(p.CON_KANDIDAT, "smejj-1-5");
  assert.equal(p.CON_DATENSATZ_PREFIX, "datasets/smejj-1-1");
});

test("die Zeitschaetzung je Schritt ist die gemessene, nicht die vom 27B-Modell geerbte", () => {
  // Der geerbte Wert 2,5 liess einen bezahlten Lauf 416 von 16.234 Paaren sehen.
  const train = JSON.parse(jobParameterAus(konfigurationFuer(0), { version: "v", datensatzName: "d" }).CON_TRAIN_KONFIG);
  assert.equal(train.minutenJeSchritt, 0.3);
});

test("Version und Datensatz sind Pflicht — ein Lauf ohne sie waere Geld fuer nichts", () => {
  assert.throws(() => jobParameterAus(konfigurationFuer(0), { datensatzName: "d" }), /version fehlt/);
  assert.throws(() => jobParameterAus(konfigurationFuer(0), { version: "v" }), /datensatzName fehlt/);
});

test("die Job-Kennung traegt Version und Zeitstempel und ist eindeutig", () => {
  const fest = () => new Date("2026-09-07T03:15:42Z");
  const id = neueJobId("smejj-1-5", fest);
  assert.match(id, /^smejj15-20260907031542-training$/);
  assert.notEqual(neueJobId("smejj-1-5", fest), neueJobId("smejj-1-6", fest));
});

test("ohne Version oder Datensatz wird gar nicht erst gestartet", async () => {
  const spur = {};
  const client = clientAttrappe({ leseAntwort: GRUPPE_FEHLT, spur });
  const ohne = await starteTraining({ client, e2: e2Attrappe(), konfig: { salad: {} }, konfiguration: konfigurationFuer(0), datensatzName: "d" });
  assert.equal(ohne.ok, false);
  assert.deepEqual(ohne.gruende, ["version_fehlt"]);
  assert.equal(spur.gestartet || 0, 0, "es darf keine Gruppe angefasst worden sein");
});

test("ohne Client oder Konfiguration passiert nichts", async () => {
  const r = await starteTraining({ e2: e2Attrappe(), version: "v", datensatzName: "d" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.gruende, ["salad_client_oder_konfig_fehlt"]);
});

// --- Abbruch -----------------------------------------------------------------

test("Abbruch heisst: Gruppe gestoppt — und nur ein bestaetigter Stopp gilt", async () => {
  const spur = {};
  assert.equal(await brichTrainingAb({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT, spur }) }), true);
  assert.equal(spur.gestoppt, 1);
  // Antwortet Salad nicht, ist die Antwort NEIN. Ein "vermutlich beendet" liesse
  // eine Karte laufen, die niemand mehr beobachtet.
  assert.equal(await brichTrainingAb({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT, stoppeOk: false }) }), false);
  assert.equal(await brichTrainingAb({}), false);
});

test("der Modus heisst 'training' — job.py kennt genau diesen Namen", () => {
  assert.equal(MODUS_TRAINING, "training");
});
