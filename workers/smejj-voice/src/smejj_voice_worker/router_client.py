"""smejj.com voice worker — model router client (BYOK, OpenAI-compatible).

Single responsibility: turn validated config into a Pipecat LLM service that
talks to the smejj.com model router. The router (control-server/src/llm/
modelRouter.js) is model-agnostic and OpenAI-compatible, so every model
(glm-5.2, kimi-k2.7, smejj-1.0, and future GPT/Claude/Gemini/DeepSeek entries)
is reachable via base_url + requested model + a user-provided key — without
changing this code.

Heavy Pipecat imports are deferred into the builder so config/validation stay
dependency-light and unit-testable without Pipecat installed. fail-closed:
validation refuses to run without a base URL, a BYOK key and a model.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import ConfigError, SmejjVoiceConfig


@dataclass(frozen=True)
class RouterResolution:
    """Validated router wiring (no secrets beyond the forwarded key)."""

    base_url: str
    model: str
    api_key: str


def verify_router_config(config: SmejjVoiceConfig) -> RouterResolution:
    """Pure validation of the router wiring — no network, unit-testable.

    Raises ConfigError (fail-closed) when anything required is missing.
    """
    router = getattr(config, "router", None)
    if router is None:
        raise ConfigError("router config missing (fail-closed)")
    if not getattr(router, "base_url", ""):
        raise ConfigError("router base URL missing (fail-closed)")
    if not getattr(router, "api_key", ""):
        raise ConfigError("router API key (BYOK) missing (fail-closed)")
    if not getattr(router, "model", ""):
        raise ConfigError("requested model missing (fail-closed)")
    return RouterResolution(
        base_url=router.base_url.rstrip("/"),
        model=router.model,
        api_key=router.api_key,
    )


def build_llm_service(config: SmejjVoiceConfig):
    """Build a Pipecat LLM service bound to the smejj.com router.

    Pipecat's OpenAILLMService speaks the OpenAI chat-completions spec and
    accepts a custom base_url, so any OpenAI-compatible router works unchanged
    (streaming for low latency is on by default). VERIFY the import path against
    the pinned pipecat-ai version in requirements.txt.
    """
    resolution = verify_router_config(config)
    # Deferred heavy import — keeps this module importable without Pipecat.
    from pipecat.services.openai.llm import OpenAILLMService

    return OpenAILLMService(
        api_key=resolution.api_key,   # BYOK — forwarded only, never persisted
        base_url=resolution.base_url,  # smejj.com router, OpenAI-compatible
        model=resolution.model,        # requested model (default glm-5.2)
    )


def build_context(config: SmejjVoiceConfig):
    """Build the initial OpenAI-style LLM context with the language-agnostic
    system prompt (auto-detect + answer in the user's language).

    Deferred import for the same dependency-isolation reason.
    """
    from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

    messages = [{"role": "system", "content": config.router.system_prompt}]
    return OpenAILLMContext(messages)
