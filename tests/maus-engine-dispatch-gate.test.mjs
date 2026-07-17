// smejj.com — Worker-Health-Gate vor jedem Maus-Dispatch (Fix 2026-07-15).
// Beweist: (1) Dispatch wartet, bis der exit-after-run-Worker wieder bereit ist,
// (2) fail-closed-Abbruch mit klarem Grund, wenn der Worker nie bereit wird,
// (3) kein blindes Senden an einen toten Worker.
import test from "node:test";
import assert from "node:assert/strict";
import { waitForWorkerReady } from "../control-server/src/routes/mausEngineRoutes.js";

const config = { workerUrl: "https://worker.example", token: "t" };
const sofort = () => Promise.resolve();

test("gate: bereit beim ersten Versuch", async () => {
  const aufrufe = [];
  const fetchImpl = async (url) => {
    aufrufe.push(url);
    return { ok: true, json: async () => ({ ok: true, engine: "smejj.com maus-engine" }) };
  };
  const result = await waitForWorkerReady({ config, fetchImpl, maxWaitMs: 1000, pollMs: 10, sleep: sofort });
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 1);
  assert.equal(aufrufe[0], "https://worker.example/health");
});

test("gate: wartet 503-Phase ab und wird dann bereit (exit-after-run-Neustart)", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n < 4) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const result = await waitForWorkerReady({ config, fetchImpl, maxWaitMs: 60_000, pollMs: 1, sleep: sofort });
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 4);
});

test("gate: fail-closed wenn Worker nie bereit wird (auch bei Netzfehlern)", async () => {
  const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  let now = 0;
  const echteNow = Date.now;
  Date.now = () => (now += 50);
  try {
    const result = await waitForWorkerReady({ config, fetchImpl, maxWaitMs: 200, pollMs: 10, sleep: sofort });
    assert.equal(result.ready, false);
    assert.ok(result.attempts >= 1);
  } finally {
    Date.now = echteNow;
  }
});

test("gate: HTML-Antwort des Gateways (ok ohne JSON-ok) zaehlt als nicht bereit", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) return { ok: true, json: async () => { throw new Error("kein json"); } };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const result = await waitForWorkerReady({ config, fetchImpl, maxWaitMs: 60_000, pollMs: 1, sleep: sofort });
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 2);
});
