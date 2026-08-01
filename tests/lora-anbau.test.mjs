import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baueLoraAnbau, beantworteLoraRoute, starteLoraTakt } from "../workers/smejj-training-loop/loraAnbau.js";
import { createServer, startTicking } from "../workers/smejj-training-loop/worker.mjs";
import { loadLoopConfig } from "../workers/smejj-training-loop/config.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function attrappeAntwort() {
  const zustand = { status: null, koerper: null };
  return {
    zustand,
    res: {
      writeHead: (status) => { zustand.status = status; },
      end: (koerper) => { zustand.koerper = koerper ? JSON.parse(koerper) : null; }
    }
  };
}

test("der Anbau laesst fremde Routen unberuehrt", () => {
  const { res, zustand } = attrappeAntwort();
  assert.equal(beantworteLoraRoute({ method: "GET", url: "/health" }, res, null), false);
  assert.equal(zustand.status, null, "nichts geschrieben");
  assert.equal(beantworteLoraRoute({ method: "GET", url: "/verlauf" }, res, null), false);
  assert.equal(beantworteLoraRoute({ method: "POST", url: "/lora/health" }, res, null), false);
});

test("ein nicht geladener Anbau meldet das, statt den Dienst zu stoeren", () => {
  const { res, zustand } = attrappeAntwort();
  assert.equal(beantworteLoraRoute({ method: "GET", url: "/lora/health" }, res, null), true);
  assert.equal(zustand.status, 200);
  assert.equal(zustand.koerper.error, "lora_anbau_nicht_geladen");
});

test("ohne SMEJJ_LORA_LOOP_ENABLED wird kein Takt gestartet", async () => {
  const anbau = await baueLoraAnbau({ env: {}, repoRoot: REPO_ROOT, log: () => {} });
  assert.ok(anbau, "Anbau muss auch ohne Konfiguration ladbar sein");
  assert.equal(anbau.config.loopEnabled, false);
  let gestartet = 0;
  const timer = starteLoraTakt(anbau, { setIntervalImpl: () => { gestartet += 1; return { unref() {} }; } });
  assert.equal(timer, null);
  assert.equal(gestartet, 0);
});

test("der Anbau nennt in /lora/health jeden Grund, warum nicht trainiert wird", async () => {
  const anbau = await baueLoraAnbau({ env: {}, repoRoot: REPO_ROOT, log: () => {} });
  const { res, zustand } = attrappeAntwort();
  beantworteLoraRoute({ method: "GET", url: "/lora/health" }, res, anbau);
  assert.equal(zustand.koerper.ok, true);
  assert.equal(zustand.koerper.trainingEnabled, false);
  assert.ok(zustand.koerper.traineertNichtWeil.includes("keine_schriftliche_freigabe"));
});

test("NON-REGRESSION: /health und /verlauf antworten unveraendert, auch ohne Anbau", async () => {
  // Der Eval-Zyklus laeuft live seit 2026-07-29. Er muss exakt so weiter
  // antworten wie vorher, egal was der Anbau tut.
  const config = loadLoopConfig({});
  const loop = { getStatus: () => ({ state: "running" }), getVerlauf: () => [], tick: async () => {} };
  for (const anbau of [null, await baueLoraAnbau({ env: {}, repoRoot: REPO_ROOT, log: () => {} })]) {
    const server = createServer({ config, loop, loraAnbau: anbau });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    try {
      const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.loopEnabled, false);
      assert.equal(health.state, "running");
      const verlauf = await (await fetch(`http://127.0.0.1:${port}/verlauf`)).json();
      assert.equal(verlauf.ok, true);
      const fehlt = await fetch(`http://127.0.0.1:${port}/gibtesnicht`);
      assert.equal(fehlt.status, 404);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }
});

test("NON-REGRESSION: der Eval-Takt startet unabhaengig vom Anbau", () => {
  const config = loadLoopConfig({ SMEJJ_TRAINING_LOOP_ENABLED: "YES" });
  let gestartet = 0;
  const timer = startTicking(
    { tick: async () => {} },
    { config, log: () => {}, setIntervalImpl: () => { gestartet += 1; return { unref() {} }; }, unrefTimer: true }
  );
  assert.ok(timer);
  assert.equal(gestartet, 1);
});
