# Decision log

## D1 (2026-10-26) — scaffold + verified Meta integration

- **Repo root = workspace root.** The plan's `twinverse-ai/` is this directory
  (`meta_hackathon/`); project name TWINVERSE AI is used in packages/docs.
- **Stack:** FastAPI + Pydantic backend, Next.js + TS + Tailwind frontend,
  SQLite. Matches master prompt; FastAPI/Pydantic verified installed, Node 24 present.
- **Meta Model API (verified 2026-10-26 against official docs):**
  - Docs: `https://dev.meta.ai/docs/overview`, `https://dev.meta.ai/docs/quickstart` (both HTTP 200, inspected).
  - Base URL `https://api.meta.ai/v1`, OpenAI-SDK compatible, auth via `MODEL_API_KEY` env.
  - `muse-spark-1.3` = default sim/eval model (quickstart example model).
  - `muse-wonder-1.0`, `muse-image-1.0`, `muse-voice-transcribe-1.0` verified as listed Model API IDs; P1-only, pending key + credits.
- **Blocker:** no `MODEL_API_KEY` in environment. Owner action: create key at
  Model API dashboard → API keys. Until then the model client uses clearly
  labeled offline fixtures (`TWINVERSE_FIXTURES=auto`); fixtures are dev-only
  and never submitted as live output.
- **Hackathon rules (partially verified):** `cerebralvalley.ai` event page fetch
  blocked (bot protection); `dev.meta.ai/events/` is 404. Dates (Oct 26–Nov 4),
  tracks (indie/startup), themes, and ~25% Meta-tooling weight come from
  secondary reports only — owner must confirm submission format/track in the portal.
- **Demo target:** local run + recorded backup video first; hosted URL is stretch.

## D1 result — backend skeleton verified

- `pytest services/api/tests`: 6 passed, 1 skipped (live smoke test skips
  honestly without `MODEL_API_KEY` — not counted as green).
- `/api/health` verified in-process via TestClient (200, correct shape, key
  mode switching, no secret leakage in response body).
- Sandbox blocks all socket binds (TCP + Unix), so a live `uvicorn` + `curl`
  smoke test must run in the owner's terminal:
  `uvicorn twinverse.main:app --port 8000` then `curl localhost:8000/api/health`.
  App import + startup completed successfully under uvicorn; only `bind()` failed.
- `uv` needs `UV_CACHE_DIR=$TMPDIR/uv-cache` inside this sandbox (default
  `~/.cache/uv` is read-only here); normal `uv` commands work outside it.
- **First live call verified (2026-10-26):** `test_live_generate_smoke` passed —
  real `muse-spark-1.3` round trip via `https://api.meta.ai/v1` returned the
  expected marker. Full suite: 7 passed. Note: trivial prompt took ~30s, so the
  demo needs progress indicators and the 60s timeout stays.

## D2 result + web dashboard (2026-10-27)

- Twin CRUD API shipped: POST/GET/PATCH/DELETE /api/twins, version history,
  immutable versions, seed endpoint. Suite: 19 passed (incl. 2 live-model tests).
- Fixed: missing version binding in `update_twin` INSERT (caught by tests).
- Public repo: https://github.com/blackrossay/twinverse-ai (branch main).
  Note: an empty `achambok/twinverse-ai` shell was auto-created during setup
  and has since been deleted by the owner.
- Web UI (Next.js 16 + Tailwind v4, `apps/web`): dashboard with live/fixture
  badge, twin list, seed button; create-twin form (bio → AI extraction);
  twin detail with facts/hypotheses/style/versions/provenance. `npm run build`
  green. CORS opened for localhost:3000 only.
- Sandbox blocks socket binds, so servers start in the owner's terminal.

## D8 hardening + docs (2026-10-27)

- Real-model hardening: `muse-spark-1.3` returns ints/bools inside string maps
  (seen in benchmark) → scalar coercion validators on sim/extraction/eval
  schemas + regression test. Repair-retry kept as second layer.
- Benchmark (live, committed script `services/api/benchmarks/run.py`): 3-scenario
  wall 37.1s vs ~87s of parts (parallelism proven); structured beats naive
  baseline on deterministic grounding 5/5,4/5 vs 2/5. Full numbers in
  docs/EVALUATION.md — measured, n=1, variance unknown.
- Comparison endpoint is synchronous-with-cache (first GET ~1–2 min, then 0
  model calls) — chosen over background+poll for simplicity at demo scale.
- Voice input (muse-voice-transcribe-1.0) deliberately not built: no UI surface
  needs it yet; documented as future work, not silently dropped.
- Docs set complete: ARCHITECTURE, API, EVALUATION, SECURITY, DEMO_SCRIPT,
  SUBMISSION. Owner-only items left: record video, take screenshots, portal
  submit (track/rules need portal confirmation).

## Medical pivot (2026-10-27, owner-directed)

- Demo lead is now the **Patient Twin** vertical: fictional patient personas
  (Margaret Alvarez, David Okafor), 3 clinical training templates where the
  twin plays the patient (pre-op consent, post-op triage, difficult consult).
  Professional pack retained as second group. Engine unchanged — templates,
  seeds, and UI only.
- Templates carry `clinical` flag + `anatomy` region tags (canonical REGIONS
  in templates.py, mirrored as 3D anchors). Every clinical context opens with
  TRAINING SIMULATION framing; UI shows an education-only banner.
- 3D body viewer (three.js 0.186, procedural mannequin — no external model,
  zero license risk): lathe torso, capsule limbs, region markers linked to
  scenario tags, orbit/zoom, click-select, legend, reduced-motion support.
  Verified headless in Chrome on the exact bundled code: clean console,
  recognizable figure from front/back/side + phone portrait. Drag/click
  interactions code-reviewed, to be confirmed on first human open.
- Live probe: 3 clinical sims all `done` (~25s each, parallel); twin holds
  patient voice, volunteers the penicillin-allergy constraint unprompted,
  reacts to variables (anxiety, speakerphone daughter).
- Explicitly NOT claimed: real scan ingestion, surgical physics, physiology
  simulation, diagnosis, or surgical planning. Those are the north star;
  training encounters are the credible today.

## Twin Council pivot (2026-10-27, owner-directed)

- Demo lead is now **Twin Council + Twin Secretary**: the twin as a replica of
  the user that (a) debates decisions from three parallel lenses (Strategist /
  Skeptic / Counselor) and (b) handles calls and calendar like the user would.
- Clean replacement: clinical templates, patient seeds, REGIONS/anatomy schema,
  and the three.js body viewer removed (all preserved in git history). New
  seeds are everyday personas (Maya Chen, Leo Park). Engine, eval, and UI
  shell unchanged — templates, seeds, and pages only.
- Live probe: 3 council lenses on a real question all `done` (~15–25s each,
  parallel), genuinely differentiated (action vs risk vs values) and grounded
  in the twin's facts.
- Explicitly out of scope (platform physics, stated in pitch): answering
  third-party video calls with a photoreal avatar, real-time voice dialogue,
  auto-posting to socials. Demoed: the brain at full power; photoreal
  stand-in is the north star only a platform owner can unlock.

## Talking verdicts: open-source local pipeline (2026-10-27, owner-directed)

- Owner asked for the twin's cloned face + voice, then required open-source
  only (plus Meta products) to avoid license issues. A same-day proprietary
  API approach (HeyGen/D-ID) was prototyped but never committed — replaced
  before commit by a fully local pipeline.
- Voice: MeloTTS base speech (MIT) + OpenVoice V2 tone conversion (MIT).
  Video: animated portrait via imageio-ffmpeg (MIT) on any machine, or
  MuseTalk lip-sync (MIT code, weights free incl. commercial) on CUDA GPUs.
- Deliberately rejected after license research: F5-TTS (CC-BY-NC weights),
  XTTS (custom CPML), Wav2Lip (no license file upstream), paid cloning APIs.
- Privacy consequence: likeness (photo + voice) uploads via UI, stays under
  `data/avatars/likeness/`, self-consent checkbox required, one-click delete.
  No biometric data ever leaves the machine — stronger story than API dubbing.
- Honest tiering: CPU boxes get portrait + cloned voice in minutes; true
  lip-sync is GPU-only and the UI/player always labels which mode rendered.

## Correction: hosted voice API added then removed (2026-10-28)

- During a voice-quality push ("make it like the ElevenLabs catalogue"), an
  optional, off-by-default ElevenLabs integration was coded (catalogue +
  speak endpoint behind `ELEVENLABS_API_KEY`, never configured, never used
  with real data). This contradicted the standing project rule above
  (owner-directed open-source + Meta only, proprietary cloning APIs
  deliberately rejected) and risked hackathon eligibility/spirit.
- Caught by the owner, fully removed the same day (commit `a6f2cde`); the
  catalogue-grade need is met by Kokoro (Apache 2.0) + OpenVoice clones.
- Process fix, now in CLAUDE.md: any new external AI service must be checked
  against this log and the hackathon rule first. It was never pushed to the
  shared remote while present (local commits only) and HEAD is clean.
