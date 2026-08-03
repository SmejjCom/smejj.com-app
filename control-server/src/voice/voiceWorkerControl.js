// smejj.com control-server — Voice-Worker-Steuerung (Single Responsibility:
// Start/Stop/Idle-Abschaltung der beiden Salad-Gruppen smejj-voice-stt/-tts).
//
// Kostenbremse (verbindlich, Freigabe 2026-07-19 "nur bei Nutzung, max 10 $/Monat"):
// 1. fail-closed: ohne vollstaendige Konfiguration + SMEJJ_VOICE_WORKERS_ENABLED=YES
//    wird kein Start ausgefuehrt.
// 2. Idle-Abschaltung: ohne Sprach-Aktivitaet stoppt der Supervisor beide Gruppen.
// 3. Laufzeit-Deckel: SMEJJ_BUDGET_MAX_RUNTIME_MINUTES (gleicher Key wie
//    budgetGate.js/watchdogLeaseStore.js) beendet auch eine aktive Nutzung hart.
//
// Kein Zustand ausserhalb des Prozesses; kein Secret verlaesst den Server.

const SALAD_API_BASE = "https://api.salad.com/api/public";

export function readVoiceWorkerConfig(env = {}) {
  const organization = safeName(env.SALAD_ORGANIZATION_NAME || "");
  const project = safeName(env.SALAD_PROJECT_NAME || "");
  const apiKey = String(env.SALAD_API_KEY || "").trim();
  const sttGroup = safeName(env.SMEJJ_VOICE_STT_GROUP || "smejj-voice-stt");
  const ttsGroup = safeName(env.SMEJJ_VOICE_TTS_GROUP || "smejj-voice-tts");
  const sttUrl = safeUrl(env.SMEJJ_VOICE_STT_URL || "");
  const ttsUrl = safeUrl(env.SMEJJ_VOICE_TTS_URL || "");
  const enabled = env.SMEJJ_VOICE_WORKERS_ENABLED === "YES";
  // Freigabe Sprachserver-Optimierung (Betreiber, 2026-08-03): Die Transkription
  // macht seit Stufe 4 das Groq-Ohr in der Bridge — die STT-GPU mitzustarten
  // kostet Geld und Startzeit, ohne je benutzt zu werden. Standard daher AUS;
  // "YES" holt sie zurueck, ohne Code-Aenderung (Rueckweg bleibt offen).
  const sttEnabled = env.SMEJJ_VOICE_STT_ENABLED === "YES";
  const idleShutdownSeconds = boundedNumber(env.SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS, 120, 30, 3600);
  // Voice-eigener Laufzeit-Deckel (2026-08-03): Der globale 30-min-Deckel
  // gehoert den Coding-Jobs — der XTTS-Kaltstart (Modell-Download ~2 GB auf
  // Salad-Knoten) brauchte im ersten Produktionslauf mehr als 30 min und wurde
  // vom Supervisor hart beendet, bevor die Stimme je antwortete. Ohne eigenen
  // Wert gilt unveraendert der globale Deckel (fail-closed bleibt bestehen).
  const maxRuntimeMinutes = boundedNumber(
    env.SMEJJ_VOICE_MAX_RUNTIME_MINUTES ?? env.SMEJJ_BUDGET_MAX_RUNTIME_MINUTES, 0, 1, 1440);
  const supervisorPollSeconds = boundedNumber(env.SMEJJ_VOICE_LIFECYCLE_POLL_SECONDS, 15, 5, 300);
  const missing = [
    !organization && "SALAD_ORGANIZATION_NAME",
    !project && "SALAD_PROJECT_NAME",
    !apiKey && "SALAD_API_KEY",
    // STT-URL nur verlangen, wenn die STT-GPU ueberhaupt genutzt wird.
    (env.SMEJJ_VOICE_STT_ENABLED === "YES") && !sttUrl && "SMEJJ_VOICE_STT_URL",
    !ttsUrl && "SMEJJ_VOICE_TTS_URL",
    !maxRuntimeMinutes && "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES",
    !enabled && "SMEJJ_VOICE_WORKERS_ENABLED"
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    enabled,
    organization,
    project,
    apiKey,
    sttGroup,
    ttsGroup,
    sttEnabled,
    sttUrl,
    ttsUrl,
    // VERIFY im Live-Test: Whisper-Pfad ist dokumentiert; XTTS-Pfad konfigurierbar.
    sttPath: String(env.SMEJJ_VOICE_STT_PATH || "/v1/audio/transcriptions"),
    ttsPath: String(env.SMEJJ_VOICE_TTS_PATH || "/tts_stream"),
    idleShutdownSeconds,
    maxRuntimeMinutes,
    supervisorPollSeconds,
    timeoutMs: boundedNumber(env.SALAD_API_TIMEOUT_MS, 10_000, 1_000, 30_000),
    apiBase: String(env.SALAD_API_BASE || SALAD_API_BASE).replace(/\/$/, "")
  };
}

async function saladGroupRequest(config, method, group, action, fetchImpl = fetch) {
  const suffix = action ? `/${action}` : "";
  const path = `/organizations/${config.organization}/projects/${config.project}/containers/${group}${suffix}`;
  let response;
  try {
    response = await fetchImpl(`${config.apiBase}${path}`, {
      method,
      signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(config.timeoutMs)
        : undefined,
      headers: { "Salad-Api-Key": config.apiKey, accept: "application/json" }
    });
  } catch {
    return { ok: false, status: 0, reason: "salad_api_unreachable", uncertain: true };
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: "salad_non_json_response" };
  }
  return { ok: response.ok, status: response.status, data };
}

function groupSummary(result) {
  const state = String(result?.data?.current_state?.status || "").toLowerCase();
  return {
    ok: result?.ok === true,
    providerStatus: Number.isInteger(result?.status) ? result.status : 0,
    lifecycleState: state || "unknown",
    running: state === "running",
    uncertain: result?.uncertain === true
  };
}

export async function startVoiceWorkers({ config, fetchImpl = fetch } = {}) {
  if (config?.configured !== true) {
    return { ok: false, reason: "voice_workers_not_configured", missing: config?.missing || [] };
  }
  // Die STT-GPU wird nur gestartet, wenn sie ausdruecklich aktiviert ist
  // (sonst uebernimmt das Groq-Ohr die Transkription — siehe readVoiceWorkerConfig).
  const [stt, tts] = await Promise.all([
    config.sttEnabled
      ? saladGroupRequest(config, "POST", config.sttGroup, "start", fetchImpl)
      : Promise.resolve({ ok: true, status: 0, data: null, skipped: true }),
    saladGroupRequest(config, "POST", config.ttsGroup, "start", fetchImpl)
  ]);
  const ok = stt.ok === true && tts.ok === true;
  // Fail-safe, bewusst streng: JEDER unvollstaendige Start wird zurueckgestoppt.
  // Frueher lief der Rollback nur bei "halbem Erfolg" — mit abgeschalteter
  // STT-GPU blieb ein fehlgeschlagener TTS-Start damit ungeprueft stehen.
  // Ein Stop auf eine bereits gestoppte Gruppe ist wirkungslos und kostenlos;
  // eine uebersehene laufende GPU waere teuer. Deshalb im Zweifel stoppen.
  if (!ok) {
    await stopVoiceWorkers({ config, fetchImpl, reason: "partial_start_rollback" });
  }
  return {
    ok,
    reason: ok ? "accepted" : "voice_start_failed",
    stt: stt.skipped ? { ok: true, skipped: true, reason: "stt_disabled_groq_ear" } : groupSummary(stt),
    tts: groupSummary(tts)
  };
}

// Stoppen gilt IMMER fuer BEIDE Gruppen — auch wenn die STT-GPU gar nicht
// gestartet wird. Sicherheitsnetz: eine von Hand oder versehentlich laufende
// Gruppe muss der Supervisor trotzdem abschalten koennen (Kostenbremse).
export async function stopVoiceWorkers({ config, fetchImpl = fetch, reason = "manual_stop" } = {}) {
  if (!config?.organization || !config?.project || !config?.apiKey) {
    return { ok: false, reason: "voice_workers_not_configured" };
  }
  const [stt, tts] = await Promise.all([
    saladGroupRequest(config, "POST", config.sttGroup, "stop", fetchImpl),
    saladGroupRequest(config, "POST", config.ttsGroup, "stop", fetchImpl)
  ]);
  return {
    ok: stt.ok === true && tts.ok === true,
    reason,
    stt: groupSummary(stt),
    tts: groupSummary(tts)
  };
}

export async function getVoiceWorkersStatus({ config, fetchImpl = fetch } = {}) {
  if (!config?.organization || !config?.project || !config?.apiKey) {
    return { ok: false, reason: "voice_workers_not_configured" };
  }
  const [stt, tts] = await Promise.all([
    saladGroupRequest(config, "GET", config.sttGroup, "", fetchImpl),
    saladGroupRequest(config, "GET", config.ttsGroup, "", fetchImpl)
  ]);
  const sttSummary = groupSummary(stt);
  const ttsSummary = groupSummary(tts);
  // Bei abgeschalteter STT-GPU haengt "laeuft" allein an der TTS-Gruppe —
  // sonst meldete der Status dauerhaft false und die Weck-Logik liefe leer.
  return {
    ok: config.sttEnabled ? (sttSummary.ok && ttsSummary.ok) : ttsSummary.ok,
    running: config.sttEnabled ? (sttSummary.running && ttsSummary.running) : ttsSummary.running,
    stt: sttSummary,
    tts: ttsSummary
  };
}

// ---------------------------------------------------------------------------
// Lebenszyklus (pure Logik, ohne Timer — vollstaendig unit-testbar).
// ---------------------------------------------------------------------------
export function evaluateVoiceLifecycle({
  nowMs,
  running = false,
  startedAtMs = 0,
  lastActivityMs = 0,
  idleShutdownSeconds,
  maxRuntimeMinutes
} = {}) {
  // Expliziter running-Zustand statt Zeitstempel-Wahrheitswert: eine Startzeit
  // von exakt 0 (Test-Uhren, Epoche) darf nicht als "nicht gestartet" gelten.
  if (running !== true) return { shouldStop: false, reason: "not_running" };
  const runtimeMs = nowMs - startedAtMs;
  if (maxRuntimeMinutes > 0 && runtimeMs >= maxRuntimeMinutes * 60_000) {
    return { shouldStop: true, reason: "runtime_cap_reached" };
  }
  const idleMs = nowMs - (lastActivityMs || startedAtMs);
  if (idleShutdownSeconds > 0 && idleMs >= idleShutdownSeconds * 1000) {
    return { shouldStop: true, reason: "idle_timeout" };
  }
  return { shouldStop: false, reason: "active" };
}

export function createVoiceLifecycle({ now = () => Date.now() } = {}) {
  const state = { running: false, startedAtMs: 0, lastActivityMs: 0 };
  return {
    noteStarted() {
      state.running = true;
      state.startedAtMs = now();
      state.lastActivityMs = state.startedAtMs;
    },
    noteStopped() {
      state.running = false;
      state.startedAtMs = 0;
      state.lastActivityMs = 0;
    },
    touch() {
      if (state.running) state.lastActivityMs = now();
    },
    evaluate(config) {
      return evaluateVoiceLifecycle({
        nowMs: now(),
        running: state.running,
        startedAtMs: state.startedAtMs,
        lastActivityMs: state.lastActivityMs,
        idleShutdownSeconds: config.idleShutdownSeconds,
        maxRuntimeMinutes: config.maxRuntimeMinutes
      });
    },
    status() {
      return {
        running: state.running,
        startedAtMs: state.startedAtMs,
        lastActivityMs: state.lastActivityMs
      };
    }
  };
}

export function startVoiceSupervisor({
  config,
  lifecycle,
  stopAll,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
} = {}) {
  const intervalMs = Math.max(5_000, (config?.supervisorPollSeconds || 15) * 1000);
  let stopping = false;
  const timer = setIntervalImpl(async () => {
    const verdict = lifecycle.evaluate(config);
    if (verdict.shouldStop !== true || stopping) return;
    stopping = true;
    try {
      await stopAll(verdict.reason);
      lifecycle.noteStopped();
    } finally {
      stopping = false;
    }
  }, intervalMs);
  if (typeof timer?.unref === "function") timer.unref();
  return { stop: () => clearIntervalImpl(timer) };
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeName(value) {
  const name = String(value || "").trim();
  return /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(name) ? name : "";
}

function safeUrl(value) {
  const url = String(value || "").trim().replace(/\/$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(url) ? url : "";
}
