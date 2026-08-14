// smejj.com — Unit-Tests fuer die Kosten-Sicht.
//
// Kern: das Modul darf keine Ausgaben-Zahl erfinden. Eine 0,00 statt einer
// Fehlanzeige waere die gefaehrlichste Zahl im Adminbereich — sie liest sich
// wie "kostet nichts", heisst aber "wird nicht gemessen".
//
// Ausfuehren: node --test control-server/src/admin/opsKosten.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { NICHT_ERFASST, kostenUebersicht } from "./opsKosten.js";

const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const SCHARF = Object.freeze({
  SMEJJ_BUDGET_MAX_USD_PER_JOB: "5",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "60",
  SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "2",
  SMEJJ_WORKER_BUDGET_USD: "3",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "30"
});
const OHNE_KAPAZITAET = async () => ({ ok: false, reason: "nicht_eingerichtet" });

test("KEINE ERFUNDENE AUSGABEN-ZAHL", async () => {
  const e = await kostenUebersicht({ env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  // Es gibt keinen Zweig "ausgabenUsd" oder "verbrauchUsd" — was nicht gemessen
  // wird, bekommt auch kein Feld, das man versehentlich als Null liest.
  const text = JSON.stringify(e);
  assert.equal(text.includes("ausgaben"), false);
  assert.equal(text.includes("verbrauch"), false);
  assert.equal(Array.isArray(e.nichtErfasst.punkte), true);
  assert.equal(e.nichtErfasst.punkte.length, NICHT_ERFASST.length);
  assert.equal(e.nichtErfasst.hinweis.includes("wird nicht gemessen"), true);
});

test("die Token-Luecke wird beim Namen genannt", async () => {
  const e = await kostenUebersicht({ env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  const themen = e.nichtErfasst.punkte.map((p) => p.was).join(" ");
  assert.equal(themen.includes("Token je Konto"), true);
  assert.equal(themen.includes("Preis je Modell"), true);
});

test("gemessen und uebernommen bleiben getrennt", async () => {
  const e = await kostenUebersicht({ env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  assert.equal(typeof e.gemessen, "object");
  assert.equal(typeof e.uebernommen, "object");
  assert.equal(e.uebernommen.quelle, "docs/architecture/FREE_ONLY_MASTER_POLICY.md",
    "die Quelle steht dabei — es ist ein Zitat, keine Messung");
  assert.equal(e.uebernommen.hinweis.includes("keine Messung"), true);
  // Der feste Anteil ist die Summe der Positionen mit bekanntem Betrag.
  assert.equal(e.uebernommen.festeSummeUsdProMonat, 6);
});

test("IST DAS BUDGET-GATE SCHARF — die eine Frage, die zaehlt", async () => {
  const scharf = await kostenUebersicht({ env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  assert.equal(scharf.gemessen.budgetGate.scharf, true);
  assert.deepEqual(scharf.gemessen.budgetGate.fehlendeGrenzen, []);
  assert.equal(scharf.bewertung.includes("scharf"), true);

  const stumpf = await kostenUebersicht({ env: {}, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  assert.equal(stumpf.gemessen.budgetGate.scharf, false);
  assert.equal(stumpf.gemessen.budgetGate.fehlendeGrenzen.length, 2);
  assert.equal(stumpf.bewertung.includes("startet kein Worker"), true,
    "fail-closed ist gewollt — es muss nur jemand wissen");
});

test("ein voller Reservierungstopf wird benannt", async () => {
  const e = await kostenUebersicht({
    env: SCHARF, jetztMs: JETZT, zaehleWorker: () => 0,
    leseKapazitaet: async () => ({ ok: true, snapshot: { reservedUsd: 20, maxGlobalReservedUsd: 20, activeSlots: 2, maxConcurrentWorkers: 2, jobs: [] } })
  });
  assert.equal(e.bewertung.includes("Obergrenze erreicht"), true);
});

test("eine nicht erreichbare Kapazitaet zeigt keine Null", async () => {
  const e = await kostenUebersicht({ env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0 });
  assert.equal(e.gemessen.reservierung.erreichbar, false);
  assert.equal(e.gemessen.reservierung.reserviertUsd, undefined, "keine erfundene Reservierung");
});

test("aus den Laeufen kommen nur Kennung und Frist", async () => {
  const e = await kostenUebersicht({
    env: SCHARF, jetztMs: JETZT, zaehleWorker: () => 1,
    leseKapazitaet: async () => ({ ok: true, snapshot: {
      reservedUsd: 3, maxGlobalReservedUsd: 20, activeSlots: 1, maxConcurrentWorkers: 2,
      jobs: [{ jobId: "job_1", groupName: "smejj-glm", deadlineAt: "2026-07-28T13:00:00.000Z" }]
    } })
  });
  assert.deepEqual(Object.keys(e.gemessen.reservierung.laeufe[0]).sort(), ["fristAm", "jobId"]);
});

test("ein Fehler beim Worker-Zaehlen kippt die Ansicht nicht", async () => {
  const e = await kostenUebersicht({
    env: SCHARF, jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET,
    zaehleWorker: () => { throw new Error("Store weg"); }
  });
  assert.equal(e.ok, true);
  assert.equal(e.gemessen.aktiveWorker, 0);
});

// ---- Zwei Waechter, zwei Wahrheiten (2026-08-14) ----------------------------
//
// Befund aus der Adminbereich-Pruefung: die Kostenseite meldete
// "keine fehlenden Grenzen", waehrend die Worker-Seite gleichzeitig
// "Kapazitaet nicht erreichbar" zeigte. Grund: das Budget-Tor prueft nur
// SEINE zwei Grenzen; die Platzreservierung der Worker braucht eine dritte,
// von der das Tor nichts weiss. Wer nur auf die Kostenseite schaut, haelt
// alles fuer eingerichtet.
test("die Kostenseite nennt auch die Grenze, die der ANDERE Waechter braucht", async () => {
  const u = await kostenUebersicht({
    env: {
      SMEJJ_BUDGET_MAX_USD_PER_JOB: "0.1",
      SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30",
      SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1"
      // SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD fehlt mit Absicht
    },
    jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0
  });
  assert.deepEqual(u.gemessen.budgetGate.fehlendeGrenzen, [], "das Tor selbst ist vollstaendig");
  assert.equal(u.gemessen.budgetGate.scharf, true);
  assert.equal(u.gemessen.budgetGate.fehlendeGrenzenAndererWaechter.length, 1,
    "die fehlende Grenze der Platzreservierung muss trotzdem dastehen");
  assert.match(u.gemessen.budgetGate.fehlendeGrenzenAndererWaechter[0], /MAX_GLOBAL_RESERVED_USD/);
});

test("ist die dritte Grenze gesetzt, meldet die Seite nichts mehr", async () => {
  const u = await kostenUebersicht({
    env: {
      SMEJJ_BUDGET_MAX_USD_PER_JOB: "0.1",
      SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30",
      SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "5"
    },
    jetztMs: JETZT, leseKapazitaet: OHNE_KAPAZITAET, zaehleWorker: () => 0
  });
  assert.deepEqual(u.gemessen.budgetGate.fehlendeGrenzenAndererWaechter, []);
});
