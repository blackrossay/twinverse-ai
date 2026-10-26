# TWINVERSE AI

One identity. Multiple realities. Measurable outcomes.

TWINVERSE AI is a reusable multimodal digital-twin platform. Its **Parallel Reality
Engine** takes one structured, versioned identity snapshot and runs it through
multiple isolated AI simulations in parallel, then compares outcomes with
evidence-backed scores.

Built for the Meta AI Developer Hackathon (Oct 26 – Nov 4, 2026).

> TWINVERSE AI is an independent hackathon project. It is not an official Meta
> product and does not imply Meta endorsement.

## Status

D1–D2 in progress: backend skeleton, live Meta Model API client, identity core.
See [docs/DECISIONS.md](docs/DECISIONS.md) for the decision log.

## Prerequisites

- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (or `pip`)
- Node.js 18+ (frontend, lands D2–D3)
- A Meta Model API key ([dashboard → API keys](https://dev.meta.ai/)) for live
  model calls. Without one the API runs in labeled offline-fixture mode.

## Package

From the repo root:

```bash
# Editable install for development (backend + dev tools)
uv venv
uv pip install -e "services/api[dev]"

# Or with plain pip
python3 -m venv .venv && source .venv/bin/activate
pip install -e "services/api[dev]"
```

Build a distributable wheel/sdist (requires `build`):

```bash
uv pip install build
python -m build services/api --outdir dist/
pip install dist/twinverse-*.whl
```

The wheel ships the `twinverse` package including versioned prompt templates
(`twinverse/prompts/v1/`).

## Run

```bash
source .venv/bin/activate          # or: uv run <cmd> without activating
cp .env.example .env               # then set MODEL_API_KEY in .env (gitignored)
uvicorn twinverse.main:app --port 8000
```

Health check:

```bash
curl localhost:8000/api/health
# {"status":"ok","model_mode":"live|fixture", ...}
```

- `model_mode: live` means real Meta Model API calls (`muse-spark-1.3` default).
- `model_mode: fixture` means no key was found; responses are clearly labeled
  `[OFFLINE FIXTURE — not a live model call]` and must never be presented as
  live output. Set `TWINVERSE_FIXTURES=off` to fail loudly instead.
- SQLite data lives at `data/twinverse.db` (gitignored); override with
  `TWINVERSE_DB_PATH`.

Run tests:

```bash
pytest services/api/tests
```

Live-model tests run only when a key is configured; otherwise they skip
(explicitly reported, never counted as green).

## Layout

- `apps/web` — Next.js + TypeScript + Tailwind frontend (scaffold next)
- `services/api` — FastAPI backend: identity, simulation, evaluation, model client, storage
- `services/api/twinverse/prompts/v1` — versioned prompt templates (shipped in the wheel)
- `services/api/tests` — pytest suite (unit + API integration)
- `docs` — decisions, architecture, API, evaluation methodology, demo script

## Key rules

- All model calls are server-side; browsers never see `MODEL_API_KEY`.
- Verified facts and model-inferred hypotheses are stored and displayed separately.
- Fixture (offline) output is always labeled and never presented as live model output.
- Simulated behavior is explored possibilities under stated assumptions, never a
  prediction of what a real person would do.
