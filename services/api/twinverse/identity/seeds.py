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
        name="Alex Morgan",
        profile_type="professional",
        bio=(
            "Alex Morgan is a senior product manager with 8 years of experience in"
            " B2B SaaS. Known for direct communication and data-driven decisions."
            " Currently leading a platform team through a pricing renegotiation."
        ),
        verified_facts=[
            {"statement": "Senior product manager with 8 years of B2B SaaS experience", "category": "work"},
            {"statement": "Currently leading a platform team", "category": "work"},
            {"statement": "Prefers direct communication", "category": "preference"},
        ],
        skills=["negotiation", "roadmapping", "stakeholder management"],
        goals=["Close the pricing renegotiation above target margin"],
        constraints=["No discount beyond 10% without VP approval"],
        behavioral_hypotheses=[
            {
                "statement": "Stays calm under time pressure",
                "confidence": 0.6,
                "basis": "Seniority and renegotiation context suggest composure",
            }
        ],
        communication_style={"tone": "direct", "verbosity": "concise"},
    ),
    TwinCreate(
        name="Jordan Lee",
        profile_type="professional",
        bio=(
            "Jordan Lee is a customer support lead with 5 years in technical support."
            " Empathetic communicator who de-escalates tense situations."
        ),
        verified_facts=[
            {"statement": "Customer support lead with 5 years of technical support experience", "category": "work"},
            {"statement": "Communicates empathetically", "category": "preference"},
        ],
        skills=["de-escalation", "technical troubleshooting", "coaching"],
        goals=["Resolve escalations within SLA"],
        constraints=["Never promise refunds above $500 without manager approval"],
        behavioral_hypotheses=[
            {
                "statement": "Prioritizes customer feelings over strict policy wording",
                "confidence": 0.55,
                "basis": "Described as empathetic de-escalator",
            }
        ],
        communication_style={"tone": "empathetic", "verbosity": "moderate"},
    ),
    TwinCreate(
        name="Margaret Alvarez",
        profile_type="patient",
        bio=(
            "Margaret Alvarez is a 68-year-old retired teacher scheduled for a"
            " left knee replacement in 5 days. She has hypertension controlled"
            " with medication and a penicillin allergy. This is her first surgery"
            " and she is anxious about anesthesia."
        ),
        verified_facts=[
            {"statement": "68 years old, retired teacher", "category": "background"},
            {"statement": "Scheduled for left knee replacement in 5 days", "category": "other"},
            {"statement": "Hypertension controlled with medication", "category": "other"},
            {"statement": "Penicillin allergy", "category": "other"},
            {"statement": "First surgery; anxious about anesthesia", "category": "preference"},
        ],
        skills=["describing symptoms in plain language"],
        goals=["Get through surgery safely and walk without pain"],
        constraints=["Must mention the penicillin allergy to every new clinician"],
        behavioral_hypotheses=[
            {
                "statement": "Asks many follow-up questions when anxious",
                "confidence": 0.6,
                "basis": "First surgery plus stated anxiety about anesthesia",
            }
        ],
        communication_style={"tone": "warm", "verbosity": "detailed"},
    ),
    TwinCreate(
        name="David Okafor",
        profile_type="patient",
        bio=(
            "David Okafor is a 45-year-old bus driver recovering from a left knee"
            " arthroscopy 2 days ago. He lives alone and is worried about managing"
            " stairs. He tends to understate pain."
        ),
        verified_facts=[
            {"statement": "45 years old, bus driver", "category": "background"},
            {"statement": "Day 2 after left knee arthroscopy", "category": "other"},
            {"statement": "Lives alone; concerned about stairs", "category": "background"},
            {"statement": "Tends to understate pain", "category": "preference"},
        ],
        skills=["following rehab instructions carefully"],
        goals=["Recover quickly and return to work"],
        constraints=["Must not drive until cleared by the surgeon"],
        behavioral_hypotheses=[
            {
                "statement": "Minimizes symptoms unless asked directly",
                "confidence": 0.65,
                "basis": "Described as understating pain",
            }
        ],
        communication_style={"tone": "reserved", "verbosity": "concise"},
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
