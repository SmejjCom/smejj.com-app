"""smejj.com voice worker — speech-to-text (faster-whisper, auto-detect ALL).

Single responsibility: build the Pipecat STT service from validated config.
The core requirement is automatic detection of EVERY spoken language: we run
faster-whisper large-v3 with language=None, so Whisper detects the language of
each utterance itself and transcribes it — nothing is pinned to one language.

The detected language is emitted on the transcription frames so downstream TTS
can answer in the same language. Heavy imports are deferred into the builder to
keep config/validation testable without faster-whisper or CUDA installed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import SmejjVoiceConfig


@dataclass(frozen=True)
class WhisperResolution:
    """Resolved faster-whisper settings (pure, testable)."""

    model_size: str
    device: str
    compute_type: str
    language: Optional[str]  # None => detect every language
    auto_detect: bool


def resolve_whisper_settings(config: SmejjVoiceConfig) -> WhisperResolution:
    """Pure resolution of STT settings — no model load, unit-testable."""
    whisper = config.whisper
    return WhisperResolution(
        model_size=whisper.model_size or "large-v3",
        device=whisper.device or "cuda",
        compute_type=whisper.compute_type or "float16",
        language=whisper.language,          # None = auto-detect ALL languages
        auto_detect=whisper.language is None,
    )


def build_stt_service(config: SmejjVoiceConfig):
    """Build a Pipecat WhisperSTTService using faster-whisper large-v3.

    language=None asks Whisper to auto-detect the spoken language per utterance
    (all languages Whisper supports). VERIFY the exact constructor/model enum
    against the pinned pipecat-ai + faster-whisper versions in requirements.txt;
    the mapping below targets the documented WhisperSTTService API.
    """
    resolution = resolve_whisper_settings(config)
    # Deferred heavy imports — module stays importable without faster-whisper.
    from pipecat.services.whisper.stt import WhisperSTTService

    try:
        # Newer pipecat exposes a Model enum; large-v3 maps to LARGE.
        from pipecat.services.whisper.stt import Model

        model_arg = _map_model_enum(Model, resolution.model_size)
    except Exception:  # pragma: no cover - version-dependent import
        model_arg = resolution.model_size

    return WhisperSTTService(
        model=model_arg,
        device=resolution.device,
        compute_type=resolution.compute_type,
        # None => faster-whisper detects the language of each utterance itself.
        language=resolution.language,
    )


def _map_model_enum(model_enum, model_size: str):
    """Best-effort map of a model-size string to a Whisper Model enum member."""
    name = str(model_size or "").strip().lower()
    mapping = {
        "large-v3": "LARGE",
        "large-v2": "LARGE",
        "large": "LARGE",
        "medium": "MEDIUM",
        "small": "SMALL",
        "base": "BASE",
        "tiny": "TINY",
    }
    member = mapping.get(name)
    if member and hasattr(model_enum, member):
        return getattr(model_enum, member)
    # Fall back to the raw string; faster-whisper accepts size strings directly.
    return model_size
