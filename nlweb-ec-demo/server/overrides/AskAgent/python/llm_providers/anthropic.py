# Copyright (c) 2025 Microsoft Corporation.
# Licensed under the MIT License
#
# ACLAB override P1 of
# AskAgent/python/llm_providers/anthropic.py at nlweb-ai/NLWeb b423f15.
#
# Why this file replaces upstream:
#   1. The conversation starts with the user turn. Upstream sent an assistant turn first,
#      which the current Messages API rejects. The schema now travels in the system prompt.
#   2. `temperature` is not forwarded. Claude Sonnet 5 rejects sampling parameters; Haiku 4.5
#      accepts them, but the upstream default (1.0) adds nothing for JSON extraction.
#   3. Thinking is set explicitly (NLWEB_ANTHROPIC_THINKING = disabled | adaptive | omit,
#      default disabled) and the first *text* block is read. Sonnet 5 runs adaptive thinking
#      when the parameter is omitted, so `content[0]` can be a thinking block.
#   4. Failures are logged at WARNING with the model name before core.llm swallows them.
#   5. Default model names (retired claude-3-x) come from config/config_llm.yaml, which this
#      demo ships with environment-driven names (NLWEB_LLM_HIGH / NLWEB_LLM_LOW).

"""
Anthropic wrapper for LLM functionality.

WARNING: This code is under development and may undergo changes in future releases.
Backwards compatibility is not guaranteed at this time.
"""

import asyncio
import json
import logging
import os
import re
import threading
from typing import Any

from anthropic import AsyncAnthropic

from core.config import CONFIG
from llm_providers.llm_provider import LLMProvider

logger = logging.getLogger(__name__)

THINKING_ENV = "NLWEB_ANTHROPIC_THINKING"
THINKING_MODES = ("disabled", "adaptive", "omit")
DEFAULT_THINKING = "disabled"


class ConfigurationError(RuntimeError):
    """Raised when configuration is missing or invalid."""
    pass


class AnthropicProvider(LLMProvider):
    """Implementation of LLMProvider for Anthropic API."""

    _client_lock = threading.Lock()
    _client = None

    @classmethod
    def get_api_key(cls) -> str:
        """Retrieve the Anthropic API key from the environment or raise an error."""
        provider_config = CONFIG.llm_endpoints["anthropic"]
        if provider_config and provider_config.api_key:
            api_key = provider_config.api_key.strip('"')
            if api_key:
                return api_key
        raise ConfigurationError("Environment variable ANTHROPIC_API_KEY is not set")

    @classmethod
    def get_client(cls) -> AsyncAnthropic:
        """
        Configure and return an async Anthropic client.
        The SDK reads ANTHROPIC_BASE_URL, so a recording proxy can sit in front of the API.
        """
        with cls._client_lock:
            if cls._client is None:
                cls._client = AsyncAnthropic(api_key=cls.get_api_key())
        return cls._client

    @staticmethod
    def thinking_mode() -> str:
        mode = os.environ.get(THINKING_ENV, DEFAULT_THINKING)
        if mode not in THINKING_MODES:
            raise ConfigurationError(
                f"{THINKING_ENV} must be one of {', '.join(THINKING_MODES)} (got {mode!r})"
            )
        return mode

    @classmethod
    def _build_system(cls, schema: dict[str, Any]) -> str:
        return (
            "You are a helpful assistant that always responds with a single valid JSON object "
            f"matching this JSON schema, and nothing else: {json.dumps(schema)}"
        )

    @classmethod
    def _build_messages(cls, prompt: str) -> list[dict[str, str]]:
        return [{"role": "user", "content": prompt}]

    @classmethod
    def clean_response(cls, content: str) -> dict[str, Any]:
        """
        Strip markdown fences and extract the first JSON object.
        """
        cleaned = re.sub(r"```(?:json)?\s*", "", content).strip()
        match = re.search(r"(\{.*\})", cleaned, re.S)
        if not match:
            logger.error("Failed to parse JSON from content: %r", content)
            raise ValueError("No JSON object found in response")
        return json.loads(match.group(1))

    @staticmethod
    def _first_text(response: Any) -> str:
        for block in response.content:
            if getattr(block, "type", None) == "text":
                return block.text
        raise ValueError(
            f"No text block in Anthropic response (stop_reason={response.stop_reason!r})"
        )

    async def get_completion(
        self,
        prompt: str,
        schema: dict[str, Any],
        model: str | None = None,
        temperature: float = 1.0,
        max_tokens: int = 2048,
        timeout: float = 30.0,
        **kwargs
    ) -> dict[str, Any]:
        """
        Send an async chat completion request to Anthropic and return parsed JSON.
        `temperature` is accepted for signature compatibility and intentionally not sent.
        """
        if model is None:
            model = CONFIG.llm_endpoints["anthropic"].models.high

        request: dict[str, Any] = {
            "model": model,
            "messages": self._build_messages(prompt),
            "max_tokens": max_tokens,
            "system": self._build_system(schema),
        }
        mode = self.thinking_mode()
        if mode != "omit":
            request["thinking"] = {"type": mode}

        client = self.get_client()
        try:
            response = await asyncio.wait_for(client.messages.create(**request), timeout)
        except asyncio.TimeoutError:
            logger.warning("Anthropic completion timed out after %ss (model=%s)", timeout, model)
            return {}
        except Exception as exc:
            logger.warning(
                "Anthropic completion failed (model=%s): %s: %s", model, type(exc).__name__, exc
            )
            raise

        return self.clean_response(self._first_text(response))


# Create a singleton instance
provider = AnthropicProvider()

# For backwards compatibility
get_anthropic_completion = provider.get_completion
