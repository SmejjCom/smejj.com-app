"""smejj.com voice worker — idle auto-shutdown and hard runtime cap.

Single responsibility: decide, from monotonic time and the number of active
voice sessions, WHEN the worker must terminate itself so that GPU cost stops.
This is the local cost fuse that backs the user approval "only on use,
auto-shutdown, max 10 USD/month, fail-closed".

Two independent guards, both fail toward shutdown:
  1. Idle auto-shutdown — no active session for `idle_shutdown_secs`
     (SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS, default 120s) => shut down.
  2. Runtime cap — total wall-clock runtime reaches `max_runtime_minutes`
     (SMEJJ_BUDGET_MAX_RUNTIME_MINUTES, the SAME hard cap the control-server
     watchdog lease enforces) => shut down even if a session is active.

Pure logic, standard library only, deterministic with an injectable clock, so
it is fully unit-testable without Pipecat, a network or a GPU. The module never
persists state (stateless worker) and never calls os.exit itself — server.py
owns the actual process teardown.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass


# Reason codes are lowercase snake tokens so they line up with the control
# server's watchdog completion reasons (watchdogLeaseStore.js).
REASON_IDLE = "idle_timeout"
REASON_RUNTIME_CAP = "runtime_cap_reached"
REASON_RUNNING = "running"


@dataclass(frozen=True)
class ShutdownDecision:
    """Outcome of one lifecycle evaluation."""

    should_shutdown: bool
    reason: str
    active_sessions: int
    runtime_secs: float
    idle_secs: float
    runtime_remaining_secs: float
    idle_remaining_secs: float

    def as_public_dict(self) -> dict:
        return {
            "shouldShutdown": self.should_shutdown,
            "reason": self.reason,
            "activeSessions": self.active_sessions,
            "runtimeSecs": round(self.runtime_secs, 3),
            "idleSecs": round(self.idle_secs, 3),
            "runtimeRemainingSecs": round(self.runtime_remaining_secs, 3),
            "idleRemainingSecs": round(self.idle_remaining_secs, 3),
        }


class LifecycleGuard:
    """Tracks active voice sessions and answers "should I shut down now?".

    Thread-safe: session accounting and evaluation are guarded by a lock so the
    async transport callbacks and the supervisor loop can share one instance.
    """

    def __init__(
        self,
        idle_shutdown_secs: float,
        max_runtime_minutes: float,
        now_fn=time.monotonic,
    ) -> None:
        if idle_shutdown_secs <= 0:
            raise ValueError("idle_shutdown_secs must be > 0 (fail-closed)")
        if max_runtime_minutes <= 0:
            raise ValueError("max_runtime_minutes must be > 0 (fail-closed)")
        self._idle_shutdown_secs = float(idle_shutdown_secs)
        self._max_runtime_secs = float(max_runtime_minutes) * 60.0
        self._now = now_fn
        self._lock = threading.Lock()
        start = self._now()
        self._started_at = start
        self._last_activity_at = start
        self._active_sessions = 0

    # -- session accounting ------------------------------------------------- #

    def session_started(self) -> int:
        """Register a new active voice session (a connected client)."""
        with self._lock:
            self._active_sessions += 1
            self._last_activity_at = self._now()
            return self._active_sessions

    def session_ended(self) -> int:
        """Register a finished session; clamps at zero (never negative)."""
        with self._lock:
            self._active_sessions = max(0, self._active_sessions - 1)
            self._last_activity_at = self._now()
            return self._active_sessions

    def mark_activity(self) -> None:
        """Record any traffic (speech, tokens, audio) as keep-alive."""
        with self._lock:
            self._last_activity_at = self._now()

    @property
    def active_sessions(self) -> int:
        with self._lock:
            return self._active_sessions

    # -- decision ----------------------------------------------------------- #

    def evaluate(self) -> ShutdownDecision:
        """Decide whether the worker must terminate now.

        Runtime cap wins over idle so a stuck-open session can never outrun the
        hard budget limit. Both timers use the same monotonic clock.
        """
        with self._lock:
            now = self._now()
            active = self._active_sessions
            runtime = now - self._started_at
            idle = now - self._last_activity_at

        runtime_remaining = self._max_runtime_secs - runtime
        idle_remaining = self._idle_shutdown_secs - idle

        if runtime >= self._max_runtime_secs:
            return self._decision(REASON_RUNTIME_CAP, True, active, runtime, idle,
                                  runtime_remaining, idle_remaining)
        if active <= 0 and idle >= self._idle_shutdown_secs:
            return self._decision(REASON_IDLE, True, active, runtime, idle,
                                  runtime_remaining, idle_remaining)
        return self._decision(REASON_RUNNING, False, active, runtime, idle,
                              runtime_remaining, idle_remaining)

    @staticmethod
    def _decision(reason, should, active, runtime, idle, runtime_remaining, idle_remaining):
        return ShutdownDecision(
            should_shutdown=should,
            reason=reason,
            active_sessions=active,
            runtime_secs=runtime,
            idle_secs=idle,
            runtime_remaining_secs=max(0.0, runtime_remaining),
            idle_remaining_secs=max(0.0, idle_remaining) if active <= 0 else idle_remaining,
        )
