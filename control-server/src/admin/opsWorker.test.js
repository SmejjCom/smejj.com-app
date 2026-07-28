// smejj.com — Unit-Tests fuer die Worker-Sicht.
//
// Kern: eine ausgefallene Quelle darf nicht wie "alles ruhig" aussehen. Eine
// erfundene Null ist hier gefaehrlicher als eine ehrliche Fehlanzeige.
//
// Ausfuehren: node --test control-server/src/admin/opsWorker.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { workerUebersicht } from "./opsWorker.js";

const JETZT = Date.parse("2026-07-28T13:00:00.000Z");

const KAPAZITAET_OK = async () => ({
  ok: true,
  snapshot: {
    revision: 7, activeSlots: 1, maxConcurrentWorkers: 2,
    reservedUsd: 3.5, maxGlobalReservedUsd: 20,
    jobs: [{ jobId: "job_1", groupName: "smejj-glm", deadlineAt: "2026-07-28T14:00:00.000Z" }]
  }
});
const CONTAINER_OK = async () => ({ ok: true, data: { name: "smejj-glm", version: 12, current_state: { status: "running", instance_status_counts: { running_count: 1 } } } });

test("beide Quellen da: Plaetze, Budget und Maschinenzustand stehen nebeneinander", async () => {
  const e = await workerUebersicht({ env: {}, jetztMs: JETZT, leseKapazitaet: KAPAZITAET_OK, leseContainer: CONTAINER_OK });
  assert.equal(e.kapazitaet.erreichbar, true);
  assert.equal(e.kapazitaet.belegtePlaetze, 1);
  assert.equal(e.kapazitaet.freiePlaetze, 1);
  assert.equal(e.container.zustand, "running");
  assert.equal(e.bewertung, "unauffaellig");
});

test("eine ausgefallene Quelle sagt das — statt eine Null zu zeigen", async () => {
  const e = await workerUebersicht({
    env: {}, jetztMs: JETZT,
    leseKapazitaet: async () => ({ ok: false, reason: "global_worker_capacity_configuration_invalid" }),
    leseContainer: CONTAINER_OK
  });
  assert.equal(e.kapazitaet.erreichbar, false);
  assert.equal(e.kapazitaet.grund, "global_worker_capacity_configuration_invalid");
  assert.equal(e.kapazitaet.belegtePlaetze, undefined, "keine erfundene Zahl");
  assert.equal(e.bewertung, "Maschine bekannt, Kapazitaet nicht erreichbar");
});

test("eine geworfene Ausnahme kippt die Ansicht nicht", async () => {
  const e = await workerUebersicht({
    env: {}, jetztMs: JETZT,
    leseKapazitaet: async () => { throw new Error("Netz weg"); },
    leseContainer: async () => { throw new Error("Salad weg"); }
  });
  assert.equal(e.ok, true, "die Ansicht bleibt bedienbar");
  assert.equal(e.kapazitaet.erreichbar, false);
  assert.equal(e.container.erreichbar, false);
  assert.equal(e.bewertung, "keine Quelle erreichbar");
});

test("der gefaehrliche Fall bekommt einen eigenen Satz: reserviert, aber die Maschine steht", async () => {
  const e = await workerUebersicht({
    env: {}, jetztMs: JETZT,
    leseKapazitaet: KAPAZITAET_OK,
    leseContainer: async () => ({ ok: true, data: { name: "smejj-glm", current_state: { status: "stopped", instance_status_counts: { running_count: 0 } } } })
  });
  assert.equal(e.bewertung, "Laeufe reserviert, aber die Maschine laeuft nicht");
});

test("alle Plaetze belegt wird benannt, nicht nur gezaehlt", async () => {
  const e = await workerUebersicht({
    env: {}, jetztMs: JETZT,
    leseKapazitaet: async () => ({ ok: true, snapshot: { activeSlots: 2, maxConcurrentWorkers: 2, reservedUsd: 8, maxGlobalReservedUsd: 20, jobs: [] } }),
    leseContainer: CONTAINER_OK
  });
  assert.equal(e.bewertung, "alle Plaetze belegt — neue Laeufe warten");
});

test("aus den Laeufen kommen nur Kennungen und Fristen, keine Inhalte", async () => {
  const e = await workerUebersicht({ env: {}, jetztMs: JETZT, leseKapazitaet: KAPAZITAET_OK, leseContainer: CONTAINER_OK });
  assert.deepEqual(Object.keys(e.kapazitaet.laeufe[0]).sort(), ["fristAm", "gruppe", "jobId"]);
});
