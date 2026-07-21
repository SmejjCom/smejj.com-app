// smejj.com — Unit-Tests Voice-Worker-Steuerung (ohne Netz, ohne Timer).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createVoiceLifecycle,
  evaluateVoiceLifecycle,
  readVoiceWorkerConfig,
  startVoiceWorkers,
  startVoiceSupervisor,
  stopVoiceWorkers
} from "./voiceWorkerControl.js";

const FULL_ENV = Object.freeze({
  SALAD_ORGANIZATION_NAME: "smejjcom",
  SALAD_PROJECT_NAME: "default",
  SALAD_API_KEY: "salad-test-key",
  SMEJJ_VOICE_STT_URL: "https://stt.example.salad.cloud",
  SMEJJ_VOICE_TTS_URL: "https://tts.example.salad.cloud",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "20",
  SMEJJ_VOICE_WORKERS_ENABLED: "YES"
});

function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    const body = responder(url, options);
    return {
      ok: body.status >= 200 && body.status <= 299,
      status: body.status,
      text: async () => JSON.stringify(body.data || {})
    };
  };
  impl.calls = calls;
  return impl;
}

test("config: fail-closed ohne ENABLED-Flag", () => {
  const config = readVoiceWorkerConfig({ ...FULL_ENV, SMEJJ_VOICE_WORKERS_ENABLED: "" });
  assert.equal(config.configured, false);
  assert.ok(config.missing.includes("SMEJJ_VOICE_WORKERS_ENABLED"));
});

test("config: fail-closed ohne Laufzeit-Deckel", () => {
  const config = readVoiceWorkerConfig({ ...FULL_ENV, SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "" });
  assert.equal(config.configured, false);
  assert.ok(config.missing.includes("SMEJJ_BUDGET_MAX_RUNTIME_MINUTES"));
});

test("config: vollstaendig => configured mit Defaults", () => {
  const config = readVoiceWorkerConfig(FULL_ENV);
  assert.equal(config.configured, true);
  assert.equal(config.sttGroup, "smejj-voice-stt");
  assert.equal(config.ttsGroup, "smejj-voice-tts");
  assert.equal(config.idleShutdownSeconds, 120);
  assert.equal(config.sttPath, "/v1/audio/transcriptions");
});

test("start: beide Gruppen ok => ok", async () => {
  const config = readVoiceWorkerConfig(FULL_ENV);
  const impl = fakeFetch(() => ({ status: 202, data: {} }));
  const result = await startVoiceWorkers({ config, fetchImpl: impl });
  assert.equal(result.ok, true);
  assert.equal(impl.calls.length, 2);
  assert.ok(impl.calls.every((call) => call.url.includes("/start")));
});

test("start: halber Erfolg => Rollback-Stop beider Gruppen", async () => {
  const config = readVoiceWorkerConfig(FULL_ENV);
  const impl = fakeFetch((url) => {
    if (url.includes("smejj-voice-tts/start")) return { status: 500, data: {} };
    return { status: 202, data: {} };
  });
  const result = await startVoiceWorkers({ config, fetchImpl: impl });
  assert.equal(result.ok, false);
  const stops = impl.calls.filter((call) => call.url.includes("/stop"));
  assert.equal(stops.length, 2, "beide Gruppen muessen zurueckgestoppt werden");
});

test("start: unkonfiguriert => kein einziger API-Call", async () => {
  const config = readVoiceWorkerConfig({});
  const impl = fakeFetch(() => ({ status: 202, data: {} }));
  const result = await startVoiceWorkers({ config, fetchImpl: impl });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "voice_workers_not_configured");
  assert.equal(impl.calls.length, 0);
});

test("stop: meldet beide Gruppen", async () => {
  const config = readVoiceWorkerConfig(FULL_ENV);
  const impl = fakeFetch(() => ({ status: 202, data: {} }));
  const result = await stopVoiceWorkers({ config, fetchImpl: impl, reason: "idle_timeout" });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "idle_timeout");
});

test("lifecycle: Laufzeit-Deckel schlaegt Idle", () => {
  const verdict = evaluateVoiceLifecycle({
    nowMs: 21 * 60_000,
    running: true,
    startedAtMs: 0,
    lastActivityMs: 20.9 * 60_000,
    idleShutdownSeconds: 120,
    maxRuntimeMinutes: 20
  });
  assert.equal(verdict.shouldStop, true);
  assert.equal(verdict.reason, "runtime_cap_reached");
});

test("lifecycle: Idle stoppt nach Schwelle, Aktivitaet verhindert", () => {
  let clock = 1_000;
  const lifecycle = createVoiceLifecycle({ now: () => clock });
  const config = { idleShutdownSeconds: 120, maxRuntimeMinutes: 20 };
  lifecycle.noteStarted();
  clock += 119_000;
  assert.equal(lifecycle.evaluate(config).shouldStop, false);
  lifecycle.touch();
  clock += 119_000;
  assert.equal(lifecycle.evaluate(config).shouldStop, false, "touch reset");
  clock += 2_000;
  const verdict = lifecycle.evaluate(config);
  assert.equal(verdict.shouldStop, true);
  assert.equal(verdict.reason, "idle_timeout");
});

test("lifecycle: nicht gestartet => nie stoppen", () => {
  const lifecycle = createVoiceLifecycle({ now: () => 999_999 });
  assert.equal(lifecycle.evaluate({ idleShutdownSeconds: 1, maxRuntimeMinutes: 1 }).shouldStop, false);
});

test("supervisor: ruft stopAll genau einmal bei Idle", async () => {
  let clock = 0;
  const lifecycle = createVoiceLifecycle({ now: () => clock });
  const config = { idleShutdownSeconds: 60, maxRuntimeMinutes: 20, supervisorPollSeconds: 15 };
  lifecycle.noteStarted();
  const stops = [];
  let tick = null;
  const supervisor = startVoiceSupervisor({
    config,
    lifecycle,
    stopAll: async (reason) => stops.push(reason),
    setIntervalImpl: (fn) => { tick = fn; return { unref() {} }; },
    clearIntervalImpl: () => {}
  });
  clock = 30_000; await tick();
  assert.equal(stops.length, 0, "vor Schwelle kein Stop");
  clock = 61_000; await tick();
  assert.deepEqual(stops, ["idle_timeout"]);
  await tick();
  assert.equal(stops.length, 1, "nach Stop kein weiterer Stop (noteStopped)");
  supervisor.stop();
});
