# Architecture

## Overview

TWINVERSE AI is a monorepo with a FastAPI backend and a Next.js frontend.
All model calls happen server-side; the browser only talks to our API.

```
apps/web (Next.js 16, TS, Tailwind) ──fetch──▶ services/api (FastAPI)
                                                   ├─ routes/        HTTP contracts
                                                   ├─ identity/      twins, versions, extraction, seeds, cards
                                                   ├─ simulation/    templates, runner, parallel engine, store
                                                   ├─ evaluation/    deterministic checks, rubric eval, store
                                                   ├─ meta_client/   Meta Model API wrapper (OpenAI SDK)
                                                   ├─ prompts/v1/    versioned prompt templates
                                                   └─ storage: SQLite file (data/twinverse.db), PNG cards (data/cards)
```

## Core flows

**Create twin:** `POST /api/twins` with a bio → identity-extraction prompt
(`prompts/v1/identity_extraction.md`) → `muse-spark-1.3` → JSON validated by
Pydantic (one repair retry) → stored as immutable identity v1. Structured
input skips the model. Facts and hypotheses are separate lists end to end.

**Simulate:** `POST /api/simulations` resolves templates + overrides into
frozen `ScenarioSpec`s, snapshots the identity version, and runs scenarios in
parallel (`asyncio`, semaphore 3, 180s per-scenario timeout) as a background
task. Each scenario renders `prompts/v1/simulation.md` with the snapshot,
calls the model (120s timeout), validates `SimulationOutput` (one repair
retry), and persists independently — one failure never blocks the others.
`GET /api/simulations/{id}` polls status (`running|done|partial|failed`).

**Compare:** `GET /api/simulations/{id}/comparison` (409 while running) runs
deterministic code checks (fact-id grounding, decisions, response length,
variable acknowledgement, contradictions) and one rubric-eval model call per
scenario (`prompts/v1/evaluation.md`, 1–5 on consistency/effectiveness/
adaptation with quoted evidence), plus a summary call. Results are cached in
SQLite; repeat GETs make zero model calls.

**Rerun:** `POST /api/simulations/{id}/rerun` forks selected scenarios with
variable/objective overrides into a child run (`parent_run_id`); the parent
run's rows are never touched (byte-identity covered by tests).

## Key invariants

- Identity versions and run outputs are immutable once written; edits fork.
- Model output is validated before storage; invalid-after-repair surfaces a
  clear 502, never invented values.
- Fixture mode exists for keyless dev only; fixture text is labeled and the
  sim/eval/image paths refuse to run on fixtures.
- Secrets live in env/`.env` (gitignored); the frontend never sees them.
