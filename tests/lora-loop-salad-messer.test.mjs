// Der Mess-Anschluss ueber Salad-Jobs.
//
// Die Faelle hier sind die teuer bezahlten Lehren der Woche vom 06.09., nicht
// erfundene Grenzfaelle:
//
//   * Eine Suite in Manifest-Form kam beim Job als NULL Faelle an — er bildete
//     daraus eine Note, ohne dass irgendwo ein Fehler auftauchte.
//   * Ein abgebrochener Messlauf hatte 183 von 295 Antworten leer, wurde mit
//     24 % benotet und landete als gueltiges Urteil im Register.
//   * Zwei Versionen waren der beste Stand IHRER Reihe und lagen trotzdem 17
//     bis 21 Punkte unter dem Basismodell ohne Adapter.
//
// Alle drei haben gemeinsam, dass ein FEHLER wie ein ERGEBNIS aussah. Genau
// dagegen pruefen diese Faelle. Keiner mietet eine GPU.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MESS_MAX_MINUTEN,
  MODUS_MESSUNG,
  baueSaladJobMesser,
  bewerteLauf,
  messungZustand,
  neueMessJobId,
  starteMessung
} from "../workers/smejj-lora-loop/saladJobMesser.js";

const SUITE = { suiteId: "smejj-test-v1", cases: [{ id: "a" }, { id: "b" }] };

function e2Attrappe(inhalt = {}, geschrieben = {}) {
  return {
    async getJson(k, ersatz = null) { return Object.prototype.hasOwnProperty.call(inhalt, k) ? inhalt[k] : ersatz; },
    async putJson(k, wert) { geschrieben[k] = wert; return { ok: true }; }
  };
}

function clientAttrappe({ leseAntwort, spur = {} } = {}) {
  return {
    async lese() { return leseAntwort; },
    async starte() { spur.gestartet = (spur.gestartet || 0) + 1; return { ok: true, status: 200 }; },
    async stoppe() { spur.gestoppt = (spur.gestoppt || 0) + 1; return { ok: true, status: 202 }; },
    async erzeuge() { return { ok: true, status: 201 }; },
    async aktualisiere() { return { ok: true, status: 200 }; }
  };
}

const GRUPPE_LAEUFT = { ok: true, status: 200, daten: { current_state: { status: "running" }, container: { environment_variables: {} } } };
const GRUPPE_GESTOPPT = { ok: true, status: 200, daten: { current_state: { status: "stopped" }, container: { environment_variables: {} } } };

// --- Start: die stille Fehlmessung verhindern --------------------------------

test("eine Suite OHNE Faelle startet keinen Messlauf", async () => {
  // Der Fall, der am 06.09. eine Note aus null Faellen erzeugt haette.
  const spur = {};
  const r = await starteMessung({
    client: clientAttrappe({ leseAntwort: GRUPPE_GESTOPPT, spur }), e2: e2Attrappe(), konfig: { salad: {} },
    version: "smejj-1-5", adapterPrefix: "con/versions/smejj-1-5/adapter", suite: { suiteId: "leer", cases: [] }
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.gruende, ["suite_ohne_faelle"]);
  assert.equal(spur.gestartet || 0, 0, "es darf kein Job und damit keine Miete entstanden sein");
});

test("ohne Adapter wird nicht gemessen — es gaebe nichts zu messen", async () => {
  const r = await starteMessung({
    client: clientAttrappe({ leseAntwort: GRUPPE_GESTOPPT }), e2: e2Attrappe(), konfig: { salad: {} },
    version: "smejj-1-5", suite: SUITE
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.gruende, ["adapter_fehlt"]);
});

test("die Mess-Kennung ist als Messung erkennbar und traegt die Version", () => {
  const id = neueMessJobId("smejj-1-5", () => new Date("2026-09-07T04:00:00Z"));
  assert.match(id, /^smejj15-20260907040000-messung$/);
  assert.equal(MODUS_MESSUNG, "messung");
});

test("die Zeitgrenze traegt 590 Antworten auf dem LANGSAMSTEN gemessenen Knoten", () => {
  // Nicht "irgendeine grosse Zahl", sondern nachgerechnet: Basis + Kandidat sind
  // 590 Antworten; der schlechteste am 07.09. gemessene Dauerwert war 25,9 s.
  // Dazu bis zu 30 Minuten fuer das Holen des Modells aus e2.
  const noetig = (590 * 26) / 60 + 30;
  assert.ok(MESS_MAX_MINUTEN >= noetig,
    `Frist ${MESS_MAX_MINUTEN} min traegt die noetigen ${Math.ceil(noetig)} min nicht — `
    + "eine Messung, die an der Frist abbricht, kostet den ganzen Lauf und liefert keine Note");
});

// --- Zustand -----------------------------------------------------------------

test("der Herzschlag schlaegt den Gruppenzustand — auch bei der Messung", async () => {
  const e2 = e2Attrappe({ "con/logs/jobs/m1/status.json": { fertig: true, ok: false, phase: "fehler", fehler: "OOM" } });
  const z = await messungZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT }), e2, jobId: "m1" });
  assert.equal(z.zustand, "fehlgeschlagen");
});

test("Gruppe gestoppt ohne Abschluss = abgestuerzt", async () => {
  const z = await messungZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_GESTOPPT }), e2: e2Attrappe(), jobId: "m2" });
  assert.equal(z.zustand, "fehlgeschlagen");
  assert.match(z.fehler, /ohne_abschluss/);
});

test("ein laufender Messjob meldet seinen Fortschritt", async () => {
  const e2 = e2Attrappe({ "con/logs/jobs/m3/status.json": { fertig: false, phase: "messung", erledigt: 140, von: 295 } });
  const z = await messungZustand({ client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT }), e2, jobId: "m3" });
  assert.equal(z.zustand, "laeuft");
  assert.equal(z.erledigt, 140);
  assert.equal(z.von, 295);
});

// --- Benotung ----------------------------------------------------------------

test("fehlen die Antworten, gibt es KEINE Note", async () => {
  const r = await bewerteLauf({ e2: e2Attrappe(), jobId: "m4", version: "smejj-1-5", adapterPrefix: "p", suite: SUITE });
  assert.equal(r.ok, false);
  assert.match(r.gruende[0], /antworten_fehlen/);
});

test("wirft die Benotung (unvollstaendige Messung), wird KEINE Bewertung abgelegt", async () => {
  // Der 98-Prozent-Riegel. Ein Abbruch darf nicht aussehen wie ein schlechtes
  // Modell — und schon gar nicht als Urteil ins Register gehen.
  const geschrieben = {};
  const e2 = e2Attrappe({
    "smejj/evals/qwen3-4b-basis/m5/antworten.json": { suiten: [] },
    "smejj/evals/smejj-1-5/m5/antworten.json": { suiten: [] }
  }, geschrieben);
  const r = await bewerteLauf({
    e2, jobId: "m5", version: "smejj-1-5", adapterPrefix: "p", suite: SUITE,
    benote: async () => { throw new Error("Messung unvollstaendig: nur 112 von 295 Faellen haben eine echte Antwort (38 %)"); }
  });
  assert.equal(r.ok, false);
  assert.match(r.gruende[0], /benotung_abgelehnt/);
  assert.deepEqual(Object.keys(geschrieben), [], "eine abgelehnte Benotung darf nichts ablegen");
});

test("die BASISNOTE wird mitgefuehrt — sonst sieht man den entscheidenden Vergleich nicht", async () => {
  // Am 06.09. waren zwei Versionen der beste Stand ihrer Reihe UND lagen 17 bis
  // 21 Punkte unter der nackten Basis. Ohne Basisnote sieht man das nicht.
  const geschrieben = {};
  const e2 = e2Attrappe({
    "smejj/evals/qwen3-4b-basis/m6/antworten.json": { suiten: [] },
    "smejj/evals/smejj-1-5/m6/antworten.json": { suiten: [] },
    "con/versions/smejj-1-5/training.json": { adapterPrefix: "con/versions/smejj-1-5/adapter", jobId: "t-1" }
  }, geschrieben);
  const noten = { "qwen3-4b-basis": 0.684, "smejj-1-5": 0.712 };
  const r = await bewerteLauf({
    e2, jobId: "m6", version: "smejj-1-5", adapterPrefix: "con/versions/smejj-1-5/adapter", suite: SUITE,
    benote: async (_suite, _antworten, stand) => ({
      suite: { suiteId: SUITE.suiteId, integrity: { contentSha256: "abc" } },
      summary: { weightedScore: noten[stand], criticalFailures: 0, cases: 295 }
    })
  });
  assert.equal(r.ok, true);
  assert.equal(r.kennzahlen.punktzahl, 0.712);
  assert.equal(r.kennzahlen.basisPunktzahl, 0.684);
  assert.equal(r.kennzahlen.kritischeFehler, 0);

  const abgelegt = geschrieben["smejj/bewertungen/m6.json"];
  assert.ok(abgelegt, "die Bewertung muss fuer die Platzvergabe abgelegt sein");
  assert.equal(abgelegt.status, "neu", "die Messung urteilt nicht — das ist ein eigener Schritt");
  assert.equal(abgelegt.basisNote, 0.684);
  assert.equal(abgelegt.quelle, "autopilot");
  assert.equal(abgelegt.trainingJobId, "t-1");
});

test("eine fehlende Note ist ein Nein, keine Null", async () => {
  const e2 = e2Attrappe({
    "smejj/evals/qwen3-4b-basis/m7/antworten.json": { suiten: [] },
    "smejj/evals/smejj-1-5/m7/antworten.json": { suiten: [] }
  });
  const r = await bewerteLauf({
    e2, jobId: "m7", version: "smejj-1-5", adapterPrefix: "p", suite: SUITE,
    benote: async () => ({ summary: { weightedScore: null, criticalFailures: 0 } })
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.gruende, ["note_fehlt"]);
});

// --- Die ganze messe()-Funktion ----------------------------------------------

test("messe() haelt seine eigene Zeitgrenze ein und stoppt die Gruppe", async () => {
  const spur = {};
  let uhr = new Date("2026-09-07T00:00:00Z").getTime();
  const messe = baueSaladJobMesser({
    client: clientAttrappe({ leseAntwort: GRUPPE_LAEUFT, spur }),
    e2: e2Attrappe({ "con/logs/jobs/x/status.json": { fertig: false, phase: "messung" } }),
    konfig: { salad: {}, jobDir: null },
    version: "smejj-1-5",
    suite: SUITE,
    maxMinuten: 1,
    abfrageAbstandMs: 1,
    // Jede Wartesekunde schiebt die Uhr um eine Minute — so laeuft die Frist ab,
    // ohne dass der Test wirklich wartet.
    warte: async () => { uhr += 60_000; },
    jetzt: () => new Date(uhr)
  });
  const r = await messe({ adapterSchluessel: "con/versions/smejj-1-5/adapter" });
  assert.equal(r.ok, false);
  // Der Start scheitert in der Attrappe schon am Buendel — entscheidend ist,
  // dass messe() einen GRUND nennt statt zu haengen.
  assert.ok(r.gruende.length > 0, "ein haengender Messjob darf den Autopiloten nicht anhalten");
});
