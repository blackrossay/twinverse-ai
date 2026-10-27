"""Fictional seed personas for demos and tests. No real people."""

from __future__ import annotations

from .schemas import (
    Fact,
    Hypothesis,
    IdentityPayload,
    ProvenanceEntry,
    TwinCreate,
)


def _prov(*fields: str) -> list[ProvenanceEntry]:
    return [ProvenanceEntry(field=f, source="seed", detail="builtin fictional persona") for f in fields]


SEEDS: list[TwinCreate] = [
    TwinCreate(
        name="Maya Chen",
        profile_type="personal",
        bio=(
            "Maya Chen is a freelance brand designer with 4 years of experience"
            " and two retainer clients. She is deciding between staying indie"
            " and accepting a stable in-house job offer. She protects her mornings"
            " and never takes meetings before 10am."
        ),
        verified_facts=[
            {"statement": "Freelance brand designer with 4 years of experience", "category": "work"},
            {"statement": "Has two retainer clients", "category": "work"},
            {"statement": "Deciding between indie life and an in-house job offer", "category": "other"},
            {"statement": "Never takes meetings before 10am", "category": "preference"},
        ],
        skills=["brand identity", "client communication", "scoping projects"],
        goals=["Build a sustainable independent practice"],
        constraints=["No meetings before 10am", "Protects weekends for family"],
        behavioral_hypotheses=[
            {
                "statement": "Underprices rush work when a client sounds stressed",
                "confidence": 0.55,
                "basis": "Empathetic communicator juggling client relationships",
            }
        ],
        communication_style={"tone": "warm", "verbosity": "moderate"},
    ),
    TwinCreate(
        name="Leo Park",
        profile_type="personal",
        bio=(
            "Leo Park is a junior software engineer, 1.5 years into his first job."
            " He is on a weekly on-call rotation and studying system design to"
            " earn a promotion. He guards deep-focus blocks from 9 to 11am."
        ),
        verified_facts=[
            {"statement": "Junior software engineer, 1.5 years of experience", "category": "work"},
            {"statement": "On a weekly on-call rotation", "category": "work"},
            {"statement": "Studying system design for promotion", "category": "other"},
            {"statement": "Guards focus blocks from 9 to 11am", "category": "preference"},
        ],
        skills=["debugging", "writing clear pull requests", "incident notes"],
        goals=["Earn a promotion to mid-level engineer"],
        constraints=["No non-urgent calls during 9-11am focus blocks"],
        behavioral_hypotheses=[
            {
                "statement": "Says yes to extra on-call swaps to look reliable",
                "confidence": 0.6,
                "basis": "Junior engineer optimizing for promotion signals",
            }
        ],
        communication_style={"tone": "direct", "verbosity": "concise"},
    ),
]


def seed_payload(seed: TwinCreate) -> IdentityPayload:
    fields = [
        k
        for k in (
            "verified_facts",
            "skills",
            "goals",
            "constraints",
            "behavioral_hypotheses",
            "communication_style",
        )
        if getattr(seed, k)
    ]
    return IdentityPayload(
        verified_facts=[Fact(**f.model_dump()) for f in seed.verified_facts],
        skills=list(seed.skills),
        goals=list(seed.goals),
        constraints=list(seed.constraints),
        behavioral_hypotheses=[Hypothesis(**h.model_dump()) for h in seed.behavioral_hypotheses],
        communication_style=dict(seed.communication_style),
        consent=dict(seed.consent),
        bio=seed.bio,
        provenance=_prov(*fields),
    )
