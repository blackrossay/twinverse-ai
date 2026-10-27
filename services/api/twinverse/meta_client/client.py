"""Isolated Meta Model API client. All provider details live here."""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass

from openai import OpenAI

from ..settings import Settings, get_settings

FIXTURE_LABEL = "[OFFLINE FIXTURE — not a live model call]"


class MetaClientError(RuntimeError):
    """Raised for configuration and request failures with a clear message."""


@dataclass(frozen=True)
class ModelResult:
    text: str
    model: str
    latency_ms: int
    fixture: bool


class MetaClient:
    """Thin wrapper over the OpenAI-compatible Meta Model API (Responses API).

    Fixture mode exists so the app stays runnable and testable without a key.
    Fixture output is always labeled and must never be presented as live output.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._clients: dict[str, OpenAI] = {}

    @property
    def mode(self) -> str:
        return "fixture" if self._use_fixture else "live"

    @property
    def model(self) -> str:
        return self._settings.meta_model_sim

    @property
    def _use_fixture(self) -> bool:
        if self._settings.model_api_key:
            return False
        return self._settings.fixtures_enabled

    def _live_client(self, api_key: str | None = None) -> OpenAI:
        key = api_key or self._settings.model_api_key
        if key not in self._clients:
            self._clients[key] = OpenAI(
                base_url=self._settings.meta_model_base_url,
                api_key=key,
                timeout=self._settings.model_timeout_s,
            )
        return self._clients[key]

    def _with_key_pool(self, call):
        """Run call(client) against each configured key; rotate on 401/429."""
        keys = self._settings.api_keys or [self._settings.model_api_key]
        last_exc: Exception | None = None
        for key in keys:
            try:
                return call(self._live_client(key))
            except Exception as exc:
                last_exc = exc
                status = getattr(exc, "status_code", None)
                if status not in (401, 403, 429) and len(keys) > 1:
                    raise
                continue
        raise last_exc  # type: ignore[misc]

    def generate(
        self, prompt: str, *, model: str | None = None, timeout_s: float | None = None
    ) -> ModelResult:
        model = model or self._settings.meta_model_sim
        if self._use_fixture:
            return ModelResult(
                text=f"{FIXTURE_LABEL} Set MODEL_API_KEY for live output.\n"
                f"Prompt received ({len(prompt)} chars).",
                model=model,
                latency_ms=0,
                fixture=True,
            )
        if not self._settings.model_api_key:
            raise MetaClientError(
                "MODEL_API_KEY is not set and fixtures are disabled "
                "(TWINVERSE_FIXTURES=off). Set the key or enable fixtures."
            )
        started = time.monotonic()
        try:
            def _call(live: OpenAI):
                client = live.with_options(timeout=timeout_s) if timeout_s is not None else live
                return client.responses.create(model=model, input=prompt)

            response = self._with_key_pool(_call)
        except Exception as exc:  # surface provider errors plainly, never fake output
            raise MetaClientError(f"Meta Model API request failed: {exc}") from exc
        return ModelResult(
            text=_extract_text(response),
            model=model,
            latency_ms=int((time.monotonic() - started) * 1000),
            fixture=False,
        )

    def generate_image(self, prompt: str, *, model: str | None = None) -> bytes:
        """Generate a PNG image. Returns raw bytes. No fixture fallback."""
        if self._use_fixture:
            raise MetaClientError(
                "image generation needs a live model call: set MODEL_API_KEY"
            )
        if not self._settings.model_api_key:
            raise MetaClientError("MODEL_API_KEY is not set")
        try:
            resp = self._with_key_pool(
                lambda live: live.images.generate(
                    model=model or self._settings.meta_model_image,
                    prompt=prompt,
                    size="1024x1024",
                )
            )
        except Exception as exc:
            raise MetaClientError(f"Meta image API request failed: {exc}") from exc
        data = resp.data[0] if resp.data else None
        b64 = getattr(data, "b64_json", None) if data else None
        if not b64:
            raise MetaClientError("image API returned no image data")
        try:
            return base64.b64decode(b64)
        except Exception as exc:
            raise MetaClientError(f"image API returned invalid data: {exc}") from exc


def _extract_text(response: object) -> str:
    """Defensively pull text out of a Responses API result."""
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text:
        return output_text
    dump = response.model_dump() if hasattr(response, "model_dump") else {}
    parts: list[str] = []
    for item in dump.get("output", []) or []:
        for block in item.get("content", []) or []:
            if isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
    if parts:
        return "".join(parts)
    raise MetaClientError(f"Unrecognized Meta Model API response shape: {dump!r}"[:500])


def default_client() -> MetaClient:
    """Build a client from cached process settings."""
    return MetaClient(get_settings())
