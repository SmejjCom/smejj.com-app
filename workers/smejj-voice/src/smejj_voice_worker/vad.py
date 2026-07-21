"""smejj.com voice worker — voice activity detection (Silero VAD, barge-in).

Single responsibility: build the Silero VAD analyzer from validated config.
The VAD powers two things: end-of-turn detection (low latency) and barge-in —
when the user starts speaking while the assistant is talking, Pipecat's
interruption handling uses VAD speech-start to cut the current TTS output.

Heavy imports are deferred into the builder so config/validation stay
dependency-light and unit-testable without Pipecat/onnxruntime installed.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import SmejjVoiceConfig


@dataclass(frozen=True)
class VadResolution:
    """Resolved VAD/barge-in thresholds (pure, testable)."""

    confidence: float
    start_secs: float
    stop_secs: float
    min_volume: float


def resolve_vad_params(config: SmejjVoiceConfig) -> VadResolution:
    """Pure resolution of VAD params — no model load, unit-testable."""
    vad = config.vad
    return VadResolution(
        confidence=float(vad.confidence),
        start_secs=float(vad.start_secs),
        stop_secs=float(vad.stop_secs),
        min_volume=float(vad.min_volume),
    )


def build_vad_analyzer(config: SmejjVoiceConfig):
    """Build a Pipecat SileroVADAnalyzer with the resolved thresholds.

    VERIFY the VADParams field names against the pinned pipecat-ai version.
    """
    resolution = resolve_vad_params(config)
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams

    params = VADParams(
        confidence=resolution.confidence,
        start_secs=resolution.start_secs,
        stop_secs=resolution.stop_secs,
        min_volume=resolution.min_volume,
    )
    return SileroVADAnalyzer(
        sample_rate=config.audio_sample_rate,
        params=params,
    )
