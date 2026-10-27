# TWINVERSE AI

One identity. Multiple realities. Measurable outcomes.

TWINVERSE AI is a reusable multimodal digital-twin platform. Its **Parallel Reality
Engine** takes one structured, versioned identity snapshot and runs it through
multiple parallel perspectives at once, then compares outcomes with
evidence-backed scores.

Built for the Meta AI Developer Hackathon (Oct 26 – Nov 4, 2026).

> TWINVERSE AI is an independent hackathon project. It is not an official Meta
> product and does not imply Meta endorsement.

## Status

MVP complete, demo lead is **Twin Council + Twin Secretary**: the twin debates
your decisions from three parallel lenses and handles calls/calendar within
your constraints. Evidence-backed comparison, rerun-with-diff, AI identity
cards, Next.js UI — plus **talking verdicts**: your twin speaks results in
your cloned face and voice via a fully local open-source pipeline
(docs/AVATAR.md). And now **Talk to your twin** (`/talk`): a multi-turn
conversational voice agent — speak or type, your twin answers in character
with memory, in your cloned voice and avatar (docs/CONVERSATION.md).
Docs: architecture, API, evaluation (with real benchmark numbers), security,
demo script, submission pack — all in `docs/`.
Repo: <https://github.com/blackrossay/twinverse-ai>.
See [docs/DECISIONS.md](docs/DECISIONS.md) for the decision log.

## For judges — run it in 2 minutes

Everything (backend, frontend, demo data) is in this repo. Pick one:

**Option A — Docker (recommended, zero local installs):**

```bash
docker compose up --build
# → http://localhost:3000  (API on :8000)
```

**Option B — Local script (Python 3.11+ and Node 18+):**

```bash
./scripts/demo.sh
# → http://localhost:3000
```

Then: click **Seed demo personas** → **Ask the council**. Add
`MODEL_API_KEY` to `.env` for live model calls; without a key the app still
boots and demos in clearly labeled offline-fixture mode (fixture output is
never presented as live). The voice/avatar clone stack is optional and
server-side only — enable it later via the in-app **Your Clone** page
(local engine or your cloud inference service); judges do **not** need it
installed to evaluate the core product. Full deployment/infra guide:
[docs/CLOUD.md](docs/CLOUD.md).

## Prerequisites

- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (or `pip`)
- Node.js 18+ (frontend in `apps/web`)
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

Run the web app (second terminal, from the repo root):

```bash
cd apps/web
npm install     # first time only
npm run dev
```

Then open <http://localhost:3000> in your browser. The dashboard shows API
health (live/fixture), your twins, seed data, and the create-twin form.
It talks to the backend at `http://localhost:8000` (override with
`NEXT_PUBLIC_API_URL`).

Run tests:

```bash
pytest services/api/tests
```

Lint/typecheck (also available as `make check`):

```bash
ruff check services/api/twinverse services/api/tests
cd apps/web && npx tsc --noEmit && npx eslint . && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same backend + frontend checks on
every push and pull request. Backend dependencies are locked in
`services/api/uv.lock`.

Live-model tests run only when a key is configured; otherwise they skip
(explicitly reported, never counted as green).

## Layout

- `apps/web` — Next.js + TypeScript + Tailwind frontend
- `services/api` — FastAPI backend: identity, simulation, evaluation, model client, storage
- `services/api/twinverse/prompts/v1` — versioned prompt templates (shipped in the wheel)
- `services/api/tests` — pytest suite (unit + API integration, incl. live-model tests)
- `services/api/benchmarks` — repeatable structured-vs-baseline benchmark (live)
- `docs` — decisions, architecture, API, evaluation, security, demo script, submission

## Key rules

- All model calls are server-side; browsers never see `MODEL_API_KEY`.
- Verified facts and model-inferred hypotheses are stored and displayed separately.
- Fixture (offline) output is always labeled and never presented as live model output.
- Twin perspectives explore possibilities under stated assumptions, never a
  prediction of what a real person would do.
