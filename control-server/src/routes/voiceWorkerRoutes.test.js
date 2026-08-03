// smejj.com — Unit-Tests Voice-Routen (Token fail-closed, Budget-Gate, Proxy).
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  handleVoiceHeartbeat,
  handleVoiceSessionStart,
  handleVoiceStatus,
  handleVoiceTranscribe,
  requireVoiceToken,
  voiceLifecycle
} from "./voiceWorkerRoutes.js";

const TOKEN = "voice-token-1234567890";

const FULL_ENV = Object.freeze({
  SALAD_ORGANIZATION_NAME: "smejjcom",
  SALAD_PROJECT_NAME: "default",
  SALAD_API_KEY: "salad-test-key",
  SMEJJ_VOICE_STT_URL: "https://stt.example.salad.cloud",
  SMEJJ_VOICE_TTS_URL: "https://tts.example.salad.cloud",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "20",
  SMEJJ_VOICE_WORKERS_ENABLED: "YES",
  SMEJJ_VOICE_SESSION_TOKEN: TOKEN,
  SMEJJ_BUDGET_MAX_USD_PER_JOB: "0.05",
  SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
  SMEJJ_WORKER_BUDGET_USD: "0.03",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "15"
});

function fakeReq({ token = TOKEN, contentType = "application/json" } = {}) {
  const req = new EventEmitter();
  req.headers = { "x-smejj-voice-token": token, "content-type": contentType };
  return req;
}

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(chunk) { this.body += chunk || ""; this.ended = true; }
  };
  return res;
}

function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    const reply = responder(url, options);
    return {
      ok: reply.status >= 200 && reply.status <= 299,
      status: reply.status,
      headers: { get: (name) => (reply.headers || {})[name.toLowerCase()] || null },
      text: async () => (typeof reply.body === "string" ? reply.body : JSON.stringify(reply.data || {})),
      body: null
    };
  };
  impl.calls = calls;
  return impl;
}

test("token: fehlende Konfiguration => 503 fail-closed", () => {
  const verdict = requireVoiceToken(fakeReq(), { ...FULL_ENV, SMEJJ_VOICE_SESSION_TOKEN: "" });
  assert.deepEqual({ ok: verdict.ok, status: verdict.status }, { ok: false, status: 503 });
});

test("token: falsches Token => 401", () => {
  const verdict = requireVoiceToken(fakeReq({ token: "wrong-token-000000" }), FULL_ENV);
  assert.deepEqual({ ok: verdict.ok, status: verdict.status }, { ok: false, status: 401 });
});

test("token: korrekt => ok", () => {
  assert.equal(requireVoiceToken(fakeReq(), FULL_ENV).ok, true);
});

test("start: ohne Token kein einziger Salad-Call", async () => {
  const impl = fakeFetch(() => ({ status: 202 }));
  const res = fakeRes();
  await handleVoiceSessionStart(fakeReq({ token: "nope-nope-nope-nope" }), res, { env: FULL_ENV, fetchImpl: impl });
  assert.equal(res.statusCode, 401);
  assert.equal(impl.calls.length, 0);
});

test("start: Budget verletzt => 402, kein Start", async () => {
  const impl = fakeFetch(() => ({ status: 202 }));
  const res = fakeRes();
  const env = { ...FULL_ENV, SMEJJ_WORKER_BUDGET_USD: "0.10" }; // > MAX_USD_PER_JOB
  await handleVoiceSessionStart(fakeReq(), res, { env, fetchImpl: impl });
  assert.equal(res.statusCode, 402);
  assert.equal(JSON.parse(res.body).paidServicesStarted, false);
  assert.equal(impl.calls.length, 0);
});

test("start: konfiguriert + Budget ok => startet nur die TTS-GPU (Groq-Ohr macht STT)", async () => {
  const impl = fakeFetch(() => ({ status: 202 }));
  const res = fakeRes();
  await handleVoiceSessionStart(fakeReq(), res, { env: FULL_ENV, fetchImpl: impl });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.paidServicesStarted, true);
  assert.equal(payload.idleShutdownSeconds, 120);
  const starts = impl.calls.filter((c) => c.url.includes("/start"));
  assert.equal(starts.length, 1, "Freigabe 2026-08-03: die STT-GPU wird nicht mehr mitgestartet");
  assert.ok(starts[0].url.includes("smejj-voice-tts"), "und zwar die TTS-Gruppe");
  voiceLifecycle.noteStopped(); // Testzustand aufraeumen
});

test("start: mit SMEJJ_VOICE_STT_ENABLED=YES starten wieder beide Gruppen", async () => {
  const impl = fakeFetch(() => ({ status: 202 }));
  const res = fakeRes();
  await handleVoiceSessionStart(fakeReq(), res, {
    env: { ...FULL_ENV, SMEJJ_VOICE_STT_ENABLED: "YES" },
    fetchImpl: impl
  });
  assert.equal(res.statusCode, 200);
  assert.equal(impl.calls.filter((c) => c.url.includes("/start")).length, 2);
  voiceLifecycle.noteStopped();
});

test("status: meldet running nur wenn beide Gruppen laufen", async () => {
  const impl = fakeFetch((url) => ({
    status: 200,
    data: { current_state: { status: url.includes("stt") ? "running" : "stopped" } }
  }));
  const res = fakeRes();
  await handleVoiceStatus(fakeReq(), res, { env: FULL_ENV, fetchImpl: impl });
  const payload = JSON.parse(res.body);
  assert.equal(payload.running, false);
  assert.equal(payload.stt.running, true);
  assert.equal(payload.tts.running, false);
});

test("heartbeat: aktualisiert lastActivity", async () => {
  voiceLifecycle.noteStarted();
  const before = voiceLifecycle.status().lastActivityMs;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const res = fakeRes();
  await handleVoiceHeartbeat(fakeReq(), res, { env: FULL_ENV });
  assert.equal(res.statusCode, 200);
  assert.ok(voiceLifecycle.status().lastActivityMs >= before);
  voiceLifecycle.noteStopped();
});

test("transcribe: leitet Body an STT weiter, Key nur im Header serverseitig", async () => {
  const impl = fakeFetch(() => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "merhaba" })
  }));
  const req = fakeReq({ contentType: "multipart/form-data; boundary=x" });
  const res = fakeRes();
  const pending = handleVoiceTranscribe(req, res, { env: FULL_ENV, fetchImpl: impl });
  req.emit("data", Buffer.from("audio-bytes"));
  req.emit("end");
  await pending;
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).text, "merhaba");
  assert.equal(impl.calls.length, 1);
  assert.ok(impl.calls[0].url.startsWith("https://stt.example.salad.cloud/v1/audio/transcriptions"));
  assert.equal(impl.calls[0].options.headers["Salad-Api-Key"], "salad-test-key");
});

test("transcribe: zu grosser Body => 413, kein Upstream-Call", async () => {
  const impl = fakeFetch(() => ({ status: 200 }));
  const req = fakeReq();
  const res = fakeRes();
  const pending = handleVoiceTranscribe(req, res, { env: FULL_ENV, fetchImpl: impl });
  req.emit("data", Buffer.alloc(8_000_001));
  req.emit("end");
  await pending;
  assert.equal(res.statusCode, 413);
  assert.equal(impl.calls.length, 0);
});
