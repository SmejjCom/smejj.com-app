"""smejj.com voice worker — ChatGPT-style voice mode, any language, low latency.

Package layout (Single Responsibility per module):
  config.py        — env config + fail-closed budget gate (budgetGate.js keys)
  idle_shutdown.py — idle auto-shutdown + hard runtime cap (the cost fuse)
  router_client.py — BYOK OpenAI-compatible LLM via the smejj.com router
  stt_whisper.py   — faster-whisper large-v3, language=None (auto-detect ALL)
  tts_piper.py     — neural TTS (Piper HTTP default, XTTS-v2 compatible)
  vad.py           — Silero VAD (barge-in)
  pipeline.py      — Pipecat streaming pipeline wiring
  server.py        — WebSocket server, /health, lifecycle supervisor

Only the standard library is imported at package import time; every heavy
dependency (Pipecat, faster-whisper, FastAPI, uvicorn) is imported lazily
inside the function that needs it, so config + cost-fuse logic stay testable in
isolation. The platform is always written smejj.com.
"""
from __future__ import annotations

from .config import (
    BudgetDecision,
    ConfigError,
    SmejjVoiceConfig,
    evaluate_budget_gate,
)
from .idle_shutdown import LifecycleGuard, ShutdownDecision

__all__ = [
    "BudgetDecision",
    "ConfigError",
    "SmejjVoiceConfig",
    "evaluate_budget_gate",
    "LifecycleGuard",
    "ShutdownDecision",
]

__version__ = "0.1.0"
