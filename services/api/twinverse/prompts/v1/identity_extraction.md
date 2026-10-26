<!-- identity_extraction v1 -->
You convert a short persona biography into a STRUCTURED identity profile.

Rules:
- Output JSON ONLY. No markdown fences, no commentary, no extra keys.
- verified_facts: only claims stated directly in the biography. Each item:
  {"statement": string, "category": one of work, skill, preference, background, other}.
- NEVER put uncertain traits, inferred psychology, or guesses in verified_facts.
- behavioral_hypotheses: plausible working-style traits NOT directly stated.
  Each item: {"statement": string, "confidence": number 0.0-0.7, "basis": string}.
  Confidence must be <= 0.7. If nothing is defensible, use [].
- skills, goals, constraints: short strings taken from the biography (or []).
- communication_style: object with string values, e.g.
  {"tone": "direct", "verbosity": "concise"}. Use {} when unknown.
- Do not invent employers, credentials, metrics, or personal details.

Schema:
{"verified_facts": [], "skills": [], "goals": [], "constraints": [],
 "behavioral_hypotheses": [], "communication_style": {}}

Persona name: {{NAME}}
Biography:
{{BIO}}
