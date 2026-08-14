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

// ---- Stillgelegte Quelle ist kein Ausfall (2026-08-14) ----------------------
//
// Befund aus der Adminbereich-Pruefung: die Seite meldete "keine Quelle
// erreichbar" und las sich wie ein Totalausfall. Tatsaechlich war Salad am
// 13.08.2026 abgeschaltet worden — da ist nichts kaputt, da ist nichts mehr.
// Ein Alarm, der dauerhaft steht, wird ueberlesen; dann faellt der ECHTE
// Ausfall auch nicht mehr auf.
test("abgeschaltete Salad-Quelle wird als stillgelegt gemeldet, nicht als Ausfall", async () => {
  const u = await workerUebersicht({
    env: { SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "2", SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "5" },
    leseKapazitaet: async () => ({ ok: true, maxConcurrentWorkers: 2, activeCount: 0, reservedUsd: 0, jobs: [] }),
    leseContainer: async () => ({ ok: false, reason: "salad_api_not_configured" })
  });
  assert.equal(u.container.stillgelegt, true, "die Quelle ist stillgelegt, nicht kaputt");
  assert.match(u.container.hinweis || "", /abgeschaltet/);
  assert.equal(u.bewertung, "unauffaellig", "eine stillgelegte Quelle darf die Bewertung nicht rot faerben");
});

test("eine WIRKLICH kaputte Quelle bleibt ein Ausfall", async () => {
  // Gegenprobe: ohne sie wuerde die Regel oben jeden Fehler verschlucken.
  const u = await workerUebersicht({
    env: {},
    leseKapazitaet: async () => ({ ok: false, reason: "kaputt" }),
    leseContainer: async () => ({ ok: false, reason: "salad_http_500" })
  });
  assert.equal(u.container.stillgelegt, undefined);
  assert.equal(u.bewertung, "keine Quelle erreichbar");
});
