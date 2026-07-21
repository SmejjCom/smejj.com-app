# smejj.com Voice Worker

A production-ready but **NOT deployed** realtime voice worker for smejj.com — a
ChatGPT-style voice mode: it **automatically detects any spoken language** and
replies **in that same language**, with a **natural (non-robotic) neural
voice**, **low latency** through streaming, and **barge-in** (you can interrupt
it). It is self-hosted, stateless, fail-closed, and runs pay-per-use behind the
existing smejj.com budget gate.

> Status: `proposed-pending-deploy`. Nothing here starts paid compute. No git,
> no deploy, no live services. See `docs/task-capsule.smejj-voice-worker-0001.json`.

## Architecture

One streaming Pipecat pipeline per connected client:

```
browser mic --wss--> [transport.in] -> STT (faster-whisper large-v3, auto-detect)
                                     -> user context
                                     -> LLM (smejj.com router, OpenAI-compatible, BYOK)
                                     -> TTS (Piper HTTP / XTTS-v2, neural)
                     [transport.out] <- audio ---wss--> browser speaker
        Silero VAD on the transport + allow_interruptions = barge-in
```

- **Orchestration / transport:** Pipecat over a FastAPI WebSocket (`/ws`).
- **STT:** faster-whisper `large-v3` with `language=None` — Whisper detects the
  language of every utterance itself (all languages it supports). Nothing is
  pinned to one language.
- **LLM:** the existing smejj.com model router (OpenAI-compatible, BYOK) via
  Pipecat `OpenAILLMService(base_url=..., api_key=...)`. A language-agnostic
  system prompt makes the model always reply in the user's detected language.
- **TTS:** self-hosted **Piper** HTTP by default (free, natural, low latency).
  For true any-language speech, set `SMEJJ_TTS_ENGINE=xtts` — XTTS-v2 is
  natively multilingual and follows the Whisper-detected language.
- **VAD / barge-in:** Silero VAD + `allow_interruptions=True` cut the assistant
  the instant the user starts speaking.
- **Low latency:** full streaming end-to-end (STT partials, LLM token stream,
  sentence-wise TTS).

### Module layout (Single Responsibility, each file < 800 lines)

| File | Responsibility |
| --- | --- |
| `src/smejj_voice_worker/config.py` | Env config + **fail-closed budget gate** (mirrors control-server `budgetGate.js` keys) |
| `src/smejj_voice_worker/idle_shutdown.py` | **Idle auto-shutdown + hard runtime cap** (the cost fuse) |
| `src/smejj_voice_worker/router_client.py` | BYOK OpenAI-compatible LLM service (Pipecat) |
| `src/smejj_voice_worker/stt_whisper.py` | faster-whisper large-v3, `language=None` auto-detect |
| `src/smejj_voice_worker/tts_piper.py` | Neural TTS (Piper HTTP default, XTTS-v2 compatible) |
| `src/smejj_voice_worker/vad.py` | Silero VAD (barge-in) |
| `src/smejj_voice_worker/pipeline.py` | Pipecat pipeline wiring |
| `src/smejj_voice_worker/server.py` | WebSocket server, `/health`, lifecycle supervisor |

Heavy dependencies (Pipecat, faster-whisper, FastAPI, uvicorn) are imported
lazily inside functions, so `config.py` and `idle_shutdown.py` (the cost-control
logic) are unit-testable with **no** heavy deps installed.

## Cost control — how the ≤ 10 USD/month limit is protected

This worker matches the user approval "only on use, auto-shutdown, max 10
USD/month, fail-closed" with **three independent layers**, all fail-closed:

### 1) Fail-closed start (budget gate)

`config.evaluate_budget_gate()` is a Python mirror of the control-server
`budgetGate.js` and reuses the **exact same ENV keys**:

| ENV key | Meaning |
| --- | --- |
| `SMEJJ_BUDGET_MAX_USD_PER_JOB` | hard per-run USD cap |
| `SMEJJ_BUDGET_MAX_RUNTIME_MINUTES` | hard runtime cap (also the watchdog lease limit) |
| `SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS` | max parallel voice workers |
| `SMEJJ_WORKER_BUDGET_USD` | this worker's budget (must be > 0 and ≤ per-job cap) |
| `SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES` | estimate (must be > 0 and ≤ runtime cap) |

If the gate is not fully configured and approved, `SmejjVoiceConfig.load()`
raises `ConfigError` and `server.main()` exits **before any port is opened** —
so a misconfigured worker can never serve paid GPU traffic.

### 2) Idle auto-shutdown (self-terminate when unused)

`idle_shutdown.LifecycleGuard` + the supervisor loop in `server.py`: when there
is **no active voice session** for `SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS` (default
**120s**), the worker sets uvicorn `should_exit`, the process exits, the Salad
replica stops, and **GPU billing ends**. The websocket endpoint owns the
authoritative session count (increment on connect, guaranteed decrement in a
`finally`), so the idle timer only runs when nobody is talking.

### 3) Hard runtime cap (backstop)

The same `LifecycleGuard` also enforces a wall-clock ceiling from
`SMEJJ_BUDGET_MAX_RUNTIME_MINUTES` — the **same key and limit** the
control-server watchdog lease (`watchdogLeaseStore.js`) enforces. The runtime
cap takes precedence over idle, so a stuck-open session can never outrun the
budget. Bounded hard at 24h, matching the watchdog.

Net effect: cost accrues only while someone is actually talking; a hang-up stops
billing within ~2 minutes; nothing ever runs longer than the runtime cap; and a
closed gate means the worker never starts. Model tokens are billed to the user's
**BYOK** key only — no auto-recharge, no paid fallback (free-only policy).

## Fail-closed + stateless guarantees

- **Stateless:** no local persistence; the model cache is ephemeral (`HF_HOME`
  under `/tmp`, wiped when the container stops).
- **No secrets in code or image:** every secret (BYOK key, endpoints) comes from
  ENV / Salad secrets at runtime. `.env.example` contains placeholders only.
- **Fail-closed everywhere:** budget gate, missing router/TTS config, and idle
  all resolve toward "do not run / shut down".

## Local verification (no network needed)

```sh
cd smejj-voice-worker
python3 -m compileall -q src tests            # syntax check — must be clean
python3 tests/test_config.py                  # budget gate + fail-closed config
python3 tests/test_idle_shutdown.py           # idle auto-shutdown + runtime cap
# (or, if pytest is available: python3 -m pytest -q)
```

The tests run standalone because pip has no network in the build sandbox and
Pipecat/CUDA are not importable there; the cost-control logic is pure and needs
neither.

## Build + deploy runbook (do NOT run without written approval)

This package is deliberately not deployed. When approval exists, the sequence is:

1. **Verify deps:** pin/resolve `requirements.txt` on a networked machine, run
   the import smoke on a GPU node, and freeze exact versions (the file has
   `VERIFY` notes because this sandbox has no network).
2. **Build image (GPU, stateless):**
   ```sh
   docker build -t smejj-voice-worker:<sha> .
   ```
3. **Push** to the smejj.com registry used for Salad (per free-only policy;
   no paid add-ons).
4. **Self-host TTS:** run a Piper HTTP server (or XTTS-v2 server) reachable at
   `SMEJJ_TTS_BASE_URL` — same Salad group sidecar or a separate service.
5. **Salad portal:** create a GPU container group (autostart off,
   `restart_policy=never`), `/health` probes, authenticated ingress, port 8080.
   Set the budget/idle/router/STT/TTS/VAD ENV from `.env.example` as Salad
   secrets/protected env. Provide `SMEJJ_LLM_API_KEY` (BYOK) as a secret.
6. **Control-server:** add the additive on-demand start/stop route behind the
   budget gate + watchdog — see `docs/CONTROL_SERVER_INTEGRATION.md`.
7. **Frontend:** wire the capability-gated client and the one-line hand-over
   guard, preserving the browser fallback — see `docs/FRONTEND_INTEGRATION.md`.
8. **Staging only**, measure latency + barge-in, then get written approval
   (per `docs/deployment/DEPLOYMENT_PLAN.md`) before any production release.

## Environment

See `.env.example` for the full, grouped list (budget, idle, router/BYOK, STT,
TTS, VAD, transport). Every value is a placeholder — no secrets.

## Open items / VERIFY

- Confirm pipecat-ai / faster-whisper / fastapi import paths + versions against
  a real build (see `requirements.txt`).
- Select Piper voices per target language, or enable XTTS-v2 for full
  any-language TTS.
- Integration + latency + barge-in measurement needs a Salad GPU node and a live
  microphone (not possible in this sandbox).
- The platform name is always written `smejj.com`.
