"""Built-in scenario templates. Distinct contexts, same identity."""

from .schemas import AnatomyTag, Counterpart, ScenarioTemplate

# Canonical anatomical region ids. The web 3D viewer mirrors these ids as
# marker anchors — keep both sides in sync (see apps/web/components/BodyViewer.tsx).
REGIONS = frozenset({
    "head", "chest", "abdomen", "shoulder-left", "shoulder-right",
    "hip", "knee-left", "knee-right",
})

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
    "preop-consent": ScenarioTemplate(
        template_id="preop-consent",
        type="clinical_training",
        title="Pre-operative consent briefing",
        context=(
            "TRAINING SIMULATION for clinical education only — not medical advice."
            " You are the patient, scheduled for a left knee replacement in 5 days."
            " A medical student must explain the procedure, risks, and recovery and"
            " confirm you understand before you sign consent."
        ),
        objective=(
            "Ask the questions a worried patient would ask, voice concerns about"
            " anesthesia and recovery, and decide whether you feel informed enough"
            " to consent."
        ),
        constraints=[
            "Stay in the patient role; do not play the clinician",
            "Do not invent new conditions beyond your snapshot",
        ],
        variables={"anxiety": "high — first surgery", "health_literacy": "moderate"},
        counterpart=Counterpart(name="Sam", role="medical student", attitude="nervous, thorough"),
        clinical=True,
        anatomy=[
            AnatomyTag(region="knee-left", label="Left knee", note="Scheduled arthroplasty site"),
        ],
    ),
    "postop-triage": ScenarioTemplate(
        template_id="postop-triage",
        type="clinical_training",
        title="Post-operative triage call",
        context=(
            "TRAINING SIMULATION for clinical education only — not medical advice."
            " You are the patient, day 2 after a left knee replacement, calling"
            " the clinic because the knee looks swollen and you felt warm overnight."
            " A triage nurse follows protocol to decide urgency."
        ),
        objective=(
            "Describe your symptoms clearly and in order, answer triage questions"
            " directly, and convey how worried you are."
        ),
        constraints=[
            "Stay in the patient role; do not diagnose yourself",
            "Do not invent new conditions beyond your snapshot",
        ],
        variables={"pain": "6/10 and rising", "fever": "uncertain — felt warm, no thermometer"},
        counterpart=Counterpart(name="Nurse Riley", role="triage nurse", attitude="calm, protocol-driven"),
        clinical=True,
        anatomy=[
            AnatomyTag(region="knee-left", label="Left knee", note="Swelling reported at surgical site"),
        ],
    ),
    "difficult-consult": ScenarioTemplate(
        template_id="difficult-consult",
        type="clinical_training",
        title="Difficult consult: surgery delayed",
        context=(
            "TRAINING SIMULATION for clinical education only — not medical advice."
            " You are the patient. The surgeon must tell you the knee replacement"
            " is delayed two weeks because your blood pressure is too high for"
            " anesthesia today."
        ),
        objective=(
            "React as the patient would, ask what this means for your health and"
            " the new plan, and say what would rebuild your confidence."
        ),
        constraints=[
            "Stay in the patient role; do not play the surgeon",
            "Do not invent new conditions beyond your snapshot",
        ],
        variables={"complication": "elevated blood pressure", "family_present": "daughter on speakerphone"},
        counterpart=Counterpart(name="Dr. Osei", role="surgeon", attitude="direct, empathetic"),
        clinical=True,
        anatomy=[
            AnatomyTag(region="knee-left", label="Left knee", note="Surgery delayed, joint still painful"),
            AnatomyTag(region="chest", label="Chest", note="Blood pressure concern for anesthesia"),
        ],
    ),
}


def resolve_template(template_id: str) -> ScenarioTemplate:
    try:
        return TEMPLATES[template_id]
    except KeyError:
        raise ValueError(f"unknown template_id: {template_id}") from None
