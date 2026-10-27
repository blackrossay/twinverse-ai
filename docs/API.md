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

- `GET /api/scenarios/templates` → the 5 builtin templates (3 council lenses + 2 secretary flows)
- `POST /api/simulations` — body `{twin_id, version?, scenarios: [{template_id, variables?, objective_override?, context_override?}] (1–3)}` → 202 `SimulationRun` shell; executes in background
- `GET /api/simulations?twin_id=` → `SimulationRun[]` (newest first)
- `GET /api/simulations/{id}` → full run with per-scenario status/outputs
- `POST /api/simulations/{id}/rerun` — body `{scenario_ids?, variables?, objective_overrides?, context_overrides?}` → 202 child run
- `GET /api/simulations/{id}/comparison` → `{deterministic[], evaluations[], summary, model}`; 409 while running; cached after first compute

## Talking verdicts (open-source avatars, local only)

- `GET /api/avatar/status` → `{configured, voice_ready, lipsync_ready, likeness_present, device, missing[], lipsync_note}`
- `POST /api/avatar/likeness` — multipart `photo` + `voice` + `consent=true` (self-consent required) → `AvatarStatus`; files stay under `data/avatars/likeness/`
- `DELETE /api/avatar/likeness` → `AvatarStatus` (wipes every likeness byte)
- `POST /api/simulations/{id}/talking-verdict` → 202 `TalkingVerdict` shell; renders in background (404 unknown run, 409 run active, 503 pipeline/likeness missing)
- `GET /api/simulations/{id}/talking-verdict` → latest job; poll until `done`/`failed`
- `GET /api/avatar/video/{job_id}` → MP4 (404 until rendered)

## Conversations (Talk to your twin)

- `POST /api/twins/{id}/conversations` — body `{title?}` → 201 `Conversation` (empty turns)
- `GET /api/twins/{id}/conversations?limit=` → `Conversation[]` (recent first)
- `GET /api/conversations/{session_id}` → session with all turns
- `DELETE /api/conversations/{session_id}` → 204
- `POST /api/conversations/{session_id}/turns` — body `{message}` → twin `Turn` (sync LLM call, remembered)
- `POST /api/conversations/turns/{turn_id}/voice` → 202 `Turn` with `voice_status=queued` (503 if avatar pipeline/likeness missing)
- `POST /api/conversations/turns/{turn_id}/video` → 202 `Turn` with `video_status=queued`
- `GET /api/conversations/turns/{turn_id}/audio` → WAV (404 until rendered)
- `GET /api/conversations/turns/{turn_id}/video` → MP4 (404 until rendered)

See docs/CONVERSATION.md for the voice-agent pipeline and limits.

## Live Twin Studio

- `POST /api/twins/{id}/live-sessions` — `{title?, mode: general|business|life|socials, platforms[], agenda[]}` → 201 `LiveSession`
- `GET /api/twins/{id}/live-sessions` · `GET /api/live/{session_id}` · `DELETE /api/live/{session_id}`
- `POST /api/live/{session_id}/end` · `POST /api/live/{session_id}/agenda` `{text}`
- `POST /api/live/{session_id}/advance` → delivers next discussion point as a `LiveMessage`
- `POST /api/live/{session_id}/chat` — `{platform, username, message, priority?}` → message with spoken twin `reply`
- `POST /api/live/messages/{msg_id}/voice|video` → 202 (503 without avatar pipeline/likeness)
- `GET /api/live/messages/{msg_id}/audio|video` · `GET /api/avatar/likeness/photo`

See docs/LIVE.md for the multistream model and the real-platform bridge.

## Conventions

- 422 = validation error (bad input, unknown template); 404 = twin/run/version/card missing; 502 = model call failed or key missing where a live call is required.
- Long operations (simulations ~30–90s/scenario, first comparison ~1–2 min) run async or are cache-backed; the UI polls.
