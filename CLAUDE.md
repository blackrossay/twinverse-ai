# CLAUDE.md — Twinverse AI working agreements

## Stack
- Web: Next.js 16 (App Router) + React 19 + Tailwind v4, `apps/web`
- API: FastAPI + Pydantic + SQLite, `services/api/twinverse`
- Models: Meta Model API (`muse-spark-1.3`, `muse-image-1.0`) server-side only
- Inference (voice/avatar): provider-based — local open-source stack or cloud
  service (`services/inference`); never required on user devices

## Commands
```bash
./scripts/demo.sh                 # one-command demo (API :8000 + web :3000)
docker compose up --build         # judge stack
.venv/bin/python -m pytest services/api/tests -q   # backend tests (93)
uv tool run ruff check services/api/twinverse      # backend lint
cd apps/web && npx tsc --noEmit && npx eslint . && npm run build
```

## Conventions
- **Hackathon build = Meta + open-source only.** No third-party AI APIs
  (voice, avatar, LLM, image) — regardless of how optional or off-by-default.
  "Like product X" means match its UX quality with our stack, never integrate
  X. Check this rule + docs/DECISIONS.md before adding any external AI service.
- All model calls server-side; browsers never see `MODEL_API_KEY`.
- Verified facts and inferred hypotheses are separate types end-to-end.
- Fixture (keyless) output is always labeled, never presented as live.
- Stream keys/secrets: server-side only, API returns last-4 hints only.
- Design tokens only (`globals.css` @theme + `lib/motion.ts` springs);
  no raw hex in components, no package/tool branding in user-facing copy.
- WCAG AA: ≥44px targets, ≥4.5:1 text contrast, aria-live for async states,
  motion honors prefers-reduced-motion and cancels on unmount.
- Run the API from the repo root (`.env` + `data/` resolve there).

## Layout
- `apps/web/app` routes: `/` overview, `/council`, `/sims`, `/talk`, `/live`, `/clone`, `/login`, `/twins`
- `services/api/twinverse`: identity, simulation, evaluation, conversation, live, avatar, auth, routes
- Prompts are versioned: `services/api/twinverse/prompts/v1/`
