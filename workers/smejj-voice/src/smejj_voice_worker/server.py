"""smejj.com voice worker — HTTP/WebSocket server and lifecycle supervisor.

Single responsibility: expose the worker over the network and enforce the
process-level cost fuse. It:
  * loads config at startup (fail-closed budget gate — see config.py); a closed
    gate raises before any port is opened, so no paid GPU can ever serve;
  * serves GET /health (secret-free) for Salad probes and the control server;
  * serves the /ws WebSocket, running one Pipecat voice session per client and
    owning the authoritative active-session count on the LifecycleGuard;
  * runs a supervisor that evaluates the LifecycleGuard and, on idle timeout or
    the hard runtime cap, triggers graceful shutdown so the process exits, the
    Salad replica stops and GPU billing ends.

Heavy imports (FastAPI, uvicorn, aiohttp, Pipecat) are deferred so config and
the cost-fuse logic stay unit-testable without them installed.
"""
from __future__ import annotations

import asyncio
import logging
import os

from .config import ConfigError, SmejjVoiceConfig
from .idle_shutdown import LifecycleGuard

LOG = logging.getLogger("smejj.com.voice-worker")


def create_app(config: SmejjVoiceConfig, guard: LifecycleGuard):
    """Build the FastAPI app: /health probe + /ws voice endpoint."""
    from fastapi import FastAPI, WebSocket
    from fastapi.responses import JSONResponse

    app = FastAPI(title="smejj.com voice worker", docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health():
        snapshot = config.health_snapshot()
        snapshot["lifecycle"] = guard.evaluate().as_public_dict()
        return JSONResponse(snapshot)

    @app.websocket("/ws")
    async def voice_ws(websocket: WebSocket):
        # Deferred imports keep the module importable without Pipecat/aiohttp.
        import aiohttp

        from .pipeline import run_voice_session

        await websocket.accept()
        guard.session_started()  # authoritative: a connected client = a session
        session = aiohttp.ClientSession()
        try:
            await run_voice_session(
                config, websocket, guard=guard, aiohttp_session=session
            )
        except Exception as exc:  # pragma: no cover - runtime glue
            LOG.warning("voice session ended with error: %s", exc)
        finally:
            await session.close()
            guard.session_ended()  # guaranteed decrement, even on error

    return app


async def _supervisor(config: SmejjVoiceConfig, guard: LifecycleGuard, server) -> None:
    """Poll the LifecycleGuard; on a shutdown decision, stop the server.

    Setting uvicorn's should_exit flag lets in-flight sessions drain and then
    the process exits — which stops the Salad replica and ends GPU cost.
    """
    poll = max(1.0, float(config.lifecycle.poll_secs))
    while not getattr(server, "should_exit", False):
        await asyncio.sleep(poll)
        decision = guard.evaluate()
        if decision.should_shutdown:
            LOG.warning(
                "smejj.com voice worker self-shutdown: reason=%s runtime=%.0fs idle=%.0fs",
                decision.reason, decision.runtime_secs, decision.idle_secs,
            )
            server.should_exit = True
            return


async def _serve(config: SmejjVoiceConfig) -> None:
    import uvicorn

    guard = LifecycleGuard(
        idle_shutdown_secs=config.lifecycle.idle_shutdown_secs,
        max_runtime_minutes=config.lifecycle.max_runtime_minutes,
    )
    app = create_app(config, guard)
    uv_config = uvicorn.Config(
        app,
        host=config.host,
        port=config.port,
        log_level=os.environ.get("SMEJJ_LOG_LEVEL", "info").lower(),
        access_log=False,
    )
    server = uvicorn.Server(uv_config)
    supervisor = asyncio.create_task(_supervisor(config, guard, server))
    LOG.info(
        "smejj.com voice worker listening on %s:%s (idle=%.0fs, runtime_cap=%.0fmin)",
        config.host, config.port,
        config.lifecycle.idle_shutdown_secs, config.lifecycle.max_runtime_minutes,
    )
    try:
        await server.serve()
    finally:
        supervisor.cancel()


def main() -> int:
    """Entrypoint: fail-closed config load, then serve. Returns a process code."""
    logging.basicConfig(
        level=os.environ.get("SMEJJ_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        config = SmejjVoiceConfig.load()  # fail-closed budget gate
    except ConfigError as exc:
        LOG.error("smejj.com voice worker refused to start (fail-closed): %s", exc)
        return 2
    asyncio.run(_serve(config))
    return 0


if __name__ == "__main__":  # pragma: no cover - process entrypoint
    raise SystemExit(main())
