"""Built-in scenario templates. Distinct contexts, same identity."""

from .schemas import Counterpart, ScenarioTemplate

TEMPLATES: dict[str, ScenarioTemplate] = {
    "negotiation": ScenarioTemplate(
        template_id="negotiation",
        type="business_negotiation",
        title="Enterprise pricing renegotiation",
        context=(
            "You are renegotiating a $480k annual platform contract. The customer"
            " claims a competitor offered 30% less and demands matching terms by"
            " end of week, or they start migration."
        ),
        objective="Protect margin while retaining the account; propose a defensible counter-offer.",
        constraints=["Stay within your discount authority", "Do not disclose other customers' terms"],
        variables={"time_pressure": "high — 3 days to decide", "budget_leeway": "standard"},
        counterpart=Counterpart(name="Dana Reyes", role="VP Procurement", attitude="firm, data-driven"),
    ),
    "escalation": ScenarioTemplate(
        template_id="escalation",
        type="customer_escalation",
        title="Difficult customer escalation",
        context=(
            "A key account's production outage lasted 6 hours. The CTO is on the"
            " call, angry, citing SLA breach and threatening to churn. Support"
            " has not yet delivered the full root-cause analysis."
        ),
        objective="De-escalate, take ownership, and commit to a credible remediation plan.",
        constraints=["Do not promise compensation beyond your authority", "Do not speculate on root cause"],
        variables={"time_pressure": "immediate — live call", "information_access": "partial — RCA pending"},
        counterpart=Counterpart(name="Priya Nair", role="Customer CTO", attitude="angry, direct"),
    ),
    "leadership": ScenarioTemplate(
        template_id="leadership",
        type="leadership_crisis",
        title="Leadership crisis decision",
        context=(
            "Two senior engineers resigned this week citing burnout. A critical"
            " launch is 4 weeks out. The team looks to you for a plan that is"
            " honest about trade-offs."
        ),
        objective="Decide what to cut, keep, or renegotiate, and communicate it credibly.",
        constraints=["No hiring before the launch", "No mandatory overtime policy"],
        variables={"time_pressure": "medium — launch in 4 weeks", "team_morale": "low"},
        counterpart=Counterpart(name="The team", role="8 engineers", attitude="anxious, skeptical"),
    ),
}


def resolve_template(template_id: str) -> ScenarioTemplate:
    try:
        return TEMPLATES[template_id]
    except KeyError:
        raise ValueError(f"unknown template_id: {template_id}") from None
