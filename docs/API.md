# API reference

Base URL: `http://localhost:8000`. Errors are JSON `{detail}`.

## Health

- `GET /api/health` → `{status, service, version, model_mode: live|fixture, model, model_api_configured}`

## Twins

- `POST /api/twins` — body `{name, profile_type?, bio?, verified_facts?, skills?, goals?, constraints?, behavioral_hypotheses?, communication_style?, consent?}`. Bio-only triggers AI extraction (502 without a key). Structured-only stores directly. → 201 `TwinDetail`
- `GET /api/twins` → `Twin[]`
- `GET /api/twins/{id}?version=n` → `TwinDetail` (default: current version)
- `GET /api/twins/{id}/versions` → `int[]`
- `PATCH /api/twins/{id}` — provided lists replace wholesale; omitted fields preserved → new version
- `DELETE /api/twins/{id}` → 204 (also deletes the identity card)
- `POST /api/twins/seed` → creates missing builtin fictional personas (idempotent)
- `POST /api/twins/{id}/image` → 201 `{twin_id, url, bytes}` (live `muse-image-1.0`)
- `GET /api/twins/{id}/image` → PNG (404 until generated)

## Simulations

- `GET /api/scenarios/templates` → the 3 builtin templates (negotiation, escalation, leadership)
- `POST /api/simulations` — body `{twin_id, version?, scenarios: [{template_id, variables?, objective_override?, context_override?}] (1–3)}` → 202 `SimulationRun` shell; executes in background
- `GET /api/simulations?twin_id=` → `SimulationRun[]` (newest first)
- `GET /api/simulations/{id}` → full run with per-scenario status/outputs
- `POST /api/simulations/{id}/rerun` — body `{scenario_ids?, variables?, objective_overrides?, context_overrides?}` → 202 child run
- `GET /api/simulations/{id}/comparison` → `{deterministic[], evaluations[], summary, model}`; 409 while running; cached after first compute

## Conventions

- 422 = validation error (bad input, unknown template); 404 = twin/run/version/card missing; 502 = model call failed or key missing where a live call is required.
- Long operations (simulations ~30–90s/scenario, first comparison ~1–2 min) run async or are cache-backed; the UI polls.
