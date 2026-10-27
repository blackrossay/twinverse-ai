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
  Note: an empty `achambok/twinverse-ai` shell was auto-created during setup;
  leave or delete it from the GitHub UI.
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
