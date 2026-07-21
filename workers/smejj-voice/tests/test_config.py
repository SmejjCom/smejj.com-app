"""Unit tests for the smejj.com voice worker config + budget gate (fail-closed).

Dependency-free: only stdlib and the package's light config module (no Pipecat,
no CUDA). Runs under pytest OR standalone: `python3 tests/test_config.py`.
"""
import os
import sys

_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from smejj_voice_worker.config import (  # noqa: E402
    ConfigError,
    SmejjVoiceConfig,
    evaluate_budget_gate,
    positive_number,
)

# A fully valid, cheap, within-caps environment (values chosen for a <10 USD/mo
# hobby budget: a few cents per session, a 20-minute runtime cap).
BASE_ENV = {
    "SMEJJ_BUDGET_MAX_USD_PER_JOB": "0.05",
    "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES": "20",
    "SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS": "1",
    "SMEJJ_WORKER_BUDGET_USD": "0.03",
    "SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES": "10",
    "SMEJJ_LLM_BASE_URL": "https://router.smejj.com/v1",
    "SMEJJ_LLM_API_KEY": "byok-test-key",
    "SMEJJ_TTS_BASE_URL": "http://127.0.0.1:5000",
}


def _has(reasons, prefix):
    return any(str(r).startswith(prefix) for r in reasons)


# --- budget gate ----------------------------------------------------------- #

def test_positive_number():
    assert positive_number("0.05") == 0.05
    assert positive_number("0") == 0.0
    assert positive_number("-3") == 0.0
    assert positive_number("nan") == 0.0
    assert positive_number("") == 0.0
    assert positive_number(None) == 0.0


def test_budget_gate_empty_env_fail_closed():
    decision = evaluate_budget_gate({})
    assert decision.approved is False
    assert decision.as_public_dict()["failClosed"] is True
    assert _has(decision.reasons, "budget_limit_missing:SMEJJ_BUDGET_MAX_USD_PER_JOB")
    assert _has(decision.reasons, "budget_limit_missing:SMEJJ_BUDGET_MAX_RUNTIME_MINUTES")
    assert _has(decision.reasons, "positive_worker_budget_required:SMEJJ_WORKER_BUDGET_USD")
    assert _has(decision.reasons, "estimated_runtime_required")


def test_budget_gate_approved_within_caps():
    decision = evaluate_budget_gate(BASE_ENV, active_workers=0)
    assert decision.approved is True
    assert decision.reasons == ()
    assert decision.max_runtime_minutes == 20.0
    assert decision.worker_budget_usd == 0.03


def test_budget_gate_worker_budget_exceeds_job_cap():
    env = dict(BASE_ENV, SMEJJ_WORKER_BUDGET_USD="0.50")  # > 0.05 cap
    decision = evaluate_budget_gate(env)
    assert decision.approved is False
    assert _has(decision.reasons, "worker_budget_exceeds_job_cap")


def test_budget_gate_estimated_runtime_exceeds_cap():
    env = dict(BASE_ENV, SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES="999")  # > 20 cap
    decision = evaluate_budget_gate(env)
    assert decision.approved is False
    assert _has(decision.reasons, "estimated_runtime_exceeds_cap")


def test_budget_gate_runtime_cap_hard_bound():
    env = dict(BASE_ENV, SMEJJ_BUDGET_MAX_RUNTIME_MINUTES="2000")  # > 24h (1440)
    decision = evaluate_budget_gate(env)
    assert decision.approved is False
    assert _has(decision.reasons, "runtime_cap_exceeds_hard_bound")


def test_budget_gate_concurrency_limit():
    decision = evaluate_budget_gate(BASE_ENV, active_workers=1)  # 1 >= max 1
    assert decision.approved is False
    assert _has(decision.reasons, "max_concurrent_workers_reached")


# --- config.load fail-closed ---------------------------------------------- #

def test_config_load_refuses_without_budget_gate():
    try:
        SmejjVoiceConfig.load({"SMEJJ_LLM_BASE_URL": "x", "SMEJJ_LLM_API_KEY": "y",
                               "SMEJJ_TTS_BASE_URL": "z"})
    except ConfigError as exc:
        assert "budget gate not approved" in str(exc)
    else:
        raise AssertionError("expected ConfigError when budget gate is closed")


def test_config_load_requires_router_base_url():
    env = dict(BASE_ENV)
    env.pop("SMEJJ_LLM_BASE_URL")
    try:
        SmejjVoiceConfig.load(env)
    except ConfigError as exc:
        assert "SMEJJ_LLM_BASE_URL" in str(exc)
    else:
        raise AssertionError("expected ConfigError without router base URL")


def test_config_load_requires_byok_key():
    env = dict(BASE_ENV)
    env.pop("SMEJJ_LLM_API_KEY")
    try:
        SmejjVoiceConfig.load(env)
    except ConfigError as exc:
        assert "SMEJJ_LLM_API_KEY" in str(exc)
    else:
        raise AssertionError("expected ConfigError without BYOK key")


def test_config_load_requires_tts_base_url():
    env = dict(BASE_ENV)
    env.pop("SMEJJ_TTS_BASE_URL")
    try:
        SmejjVoiceConfig.load(env)
    except ConfigError as exc:
        assert "SMEJJ_TTS_BASE_URL" in str(exc)
    else:
        raise AssertionError("expected ConfigError without TTS base URL")


# --- config.load happy path + auto-detect --------------------------------- #

def test_config_load_happy_path():
    config = SmejjVoiceConfig.load(BASE_ENV)
    assert config.budget.approved is True
    assert config.router.base_url == "https://router.smejj.com/v1"
    assert config.router.api_key == "byok-test-key"
    assert config.router.model == "glm-5.2"
    assert config.tts.engine == "piper"
    assert config.lifecycle.idle_shutdown_secs == 120.0
    # Runtime cap reuses the budget key (same hard cap as the watchdog lease).
    assert config.lifecycle.max_runtime_minutes == 20.0
    assert config.port == 8080


def test_whisper_language_auto_detect_by_default():
    config = SmejjVoiceConfig.load(BASE_ENV)
    assert config.whisper.language is None  # None => detect EVERY language
    assert config.health_snapshot()["sttAutoDetect"] is True


def test_whisper_language_auto_keyword_is_none():
    config = SmejjVoiceConfig.load(dict(BASE_ENV, SMEJJ_WHISPER_LANGUAGE="auto"))
    assert config.whisper.language is None


def test_whisper_language_explicit_override():
    config = SmejjVoiceConfig.load(dict(BASE_ENV, SMEJJ_WHISPER_LANGUAGE="de"))
    assert config.whisper.language == "de"


def test_router_model_override():
    config = SmejjVoiceConfig.load(dict(BASE_ENV, SMEJJ_LLM_MODEL="kimi-k2.7"))
    assert config.router.model == "kimi-k2.7"


def test_router_alias_keys_accepted():
    env = dict(BASE_ENV)
    env.pop("SMEJJ_LLM_BASE_URL")
    env.pop("SMEJJ_LLM_API_KEY")
    env["SMEJJ_ROUTER_BASE_URL"] = "https://alias.smejj.com/v1"
    env["SMEJJ_ROUTER_API_KEY"] = "alias-key"
    config = SmejjVoiceConfig.load(env)
    assert config.router.base_url == "https://alias.smejj.com/v1"
    assert config.router.api_key == "alias-key"


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from _runner import run_module_tests

    raise SystemExit(run_module_tests(dict(globals())))
