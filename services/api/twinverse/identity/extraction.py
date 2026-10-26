"""Model-assisted identity extraction: bio -> validated IdentityPayload."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from ..meta_client import MetaClient, MetaClientError
from .schemas import (
    Fact,
    FactInput,
    Hypothesis,
    HypothesisInput,
    IdentityPayload,
    ProvenanceEntry,
)

PROMPT_VERSION = "v1"
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "identity_extraction.md"


class _Extracted(BaseModel):
    verified_facts: list[FactInput] = []
    skills: list[str] = []
    goals: list[str] = []
    constraints: list[str] = []
    behavioral_hypotheses: list[HypothesisInput] = []
    communication_style: dict[str, str] = {}


def render_prompt(name: str, bio: str) -> str:
    template = _PROMPT_PATH.read_text()
    return template.replace("{{NAME}}", name).replace("{{BIO}}", bio)


def extract_identity(bio: str, name: str, client: MetaClient) -> IdentityPayload:
    """Run extraction with one repair retry. Never invents missing values."""
    if not bio.strip():
        raise MetaClientError("extraction needs a non-empty bio")
    first = client.generate(render_prompt(name, bio))
    if first.fixture:
        raise MetaClientError(
            "identity extraction needs a live model call: set MODEL_API_KEY"
        )
    try:
        return _to_payload(_parse(first.text), bio)
    except (ValueError, TypeError) as exc:
        repair = client.generate(
            f"Your last output was invalid ({exc}). Return corrected JSON only,"
            f" same schema, no commentary.\n\nInvalid output:\n{first.text[:2000]}"
        )
        try:
            return _to_payload(_parse(repair.text), bio)
        except (ValueError, TypeError):
            raise MetaClientError(
                "identity extraction failed: model returned invalid data twice;"
                " adjust the bio or retry"
            ) from None


def _parse(text: str) -> _Extracted:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"not valid JSON: {exc}") from None
    if not isinstance(data, dict):
        raise ValueError("top-level JSON must be an object")
    for hyp in data.get("behavioral_hypotheses", []) or []:
        conf = (hyp or {}).get("confidence")
        if conf is not None and conf > 0.7:
            raise ValueError("hypothesis confidence above 0.7 cap")
    return _Extracted.model_validate(data)


def _to_payload(data: _Extracted, bio: str) -> IdentityPayload:
    fields = [k for k in _Extracted.model_fields if getattr(data, k)]
    return IdentityPayload(
        verified_facts=[Fact(**f.model_dump()) for f in data.verified_facts],
        skills=data.skills,
        goals=data.goals,
        constraints=data.constraints,
        behavioral_hypotheses=[Hypothesis(**h.model_dump()) for h in data.behavioral_hypotheses],
        communication_style=data.communication_style,
        bio=bio,
        provenance=[
            ProvenanceEntry(
                field=f, source="model", detail=f"identity_extraction/{PROMPT_VERSION}"
            )
            for f in fields
        ],
    )
