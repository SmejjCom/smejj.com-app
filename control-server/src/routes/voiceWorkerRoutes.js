// smejj.com control-server — Voice-Routen (Single Responsibility: HTTP-Kante
// fuer Start/Heartbeat/Stop/Status + Audio-Proxy zu den Voice-Workern).
//
// Sicherheitsmodell:
// - Der Salad-API-Key bleibt ausschliesslich serverseitig; der Browser erhaelt
//   niemals Schluessel oder direkte, authentifizierte Worker-URLs.
// - Alle Routen verlangen das Sitzungs-Token (SMEJJ_VOICE_SESSION_TOKEN,
//   fail-closed: nicht gesetzt => 503, falsch => 401).
// - Start nur hinter Budget-Gate (evaluateWorkerBudget, gleiche ENV-Keys wie
//   alle anderen Worker) + SMEJJ_VOICE_WORKERS_ENABLED=YES.
import { timingSafeEqual } from "node:crypto";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { json, privateJson } from "../http/respond.js";
import {
  createVoiceLifecycle,
  getVoiceWorkersStatus,
  readVoiceWorkerConfig,
  startVoiceWorkers,
  startVoiceSupervisor,
  stopVoiceWorkers
} from "../voice/voiceWorkerControl.js";

const MAX_AUDIO_BODY_BYTES = 8_000_000; // Sprach-Schnipsel sind klein; harter Deckel.

export const voiceLifecycle = createVoiceLifecycle();
let supervisor = null;

export function ensureVoiceSupervisor({ env = process.env, stopAll } = {}) {
  if (supervisor) return supervisor;
  const config = readVoiceWorkerConfig(env);
  supervisor = startVoiceSupervisor({
    config,
    lifecycle: voiceLifecycle,
    stopAll: stopAll || ((reason) => stopVoiceWorkers({ config: readVoiceWorkerConfig(env), reason }))
  });
  return supervisor;
}

export function requireVoiceToken(req, env = process.env) {
  const expected = String(env.SMEJJ_VOICE_SESSION_TOKEN || "").trim();
  if (expected.length < 16) return { ok: false, status: 503, reason: "voice_token_not_configured" };
  const provided = String(req?.headers?.["x-smejj-voice-token"] || "").trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);
  return match ? { ok: true } : { ok: false, status: 401, reason: "voice_token_invalid" };
}

export async function handleVoiceStatus(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  const status = await getVoiceWorkersStatus({ config, fetchImpl });
  return privateJson(res, 200, {
    ok: status.ok === true,
    running: status.running === true,
    stt: status.stt || null,
    tts: status.tts || null,
    lifecycle: voiceLifecycle.status(),
    configured: config.configured,
    missing: config.missing
  });
}

export async function handleVoiceSessionStart(req, res, {
  env = process.env,
  fetchImpl = fetch,
  activeWorkers = 0
} = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  if (!config.configured) {
    return privateJson(res, 503, {
      ok: false,
      reason: "voice_workers_not_configured",
      missing: config.missing,
      paidServicesStarted: false
    });
  }
  const budget = evaluateWorkerBudget({ env, activeWorkers });
  if (!budget.ok) {
    return privateJson(res, 402, {
      ok: false,
      reason: "budget_gate_denied",
      budget,
      paidServicesStarted: false
    });
  }
  ensureVoiceSupervisor({ env });
  const result = await startVoiceWorkers({ config, fetchImpl });
  if (result.ok !== true) {
    return privateJson(res, 502, {
      ok: false,
      reason: result.reason,
      stt: result.stt || null,
      tts: result.tts || null,
      paidServicesStarted: false
    });
  }
  voiceLifecycle.noteStarted();
  return privateJson(res, 200, {
    ok: true,
    reason: "accepted",
    paidServicesStarted: true,
    idleShutdownSeconds: config.idleShutdownSeconds,
    maxRuntimeMinutes: config.maxRuntimeMinutes,
    stt: result.stt,
    tts: result.tts
  });
}

export async function handleVoiceHeartbeat(req, res, { env = process.env } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  voiceLifecycle.touch();
  return privateJson(res, 200, { ok: true, lifecycle: voiceLifecycle.status() });
}

export async function handleVoiceSessionStop(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  const result = await stopVoiceWorkers({ config, fetchImpl, reason: "user_stop" });
  voiceLifecycle.noteStopped();
  return privateJson(res, result.ok ? 200 : 502, {
    ok: result.ok === true,
    reason: result.reason,
    stt: result.stt || null,
    tts: result.tts || null
  });
}

// ---------------------------------------------------------------------------
// Audio-Proxy: Browser -> control-server -> Worker-Gateway (Key bleibt Server).
// ---------------------------------------------------------------------------
export async function handleVoiceTranscribe(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  if (!config.configured) return privateJson(res, 503, { ok: false, reason: "voice_workers_not_configured" });
  const body = await readLimitedBody(req);
  if (body.ok !== true) return privateJson(res, 413, { ok: false, reason: "audio_body_too_large" });
  voiceLifecycle.touch();
  let upstream;
  try {
    upstream = await fetchImpl(`${config.sttUrl}${config.sttPath}`, {
      method: "POST",
      headers: {
        "Salad-Api-Key": config.apiKey,
        "content-type": String(req.headers["content-type"] || "application/octet-stream")
      },
      body: body.buffer
    });
  } catch {
    return privateJson(res, 502, { ok: false, reason: "voice_stt_unreachable" });
  }
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "private, no-store"
  });
  return res.end(text);
}

export async function handleVoiceSpeak(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  if (!config.configured) return privateJson(res, 503, { ok: false, reason: "voice_workers_not_configured" });
  const body = await readLimitedBody(req);
  if (body.ok !== true) return privateJson(res, 413, { ok: false, reason: "tts_body_too_large" });
  voiceLifecycle.touch();
  let upstream;
  try {
    upstream = await fetchImpl(`${config.ttsUrl}${config.ttsPath}`, {
      method: "POST",
      headers: {
        "Salad-Api-Key": config.apiKey,
        "content-type": String(req.headers["content-type"] || "application/json")
      },
      body: body.buffer
    });
  } catch {
    return privateJson(res, 502, { ok: false, reason: "voice_tts_unreachable" });
  }
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "audio/wav",
    "Cache-Control": "private, no-store"
  });
  if (!upstream.body) return res.end();
  // Streaming-Durchleitung: erster Ton beim Nutzer, bevor die Datei fertig ist.
  const { Readable } = await import("node:stream");
  Readable.fromWeb(upstream.body).pipe(res);
  return undefined;
}

function readLimitedBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      total += chunk.length;
      if (total > MAX_AUDIO_BODY_BYTES) {
        done = true;
        resolve({ ok: false, reason: "body_too_large" });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolve({ ok: true, buffer: Buffer.concat(chunks) });
    });
    req.on("error", () => {
      if (!done) resolve({ ok: false, reason: "body_read_failed" });
    });
  });
}

// Sprecher-Daten des XTTS-Workers (GET /studio_speakers) — Teil des Audio-
// Proxys: die Bridge braucht die Latents fuer /tts_stream, darf den Worker
// aber nie direkt erreichen (Org-Schluessel bleibt hier).
export async function handleVoiceSpeakers(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const gate = requireVoiceToken(req, env);
  if (!gate.ok) return privateJson(res, gate.status, { ok: false, reason: gate.reason });
  const config = readVoiceWorkerConfig(env);
  if (!config.configured) return privateJson(res, 503, { ok: false, reason: "voice_workers_not_configured" });
  voiceLifecycle.touch();
  let upstream;
  try {
    upstream = await fetchImpl(`${config.ttsUrl}${String(env.SMEJJ_VOICE_TTS_SPEAKERS_PATH || "/studio_speakers")}`, {
      headers: { "Salad-Api-Key": config.apiKey, accept: "application/json" }
    });
  } catch {
    return privateJson(res, 502, { ok: false, reason: "voice_tts_unreachable" });
  }
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "private, no-store"
  });
  return res.end(text);
}

// Eine Kante fuer den Server: true = Voice-Route hat geantwortet.
// Alle Pfade sind Token-gepflichtig (requireVoiceToken in jedem Handler).
export async function handleVoiceRoute(req, url, res, { env = process.env } = {}) {
  const p = url.pathname;
  if (!p.startsWith("/api/voice/")) return false;
  const post = req.method === "POST";
  if (p === "/api/voice/worker/status") { await handleVoiceStatus(req, res, { env }); return true; }
  if (post && p === "/api/voice/session/start") { await handleVoiceSessionStart(req, res, { env }); return true; }
  if (post && p === "/api/voice/session/heartbeat") { await handleVoiceHeartbeat(req, res, { env }); return true; }
  if (post && p === "/api/voice/session/stop") { await handleVoiceSessionStop(req, res, { env }); return true; }
  if (post && p === "/api/voice/worker/transcribe") { await handleVoiceTranscribe(req, res, { env }); return true; }
  if (post && p === "/api/voice/worker/speak") { await handleVoiceSpeak(req, res, { env }); return true; }
  if (p === "/api/voice/worker/speakers") { await handleVoiceSpeakers(req, res, { env }); return true; }
  return false;
}

export { json };
