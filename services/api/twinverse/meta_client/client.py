"""Isolated Meta Model API client. All provider details live here."""

from __future__ import annotations

import time
from dataclasses import dataclass

from openai import OpenAI

from ..settings import Settings

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
        self._client: OpenAI | None = None

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

    def _live_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                base_url=self._settings.meta_model_base_url,
                api_key=self._settings.model_api_key,
                timeout=self._settings.model_timeout_s,
            )
        return self._client

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
            live = self._live_client()
            if timeout_s is not None:
                live = live.with_options(timeout=timeout_s)
            response = live.responses.create(model=model, input=prompt)
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
        import base64

        if self._use_fixture:
            raise MetaClientError(
                "image generation needs a live model call: set MODEL_API_KEY"
            )
        if not self._settings.model_api_key:
            raise MetaClientError("MODEL_API_KEY is not set")
        try:
            resp = self._live_client().images.generate(
                model=model or self._settings.meta_model_image,
                prompt=prompt,
                size="1024x1024",
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
    """Build a client from env + project .env (fresh each call)."""
    return MetaClient(Settings())
