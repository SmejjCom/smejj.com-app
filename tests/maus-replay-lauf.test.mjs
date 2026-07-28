// smejj.com — Maus-Wiedergabe: Laden eines Laufs.
//
// Hintergrund (2026-07-28, live gemessen): Der Presign-Leseweg des
// Control-Servers liefert fuer die Artefakte der Engine echte 404 — Engine und
// Control-Server zeigen auf unterschiedliche IDrive-e2-Konten. Vorher riss das
// die gesamte Wiedergabe mit: ein Fehler beim Artefakt-Abruf beendete
// loadRun(), obwohl das Aktionsprotokoll ueber den Lauf-Status (vom
// Control-Server in SEINEM eigenen Speicher abgelegt) verfuegbar gewesen waere.
//
// Diese Tests halten das neue Verhalten fest: Schritte spielen weiter,
// Screenshots duerfen fehlen, und ein Teil-Erfolg wird ehrlich als solcher
// gemeldet statt als voller Erfolg.
import test from "node:test";
import assert from "node:assert/strict";
import { loadRun } from "../public/maus-replay.js";

const protokoll = { actionLog: [{ id: "s1", action: "navigate", ok: true }] };

test("runId traegt die Wiedergabe, wenn die Artefakte nicht ladbar sind", async () => {
  const run = await loadRun({ runId: "maus-test-1" }, {
    resolveRun: async () => ({ capsuleRef: "job_demo", planId: "plan_demo", protocol: protokoll }),
    ladeArtefakte: async () => { throw new Error("Artefakt nicht ladbar (404): manifest.json"); }
  });

  assert.equal(run.capsuleRef, "job_demo");
  assert.equal(run.planId, "plan_demo");
  assert.equal(run.protocol.actionLog.length, 1);
  assert.deepEqual(run.shots, []);
  assert.match(run.hinweis, /Screenshots nicht ladbar/);
});

test("Artefakt-Protokoll hat Vorrang und liefert die Screenshots", async () => {
  const artefaktProtokoll = { actionLog: [{ id: "a1" }, { id: "a2" }] };
  const run = await loadRun({ runId: "maus-test-2" }, {
    resolveRun: async () => ({ capsuleRef: "job_demo", planId: "plan_demo", protocol: protokoll }),
    ladeArtefakte: async () => ({ protocol: artefaktProtokoll, shots: [{ name: "s1", url: "blob:x" }] })
  });

  assert.equal(run.protocol.actionLog.length, 2, "Artefakt-Protokoll traegt die Screenshot-Zuordnung");
  assert.equal(run.shots.length, 1);
  assert.equal(run.hinweis, "", "voller Erfolg wird nicht als Teil-Erfolg gemeldet");
});

test("ohne Protokoll aus beiden Quellen bleibt es fail-closed", async () => {
  await assert.rejects(
    loadRun({ capsuleRef: "job_demo", planId: "plan_demo" }, {
      ladeArtefakte: async () => { throw new Error("Artefakt nicht ladbar (404): manifest.json"); }
    }),
    /Artefakt nicht ladbar/
  );
});

test("ohne capsuleRef/planId und ohne runId wird klar abgelehnt", async () => {
  await assert.rejects(loadRun({}, { ladeArtefakte: async () => ({ protocol: protokoll, shots: [] }) }),
    /capsuleRef \+ planId/);
});
