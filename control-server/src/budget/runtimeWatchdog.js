// smejj.com control-server — Laufzeit-Watchdog (Single Responsibility: Budget-Durchsetzung zur Laufzeit).
// Das Budget-Gate prueft nur beim Start. Der Watchdog setzt SMEJJ_BUDGET_MAX_RUNTIME_MINUTES
// hart durch: Nach Ablauf stoppt er den Salad Worker (autorisierter Notaus — Stoppen senkt
// Kosten und ist deshalb erlaubt, ohne auf CONFIRM_SALAD_STOP zu warten) und setzt alle
// aktiven Jobs auf "failed". Memory lernt aus diesen Abbruechen nichts.
// Vollstaendig per Dependency Injection testbar (Timer, stopWorker, Job-Zugriff).

export function createRuntimeWatchdog({
  stopWorker,
  listActiveJobs = () => [],
  failJob = () => {},
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout
} = {}) {
  const state = {
    armed: false,
    armedAt: 0,
    firesAt: 0,
    maxRuntimeMinutes: 0,
    timer: null,
    lastEnforcement: null
  };

  function status() {
    return {
      armed: state.armed,
      armedAt: state.armed ? new Date(state.armedAt).toISOString() : null,
      firesAt: state.armed ? new Date(state.firesAt).toISOString() : null,
      maxRuntimeMinutes: state.maxRuntimeMinutes,
      lastEnforcement: state.lastEnforcement
    };
  }

  function disarm() {
    if (state.timer) cancel(state.timer);
    state.timer = null;
    state.armed = false;
    return status();
  }

  async function fire(reason = "runtime_budget_exceeded") {
    disarm();
    const enforcement = {
      reason,
      firedAt: new Date(now()).toISOString(),
      workerStop: null,
      failedJobIds: []
    };
    try {
      enforcement.workerStop = await stopWorker();
    } catch (error) {
      enforcement.workerStop = { ok: false, error: String(error.message || error).slice(0, 240) };
    }
    for (const job of listActiveJobs()) {
      try {
        failJob(job, reason);
        enforcement.failedJobIds.push(job.id);
      } catch {
        // Ein einzelner fehlerhafter Job darf die Durchsetzung nicht stoppen.
      }
    }
    state.lastEnforcement = enforcement;
    return enforcement;
  }

  function arm(env = {}) {
    const minutes = Number(env.SMEJJ_BUDGET_MAX_RUNTIME_MINUTES);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return { ...status(), armed: false, reason: "runtime_limit_not_configured" };
    }
    disarm();
    const runtimeMs = minutes * 60_000;
    state.armedAt = now();
    state.firesAt = state.armedAt + runtimeMs;
    state.maxRuntimeMinutes = minutes;
    state.timer = schedule(() => { fire("runtime_budget_exceeded"); }, runtimeMs);
    if (state.timer && typeof state.timer.unref === "function") state.timer.unref();
    state.armed = true;
    return status();
  }

  return { arm, disarm, fire, status };
}
