"""smejj.com voice worker — configuration and budget gate (fail-closed).

Single responsibility: read and validate every runtime setting for one
smejj.com voice worker from the environment, and refuse to start unless the
platform budget gate is fully configured and approved.

This module carries no heavy dependencies (only the standard library), so it is
fully unit-testable in isolation without Pipecat, faster-whisper or CUDA.

Cost-control contract (matches the user approval "only on use, auto-shutdown,
max 10 USD/month, fail-closed"):
  * The worker starts ONLY when the budget gate is configured and approved.
  * It reuses the EXACT ENV-key names of the control-server budget gate
    (control-server/src/budget/budgetGate.js) so a voice worker slots into the
    same accounting: SMEJJ_BUDGET_MAX_USD_PER_JOB,
    SMEJJ_BUDGET_MAX_RUNTIME_MINUTES, SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS,
    SMEJJ_WORKER_BUDGET_USD, SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES.
  * The runtime cap reuses SMEJJ_BUDGET_MAX_RUNTIME_MINUTES, the same key the
    watchdog lease store (watchdogLeaseStore.js) enforces on the control server.

Rules honoured: fail-closed, stateless (no local persistence), Single
Responsibility, no secrets in code (ENV only), platform always "smejj.com".
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping, Optional

PLATFORM_NAME = "smejj.com"

# Coding/assistant default model id — overridable per request via the router.
DEFAULT_MODEL = "glm-5.2"

# Hard upper bound for the runtime cap, mirrors watchdogLeaseStore.js
# (MAX_RUNTIME_MINUTES = 24 * 60). A single voice session must never be able to
# request an unbounded lease.
MAX_RUNTIME_MINUTES = 24 * 60

# Budget-gate ENV keys — kept identical to control-server budgetGate.js.
BUDGET_ENV_KEYS = (
    "SMEJJ_BUDGET_MAX_USD_PER_JOB",
    "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES",
    "SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS",
    "SMEJJ_WORKER_BUDGET_USD",
    "SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES",
)


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or invalid (fail-closed)."""


# --------------------------------------------------------------------------- #
# Environment helpers (pure, no side effects beyond reading the given mapping) #
# --------------------------------------------------------------------------- #

def _env(env: Optional[Mapping[str, str]]) -> Mapping[str, str]:
    return os.environ if env is None else env


def _get(env: Mapping[str, str], name: str) -> str:
    return str(env.get(name, "") or "").strip()


def _require(env: Mapping[str, str], name: str) -> str:
    value = _get(env, name)
    if not value:
        raise ConfigError(f"{name} is required but missing/blank (fail-closed)")
    return value


def _optional(env: Mapping[str, str], name: str, default: str) -> str:
    value = _get(env, name)
    return value or default


def _as_bool(env: Mapping[str, str], name: str, default: bool = False) -> bool:
    raw = _get(env, name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _as_int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = _get(env, name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc


def _as_float(env: Mapping[str, str], name: str, default: float) -> float:
    raw = _get(env, name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from exc


def positive_number(value: object) -> float:
    """Return a finite, strictly-positive float, else 0.0.

    Mirrors positiveNumber() in control-server budgetGate.js so the two gates
    agree on what counts as a usable limit.
    """
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if number != number or number in (float("inf"), float("-inf")):  # NaN/inf
        return 0.0
    return number if number > 0 else 0.0


# --------------------------------------------------------------------------- #
# Budget gate — Python mirror of control-server evaluateWorkerBudget()         #
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class BudgetDecision:
    """Result of the fail-closed budget evaluation."""

    approved: bool
    reasons: tuple
    max_usd_per_job: float
    max_runtime_minutes: float
    max_concurrent_workers: float
    worker_budget_usd: float
    estimated_runtime_minutes: float
    active_workers: int

    def as_public_dict(self) -> dict:
        """Secret-free view suitable for /health and structured logs."""
        return {
            "approved": self.approved,
            "failClosed": True,
            "reasons": list(self.reasons),
            "maxUsdPerJob": self.max_usd_per_job,
            "maxRuntimeMinutes": self.max_runtime_minutes,
            "maxConcurrentWorkers": self.max_concurrent_workers,
            "workerBudgetUsd": self.worker_budget_usd,
            "estimatedRuntimeMinutes": self.estimated_runtime_minutes,
            "activeWorkers": self.active_workers,
        }


def evaluate_budget_gate(
    env: Optional[Mapping[str, str]] = None,
    active_workers: int = 0,
) -> BudgetDecision:
    """Evaluate the platform budget gate exactly like budgetGate.js.

    fail-closed: without both SMEJJ_BUDGET_MAX_USD_PER_JOB and
    SMEJJ_BUDGET_MAX_RUNTIME_MINUTES, and a positive SMEJJ_WORKER_BUDGET_USD
    within the per-job cap plus an estimated runtime within the runtime cap,
    the decision is NOT approved and the worker must never start.
    """
    env = _env(env)
    max_usd_per_job = positive_number(env.get("SMEJJ_BUDGET_MAX_USD_PER_JOB"))
    max_runtime_minutes = positive_number(env.get("SMEJJ_BUDGET_MAX_RUNTIME_MINUTES"))
    max_concurrent_workers = positive_number(env.get("SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS")) or 1.0
    requested_usd = positive_number(env.get("SMEJJ_WORKER_BUDGET_USD"))
    estimated_runtime = positive_number(env.get("SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES"))

    reasons = []
    if not max_usd_per_job:
        reasons.append("budget_limit_missing:SMEJJ_BUDGET_MAX_USD_PER_JOB")
    if not max_runtime_minutes:
        reasons.append("budget_limit_missing:SMEJJ_BUDGET_MAX_RUNTIME_MINUTES")
    # Runtime cap must be within the hard watchdog bound (24h).
    if max_runtime_minutes and max_runtime_minutes > MAX_RUNTIME_MINUTES:
        reasons.append(
            f"runtime_cap_exceeds_hard_bound:{max_runtime_minutes}>{MAX_RUNTIME_MINUTES}"
        )
    if not requested_usd:
        reasons.append("positive_worker_budget_required:SMEJJ_WORKER_BUDGET_USD")
    if requested_usd and max_usd_per_job and requested_usd > max_usd_per_job:
        reasons.append(f"worker_budget_exceeds_job_cap:{requested_usd}>{max_usd_per_job}")
    if not estimated_runtime:
        reasons.append("estimated_runtime_required:SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES")
    if estimated_runtime and max_runtime_minutes and estimated_runtime > max_runtime_minutes:
        reasons.append(f"estimated_runtime_exceeds_cap:{estimated_runtime}>{max_runtime_minutes}")
    if int(active_workers) >= max_concurrent_workers:
        reasons.append(
            f"max_concurrent_workers_reached:{int(active_workers)}>={max_concurrent_workers}"
        )

    return BudgetDecision(
        approved=len(reasons) == 0,
        reasons=tuple(reasons),
        max_usd_per_job=max_usd_per_job,
        max_runtime_minutes=max_runtime_minutes,
        max_concurrent_workers=max_concurrent_workers,
        worker_budget_usd=requested_usd,
        estimated_runtime_minutes=estimated_runtime,
        active_workers=int(active_workers),
    )


# --------------------------------------------------------------------------- #
# Sub-configurations                                                          #
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class RouterConfig:
    """smejj.com model router wiring (OpenAI-compatible, BYOK)."""

    base_url: str
    api_key: str
    model: str
    system_prompt: str
    timeout_secs: float


@dataclass(frozen=True)
class WhisperConfig:
    """faster-whisper STT settings. language is None => auto-detect ALL languages."""

    model_size: str
    device: str
    compute_type: str
    language: Optional[str]  # None = auto-detect every spoken language


@dataclass(frozen=True)
class TtsConfig:
    """Neural TTS settings (Piper HTTP default, XTTS-v2 compatible upgrade)."""

    engine: str          # "piper" (default) | "xtts"
    base_url: str        # self-hosted HTTP endpoint
    voice: str           # Piper voice id / XTTS speaker
    default_language: str  # fallback language when detection is unavailable
    sample_rate: int
    follow_detected_language: bool  # XTTS: speak in the STT-detected language


@dataclass(frozen=True)
class VadConfig:
    """Silero VAD / barge-in thresholds."""

    confidence: float = 0.7  # speech probability threshold
    start_secs: float = 0.2  # speech length required to start a turn
    stop_secs: float = 0.8   # silence length required to end a turn
    min_volume: float = 0.6  # minimum volume gate


@dataclass(frozen=True)
class LifecycleConfig:
    """Idle auto-shutdown + hard runtime cap (the cost fuse)."""

    idle_shutdown_secs: float   # SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS
    max_runtime_minutes: float  # SMEJJ_BUDGET_MAX_RUNTIME_MINUTES (hard cap)
    poll_secs: float            # supervisor poll interval


@dataclass(frozen=True)
class SmejjVoiceConfig:
    """Validated configuration for one smejj.com voice worker."""

    budget: BudgetDecision
    router: RouterConfig
    whisper: WhisperConfig
    tts: TtsConfig
    vad: VadConfig
    lifecycle: LifecycleConfig
    host: str
    port: int
    audio_sample_rate: int

    @classmethod
    def load(cls, env: Optional[Mapping[str, str]] = None) -> "SmejjVoiceConfig":
        """Load + validate from the environment. Fail-closed on any problem."""
        env = _env(env)

        # 1) Budget gate FIRST — never spend before the gate approves.
        budget = evaluate_budget_gate(env)
        if not budget.approved:
            raise ConfigError(
                "budget gate not approved (fail-closed) — refusing to start: "
                + ", ".join(budget.reasons)
            )

        # 2) Model router (OpenAI-compatible, BYOK). Canonical keys match
        #    modelRouter.js custom backend; SMEJJ_ROUTER_* accepted as aliases.
        base_url = _get(env, "SMEJJ_LLM_BASE_URL") or _get(env, "SMEJJ_ROUTER_BASE_URL")
        api_key = _get(env, "SMEJJ_LLM_API_KEY") or _get(env, "SMEJJ_ROUTER_API_KEY")
        model = (
            _get(env, "SMEJJ_LLM_MODEL")
            or _get(env, "SMEJJ_REQUESTED_MODEL")
            or DEFAULT_MODEL
        )
        if not base_url:
            raise ConfigError("SMEJJ_LLM_BASE_URL (router base URL) required (fail-closed)")
        if not api_key:
            raise ConfigError("SMEJJ_LLM_API_KEY (BYOK) required (fail-closed)")
        router = RouterConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,  # BYOK — never persisted, only forwarded to the router
            model=model,
            system_prompt=_optional(env, "SMEJJ_VOICE_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
            timeout_secs=_as_float(env, "SMEJJ_LLM_TIMEOUT_SECS", 45.0),
        )

        # 3) STT — faster-whisper large-v3, auto-detect EVERY language.
        lang_raw = _get(env, "SMEJJ_WHISPER_LANGUAGE").lower()
        whisper = WhisperConfig(
            model_size=_optional(env, "SMEJJ_WHISPER_MODEL", "large-v3"),
            device=_optional(env, "SMEJJ_WHISPER_DEVICE", "cuda"),
            compute_type=_optional(env, "SMEJJ_WHISPER_COMPUTE", "float16"),
            # Empty / "auto" / "none" => None => Whisper auto-detects the language.
            language=None if lang_raw in {"", "auto", "none", "detect"} else lang_raw,
        )

        # 4) TTS — Piper HTTP self-hosted default; XTTS-v2 compatible.
        tts = TtsConfig(
            engine=_optional(env, "SMEJJ_TTS_ENGINE", "piper").lower(),
            base_url=_require(env, "SMEJJ_TTS_BASE_URL").rstrip("/"),
            voice=_optional(env, "SMEJJ_TTS_VOICE", "en_US-amy-medium"),
            default_language=_optional(env, "SMEJJ_TTS_DEFAULT_LANGUAGE", "en"),
            sample_rate=_as_int(env, "SMEJJ_TTS_SAMPLE_RATE", 22050),
            follow_detected_language=_as_bool(env, "SMEJJ_TTS_FOLLOW_LANGUAGE", True),
        )

        # 5) VAD / barge-in.
        vad = VadConfig(
            confidence=_as_float(env, "SMEJJ_VAD_CONFIDENCE", 0.7),
            start_secs=_as_float(env, "SMEJJ_VAD_START_SECS", 0.2),
            stop_secs=_as_float(env, "SMEJJ_VAD_STOP_SECS", 0.8),
            min_volume=_as_float(env, "SMEJJ_VAD_MIN_VOLUME", 0.6),
        )

        # 6) Lifecycle — idle auto-shutdown + hard runtime cap (cost fuse).
        idle_secs = _as_float(env, "SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS", 120.0)
        if idle_secs <= 0:
            raise ConfigError("SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS must be > 0 (fail-closed)")
        lifecycle = LifecycleConfig(
            idle_shutdown_secs=idle_secs,
            max_runtime_minutes=budget.max_runtime_minutes,  # same hard cap as watchdog
            poll_secs=max(1.0, _as_float(env, "SMEJJ_VOICE_LIFECYCLE_POLL_SECONDS", 5.0)),
        )

        return cls(
            budget=budget,
            router=router,
            whisper=whisper,
            tts=tts,
            vad=vad,
            lifecycle=lifecycle,
            host=_optional(env, "SMEJJ_HOST", "0.0.0.0"),
            port=_as_int(env, "SMEJJ_WORKER_PORT", 8080),
            audio_sample_rate=_as_int(env, "SMEJJ_SAMPLE_RATE", 16000),
        )

    def health_snapshot(self) -> dict:
        """Secret-free health/status document for the /health endpoint."""
        return {
            "ok": True,
            "platform": PLATFORM_NAME,
            "role": "voice-worker",
            "stateless": True,
            "failClosed": True,
            "secretsExposed": False,
            "budget": self.budget.as_public_dict(),
            "sttAutoDetect": self.whisper.language is None,
            "ttsEngine": self.tts.engine,
            "idleShutdownSecs": self.lifecycle.idle_shutdown_secs,
            "maxRuntimeMinutes": self.lifecycle.max_runtime_minutes,
        }


# A language-agnostic system prompt: the model must answer in the user's
# detected language automatically, like a natural ChatGPT-style voice mode.
DEFAULT_SYSTEM_PROMPT = (
    "You are the smejj.com voice assistant. Detect the language the user is "
    "speaking automatically and always reply in that exact same language. "
    "Never switch languages unless the user does. Speak naturally and "
    "conversationally, in short spoken-style sentences suitable for "
    "text-to-speech. Keep answers concise unless asked for detail."
)
