"""smejj.com voice worker — neural text-to-speech (Piper HTTP default, XTTS-v2).

Single responsibility: build the Pipecat TTS service from validated config.
Default engine is a self-hosted Piper HTTP server (free, natural neural voices,
low latency, streams audio). For true "answer in ANY detected language" output
the XTTS-v2-compatible engine can be selected (SMEJJ_TTS_ENGINE=xtts); XTTS-v2
is natively multilingual and takes a language parameter that we drive from the
Whisper-detected language.

Heavy imports are deferred into the builders so config/validation stay
dependency-light and unit-testable without Pipecat or an aiohttp session.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import ConfigError, SmejjVoiceConfig


@dataclass(frozen=True)
class TtsResolution:
    """Resolved TTS settings (pure, testable)."""

    engine: str
    base_url: str
    voice: str
    default_language: str
    sample_rate: int
    follow_detected_language: bool


def resolve_tts_settings(config: SmejjVoiceConfig) -> TtsResolution:
    """Pure resolution of TTS settings — no network, unit-testable."""
    tts = config.tts
    engine = (tts.engine or "piper").lower()
    if engine not in {"piper", "xtts"}:
        raise ConfigError(f"unsupported SMEJJ_TTS_ENGINE {engine!r} (piper|xtts)")
    if not tts.base_url:
        raise ConfigError("SMEJJ_TTS_BASE_URL required (fail-closed)")
    return TtsResolution(
        engine=engine,
        base_url=tts.base_url.rstrip("/"),
        voice=tts.voice,
        default_language=tts.default_language or "en",
        sample_rate=int(tts.sample_rate or 22050),
        follow_detected_language=bool(tts.follow_detected_language),
    )


def build_tts_service(config: SmejjVoiceConfig, aiohttp_session=None):
    """Build the configured Pipecat TTS service (Piper default, XTTS optional).

    Both services are HTTP clients to a self-hosted server (no third-party
    dependency), so they honour the smejj.com free-only policy. VERIFY the
    import paths/params against the pinned pipecat-ai version.
    """
    resolution = resolve_tts_settings(config)
    if resolution.engine == "xtts":
        return _build_xtts(resolution, aiohttp_session)
    return _build_piper(resolution, aiohttp_session)


def _build_piper(resolution: TtsResolution, aiohttp_session):
    """Piper HTTP TTS. One Piper voice = one language; for multilingual output
    prefer XTTS-v2 (SMEJJ_TTS_ENGINE=xtts) or run one Piper voice per language.
    """
    from pipecat.services.piper.tts import PiperTTSService

    session = aiohttp_session or _new_aiohttp_session()
    return PiperTTSService(
        base_url=resolution.base_url,
        aiohttp_session=session,
        sample_rate=resolution.sample_rate,
    )


def _build_xtts(resolution: TtsResolution, aiohttp_session):
    """XTTS-v2 HTTP TTS — natively multilingual; the language argument is set
    from the Whisper-detected language at runtime by the pipeline when
    follow_detected_language is on.
    """
    from pipecat.services.xtts.tts import XTTSService

    session = aiohttp_session or _new_aiohttp_session()
    return XTTSService(
        base_url=resolution.base_url,
        voice_id=resolution.voice,
        language=resolution.default_language,
        aiohttp_session=session,
        sample_rate=resolution.sample_rate,
    )


def _new_aiohttp_session():
    """Create an aiohttp session (deferred import); caller owns its lifetime."""
    import aiohttp

    return aiohttp.ClientSession()
