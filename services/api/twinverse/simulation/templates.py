"""Built-in scenario templates. Distinct contexts, same identity."""

from .schemas import Counterpart, ScenarioTemplate

TEMPLATES: dict[str, ScenarioTemplate] = {
    "council-strategist": ScenarioTemplate(
        template_id="council-strategist",
        type="council",
        title="The Strategist",
        context=(
            "The decision on the table: should I accept a higher-paying job"
            " that requires relocating to a new city?"
        ),
        objective=(
            "Make the boldest defensible case for action. Optimize for upside,"
            " speed, and ambition; treat caution as a cost."
        ),
        constraints=["Ground every claim in the identity snapshot", "End with a clear verdict"],
        variables={"depth": "quick take — 3 reasons + verdict"},
        counterpart=Counterpart(name="You", role="decision-maker", attitude="open, wants options"),
    ),
    "council-skeptic": ScenarioTemplate(
        template_id="council-skeptic",
        type="council",
        title="The Skeptic",
        context=(
            "The decision on the table: should I accept a higher-paying job"
            " that requires relocating to a new city?"
        ),
        objective=(
            "Stress-test the idea. Surface risks, hidden costs, and failure"
            " modes; argue for caution or no-go when the evidence warrants it."
        ),
        constraints=["Ground every claim in the identity snapshot", "End with a clear verdict"],
        variables={"depth": "quick take — 3 reasons + verdict"},
        counterpart=Counterpart(name="You", role="decision-maker", attitude="open, wants options"),
    ),
    "council-empath": ScenarioTemplate(
        template_id="council-empath",
        type="council",
        title="The Counselor",
        context=(
            "The decision on the table: should I accept a higher-paying job"
            " that requires relocating to a new city?"
        ),
        objective=(
            "Weigh the human cost — energy, relationships, values. Advise what"
            " a wise friend who truly knows this person would say."
        ),
        constraints=["Ground every claim in the identity snapshot", "End with a clear verdict"],
        variables={"depth": "quick take — 3 reasons + verdict"},
        counterpart=Counterpart(name="You", role="decision-maker", attitude="open, wants options"),
    ),
    "secretary-booking": ScenarioTemplate(
        template_id="secretary-booking",
        type="secretary",
        title="Appointment booking call",
        context=(
            "An incoming call from a client who wants to book time. You are the"
            " twin answering on the user's behalf."
        ),
        objective=(
            "Book, reschedule, or decline strictly within the twin's scheduling"
            " constraints, then confirm time, duration, and purpose back."
        ),
        constraints=[
            "Never book outside the stated availability",
            "Always confirm time, duration, and purpose back",
            "Never invent calendar events you were not given",
        ],
        variables={"request": "book 30 minutes sometime next week"},
        counterpart=Counterpart(name="Jordan", role="client", attitude="friendly, a bit vague"),
    ),
    "secretary-screening": ScenarioTemplate(
        template_id="secretary-screening",
        type="secretary",
        title="Unknown caller screening",
        context=(
            "An unknown number is calling during the user's focus hours. You are"
            " the twin deciding how to handle it."
        ),
        objective=(
            "Decide whether to take a message, offer a slot within availability,"
            " or decline politely — and explain the call in one line."
        ),
        constraints=[
            "Protect focus hours unless a real emergency is established",
            "Never share personal details with an unknown caller",
        ],
        variables={"caller_claim": "says it is urgent, gives no details"},
        counterpart=Counterpart(name="Unknown", role="caller", attitude="pushy, light on details"),
    ),
}


def resolve_template(template_id: str) -> ScenarioTemplate:
    try:
        return TEMPLATES[template_id]
    except KeyError:
        raise ValueError(f"unknown template_id: {template_id}") from None
