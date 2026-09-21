// muuny AI — Vergleichswert und Tor (Owner-Auftrag 21.09.2026).
//
// Zwei Regeln, die das alte System nicht hatte, und die es Geld gekostet hat:
//   1. OHNE gemessenes Grundmodell wird nichts trainiert und nichts befoerdert.
//      Der Vergleichswert ist die Note des UNTRAINIERTEN Modells, nicht die der
//      zuletzt befoerderten Version.
//   2. Trainiert wird nur mit ECHTEN neuen Paaren, und erst ab 500. Unlesbare
//      Ablage oder unlesbarer Stand = Tor ZU.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GRUNDMODELL, planeNaechstenSchritt, pruefeTor, suitenStand } from "../workers/muuny-autopilot/kreislauf.js";
import { L } from "../workers/muuny-autopilot/lager.js";

const suitesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../workers/muuny-autopilot/suites");
const konfig = { basis: { prefix: "muuny/base/x", repo: "Qwen/Qwen3.8-27B" }, wiederholungen: 1, suitesDir };
const stabil = async () => ({ versions: [{ version: "muuny-1.3", status: "stable", basisPrefix: "muuny/base/x",
  benchmarks: { gesamt: 0.961, kritisch: 5, kategorien: {}, suitenStand: await suitenStand(suitesDir) } }] });

/** Attrappe: `objekte` sind JSON-Werte, `paare` die Anzahl abgelegter Paardateien. */
function e2Mit({ objekte = {}, paare = 0, listeWirft = false, standWirft = false } = {}) {
  return {
    async getJson(k, standard = null) {
      if (standWirft && k === L.paarStand) throw new Error("e2: kaputt");
      return k in objekte ? objekte[k] : standard;
    },
    async liste(prefix) {
      if (listeWirft) throw new Error("e2 antwortet 500");
      if (!prefix.startsWith(L.paare)) return [];
      return Array.from({ length: paare }, (_, i) => ({ key: `${L.paare}/2026/09/21/${String(i).padStart(8, "0")}-0000-0000-0000-000000000000.json`, size: 200 }));
    }
  };
}

test("Ohne gemessenes Grundmodell wird zuerst das Grundmodell gemessen — ohne Adapter", async () => {
  const plan = await planeNaechstenSchritt({ e2: e2Mit({ paare: 9999 }), konfig }, {}, await stabil());
  assert.equal(plan.schritt, "grundmodell_messen", "selbst 9999 Paare duerfen den Vergleichswert nicht ueberspringen");
  assert.equal(plan.job.modus, "messung");
  assert.equal(plan.job.version, GRUNDMODELL);
  assert.equal(plan.job.adapterPrefix, null, "gemessen wird das NACKTE Modell");
  assert.deepEqual(JSON.parse(plan.job.parameter.MUUNY_MESS_VERSIONEN), [{ version: GRUNDMODELL, adapterPrefix: null }]);
});

test("Ein Vergleichswert von einer ALTEN Latte zaehlt nicht", async () => {
  const stand = await suitenStand(suitesDir);
  const alt = { punktzahl: 0.97, suitenStand: { ...stand, "con-sicherheit": "alte-fassung" } };
  const plan = await planeNaechstenSchritt({ e2: e2Mit({ objekte: { [L.grundmodell]: alt } }), konfig }, {}, await stabil());
  assert.equal(plan.schritt, "grundmodell_messen",
    "genau der Fehler vom 21.09.: 97,2 % auf 46 Faellen ist kein Vergleich zu 96,1 % auf 102");
});

test("Tor: unter 500 neuen Paaren kein GPU-Start, mit ehrlicher Meldung", async () => {
  const stand = await suitenStand(suitesDir);
  const e2 = e2Mit({ objekte: { [L.grundmodell]: { punktzahl: 0.95, suitenStand: stand } }, paare: 0 });
  const plan = await planeNaechstenSchritt({ e2, konfig }, {}, await stabil());
  assert.equal(plan.schritt, "tor");
  assert.equal(plan.job, undefined, "kein Job, keine Kosten");
  assert.equal(plan.phase, "wartet_auf_paare");
  assert.match(plan.grund, /wartet: 0 von 500/);
});

test("Tor: gezaehlt werden NEUE Paare seit der letzten Runde, nicht alle", async () => {
  const e2 = e2Mit({ objekte: { [L.paarStand]: { paare: 800, datensatz: "muuny-lernpaare-r1", am: "2026-09-01" } }, paare: 1200 });
  const t = await pruefeTor(e2, { env: {} });
  assert.equal(t.jetzt, 1200);
  assert.equal(t.neu, 400);
  assert.equal(t.offen, false, "1200 gesamt, aber nur 400 neu — das reicht nicht");
  assert.match(t.grund, /400 von 500/);

  const t2 = await pruefeTor(e2Mit({ objekte: { [L.paarStand]: { paare: 800 } }, paare: 1300 }), { env: {} });
  assert.equal(t2.neu, 500);
  assert.equal(t2.offen, true, "genau 500 neue: das Tor faellt");
});

test("Tor: die Schwelle ist einstellbar, aber nur nach oben sinnvoll gemeint", async () => {
  const t = await pruefeTor(e2Mit({ paare: 120 }), { env: { MUUNY_MIN_NEUE_PAARE: "100" } });
  assert.equal(t.min, 100);
  assert.equal(t.offen, true);
  const kaputt = await pruefeTor(e2Mit({ paare: 120 }), { env: { MUUNY_MIN_NEUE_PAARE: "quatsch" } });
  assert.equal(kaputt.min, 500, "eine unlesbare Einstellung faellt auf die sichere Schwelle zurueck");
});

test("KAPUTT: unlesbare Ablage = Tor ZU, kein Training", async () => {
  const t = await pruefeTor(e2Mit({ listeWirft: true }), { env: {} });
  assert.equal(t.offen, false);
  assert.equal(t.jetzt, null);
  assert.match(t.grund, /nicht lesbar/);
});

test("KAPUTT: unlesbarer Stand der letzten Runde = Tor ZU, auch bei vielen Paaren", async () => {
  const t = await pruefeTor(e2Mit({ paare: 5000, standWirft: true }), { env: {} });
  assert.equal(t.offen, false, "ohne Stand weiss niemand, welche Paare neu sind");
  assert.match(t.grund, /Stand der letzten Runde nicht lesbar/);
});

test("Nur .json-Dateien zaehlen als Paar", async () => {
  const e2 = e2Mit({ paare: 3 });
  const liste = e2.liste;
  e2.liste = async (p) => [...await liste(p), { key: `${L.paare}/2026/09/21/._x.json.tmp`, size: 1 }, { key: `${L.paare}/LIESMICH.txt`, size: 1 }];
  const t = await pruefeTor(e2, { env: {} });
  assert.equal(t.jetzt, 3);
});

test("Die Grundmodell-Messung wird Vergleichswert — und landet NIE im Versionsregister", async () => {
  const { tick, ladeSuiten } = await import("../workers/muuny-autopilot/kreislauf.js");
  const suiten = await ladeSuiten(suitesDir);
  const stand = await suitenStand(suitesDir);
  const prefix = `${L.evals}/${GRUNDMODELL}/job-g1`;
  // Echte Form der Antworten: jede Suite, jeder Fall, eine Antwort.
  const antworten = { version: GRUNDMODELL, jobId: "job-g1",
    leistung: { antworten: suiten.reduce((n, s) => n + s.cases.length, 0), tokensGesamt: 5000, tokensProSekunde: 3 },
    suiten: suiten.map((s) => ({ suiteId: s.suiteId, contentSha256: s.integrity?.contentSha256,
      cases: s.cases.map((c) => ({ id: c.id, runs: [{ text: "Das kann ich so nicht beantworten.", latencyMs: 900 }] })) })) };
  const objekte = {
    [L.zustand]: { phase: "job_laeuft", historie: [], laufenderJob: { jobId: "job-g1", taskId: "t-g1", modus: "messung",
      version: GRUNDMODELL, adapterPrefix: null, gestartet: new Date(Date.now() - 60_000).toISOString(), maxMinuten: 150 } },
    [`${L.jobs}/job-g1/ergebnis.json`]: { ok: true, jobId: "job-g1", messungen: [{ version: GRUNDMODELL, adapterPrefix: null, prefix }] },
    [`${prefix}/antworten.json`]: antworten
  };
  const geschrieben = {};
  const e2 = {
    getJson: async (k, standard = null) => (k in geschrieben ? geschrieben[k] : (k in objekte ? objekte[k] : standard)),
    putJson: async (k, v) => { geschrieben[k] = structuredClone(v); },
    liste: async () => []
  };
  const z = await tick({ e2, salad: null, log: () => {}, konfig: { ...konfig, taktMs: 300000,
    grenzen: { tagesbudgetUsd: 5, gesamtdeckelUsd: 50, jobMaxMinuten: 260, freigabe: false, notaus: false } } });

  const messung = geschrieben[L.grundmodell];
  assert.ok(messung, "der Vergleichswert muss abgelegt sein");
  assert.equal(typeof messung.punktzahl, "number");
  assert.equal(messung.modell, "Qwen/Qwen3.8-27B");
  assert.deepEqual(messung.suitenStand, stand, "ohne Latten-Stand waere der Vergleich spaeter nicht pruefbar");
  assert.equal(geschrieben[L.registry], undefined, "das Grundmodell ist keine Version und bekommt nie eine Nummer");
  assert.equal(z.letzteEntscheidung.entscheidung, "GRUNDMODELL_GEMESSEN");
  assert.equal(z.laufenderJob, null, "der Job ist abgeschlossen");
});
