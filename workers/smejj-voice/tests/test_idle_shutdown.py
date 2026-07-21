"""Unit tests for the smejj.com voice worker cost fuse (idle + runtime cap).

Deterministic: a fake monotonic clock drives every timing decision, so the
idle auto-shutdown and the hard runtime cap are tested exactly, with no sleeps
and no dependencies. Runs under pytest OR standalone:
`python3 tests/test_idle_shutdown.py`.
"""
import os
import sys

_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from smejj_voice_worker.idle_shutdown import (  # noqa: E402
    REASON_IDLE,
    REASON_RUNNING,
    REASON_RUNTIME_CAP,
    LifecycleGuard,
)


class FakeClock:
    """A controllable monotonic clock (seconds)."""

    def __init__(self, start=1000.0):
        self.t = float(start)

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += float(seconds)


def _guard(clock, idle_secs=120.0, runtime_minutes=20.0):
    return LifecycleGuard(
        idle_shutdown_secs=idle_secs,
        max_runtime_minutes=runtime_minutes,
        now_fn=clock,
    )


# --- construction validation ---------------------------------------------- #

def test_invalid_idle_raises():
    try:
        LifecycleGuard(idle_shutdown_secs=0, max_runtime_minutes=10)
    except ValueError:
        return
    raise AssertionError("expected ValueError for non-positive idle")


def test_invalid_runtime_raises():
    try:
        LifecycleGuard(idle_shutdown_secs=10, max_runtime_minutes=0)
    except ValueError:
        return
    raise AssertionError("expected ValueError for non-positive runtime")


# --- idle auto-shutdown ---------------------------------------------------- #

def test_fresh_guard_is_running():
    clock = FakeClock()
    decision = _guard(clock).evaluate()
    assert decision.should_shutdown is False
    assert decision.reason == REASON_RUNNING


def test_not_idle_before_threshold():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=120.0)
    clock.advance(119)  # just under idle threshold, no active session
    decision = guard.evaluate()
    assert decision.should_shutdown is False
    assert decision.reason == REASON_RUNNING


def test_idle_shutdown_after_threshold_with_no_session():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=120.0)
    clock.advance(120)  # reaches idle threshold, no active session
    decision = guard.evaluate()
    assert decision.should_shutdown is True
    assert decision.reason == REASON_IDLE


def test_active_session_blocks_idle_shutdown():
    clock = FakeClock()
    # Large runtime cap so this test isolates idle behaviour (runtime cap is
    # covered separately). A connected client must never trigger idle-shutdown.
    guard = _guard(clock, idle_secs=120.0, runtime_minutes=1000.0)
    guard.session_started()
    clock.advance(10_000)  # far past idle threshold, but a client is connected
    decision = guard.evaluate()
    assert decision.should_shutdown is False
    assert decision.reason == REASON_RUNNING


def test_idle_starts_after_last_session_ends():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=120.0)
    guard.session_started()
    clock.advance(300)
    guard.session_ended()          # idle timer resets here
    clock.advance(119)
    assert guard.evaluate().should_shutdown is False
    clock.advance(1)               # now 120s idle since the session ended
    decision = guard.evaluate()
    assert decision.should_shutdown is True
    assert decision.reason == REASON_IDLE


def test_mark_activity_resets_idle_timer():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=120.0)
    clock.advance(119)
    guard.mark_activity()          # keep-alive
    clock.advance(119)
    assert guard.evaluate().should_shutdown is False


# --- hard runtime cap ------------------------------------------------------ #

def test_runtime_cap_triggers_even_with_active_session():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=120.0, runtime_minutes=20.0)
    guard.session_started()        # active, so idle never fires
    clock.advance(20 * 60)         # reach the hard runtime cap
    decision = guard.evaluate()
    assert decision.should_shutdown is True
    assert decision.reason == REASON_RUNTIME_CAP


def test_runtime_cap_precedes_idle():
    clock = FakeClock()
    guard = _guard(clock, idle_secs=60.0, runtime_minutes=10.0)
    clock.advance(10 * 60)         # both idle and runtime cap are exceeded
    decision = guard.evaluate()
    assert decision.should_shutdown is True
    assert decision.reason == REASON_RUNTIME_CAP  # runtime cap wins


def test_runtime_remaining_reported():
    clock = FakeClock()
    guard = _guard(clock, runtime_minutes=20.0)
    clock.advance(5 * 60)
    decision = guard.evaluate()
    assert abs(decision.runtime_remaining_secs - 15 * 60) < 1e-6


# --- session counting ------------------------------------------------------ #

def test_session_counter_clamps_at_zero():
    clock = FakeClock()
    guard = _guard(clock)
    assert guard.session_started() == 1
    assert guard.session_started() == 2
    assert guard.session_ended() == 1
    assert guard.session_ended() == 0
    assert guard.session_ended() == 0  # never negative
    assert guard.active_sessions == 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from _runner import run_module_tests

    raise SystemExit(run_module_tests(dict(globals())))
