"""smejj.com voice worker — Pipecat pipeline wiring (low latency, barge-in).

Single responsibility: assemble one streaming voice pipeline per connected
client and run it to completion:

    transport.in -> STT(auto-detect) -> user ctx -> LLM(router) ->
    TTS(neural) -> transport.out -> assistant ctx

Low latency comes from full streaming (STT partials, LLM token stream, TTS
sentence streaming). Barge-in comes from the Silero VAD analyzer on the
transport plus allow_interruptions=True on the pipeline task. Automatic
any-language behaviour comes from Whisper language=None (STT) + the
language-agnostic system prompt (LLM) + optional detected-language follow for
XTTS (TTS).

All heavy imports are deferred inside functions so this module is importable
(and the package is compileall-clean) without Pipecat installed.
"""
from __future__ import annotations

from typing import Optional

from .config import SmejjVoiceConfig
from .router_client import build_context, build_llm_service
from .stt_whisper import build_stt_service
from .tts_piper import build_tts_service
from .vad import build_vad_analyzer


def build_transport(config: SmejjVoiceConfig, websocket):
    """Build the FastAPI WebSocket transport with VAD (barge-in) enabled."""
    from pipecat.serializers.protobuf import ProtobufFrameSerializer
    from pipecat.transports.network.fastapi_websocket import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )

    params = FastAPIWebsocketParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        add_wav_header=False,
        vad_analyzer=build_vad_analyzer(config),
        serializer=ProtobufFrameSerializer(),
    )
    return FastAPIWebsocketTransport(websocket=websocket, params=params)


def create_language_follow_processor(config: SmejjVoiceConfig, tts_service):
    """Optional processor that makes multilingual TTS speak the DETECTED
    language: it reads the language from Whisper transcription frames and,
    when the TTS engine supports per-utterance language (XTTS-v2), updates it.

    Piper voices are single-language, so this is a no-op for Piper. Defensively
    guarded: any version/API mismatch degrades to passthrough, never crashes.
    """
    from pipecat.frames.frames import TranscriptionFrame
    from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

    follow = bool(config.tts.follow_detected_language) and config.tts.engine == "xtts"

    class DetectedLanguageProcessor(FrameProcessor):
        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)
            if follow and isinstance(frame, TranscriptionFrame):
                language = getattr(frame, "language", None)
                setter = getattr(tts_service, "set_language", None)
                if language and callable(setter):
                    try:
                        setter(language)
                    except Exception:  # pragma: no cover - defensive passthrough
                        pass
            await self.push_frame(frame, direction)

    return DetectedLanguageProcessor()


async def run_voice_session(
    config: SmejjVoiceConfig,
    websocket,
    guard=None,
    aiohttp_session=None,
) -> None:
    """Run one full voice session for a single connected client.

    `guard` is an optional idle_shutdown.LifecycleGuard. The authoritative
    active-session COUNT is owned by the server's websocket endpoint (reliable
    try/finally boundary); here the guard is only used for keep-alive activity
    marking and to cancel the pipeline task when the client disconnects, so the
    idle auto-shutdown timer resets on real traffic and never double-counts.
    """
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineParams, PipelineTask

    transport = build_transport(config, websocket)
    stt = build_stt_service(config)
    llm = build_llm_service(config)
    tts = build_tts_service(config, aiohttp_session=aiohttp_session)
    context = build_context(config)
    context_aggregator = llm.create_context_aggregator(context)
    language_follow = create_language_follow_processor(config, tts)

    pipeline = Pipeline([
        transport.input(),
        stt,
        language_follow,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,   # barge-in: user speech cuts TTS
            enable_metrics=True,
            audio_in_sample_rate=config.audio_sample_rate,
            audio_out_sample_rate=config.tts.sample_rate,
        ),
    )

    _wire_session_lifecycle(transport, task, guard)

    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)


def _wire_session_lifecycle(transport, task, guard) -> None:
    """Wire transport events: mark keep-alive activity and cancel the task on
    disconnect. Session COUNTING is intentionally NOT done here (the server
    endpoint owns it) to avoid double-counting the same client.
    """
    if guard is None:
        return

    @transport.event_handler("on_client_connected")
    async def _on_connected(_transport, _client):  # pragma: no cover - runtime glue
        guard.mark_activity()

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_transport, _client):  # pragma: no cover - runtime glue
        guard.mark_activity()
        await task.cancel()
