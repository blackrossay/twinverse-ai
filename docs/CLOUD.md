# Packaging & cloud deployment — customers never install anything

**Short answer to "do I need to install this on my machine?"**
Only for local development/demo. MeloTTS, OpenVoice, torch, and checkpoints
are **server-side inference dependencies**. A customer on a phone or laptop
installs nothing and downloads no models — they sign up, upload a photo +
voice sample once, and your cloud does the rendering.

The half-finished local install on this dev machine (`.venv-avatar`, Python
3.11 — the Melo/OpenVoice ecosystem does not support 3.13) is a dev
convenience only. Disk is also nearly full, which is another reason not to
run production inference on a laptop.

## Target architecture (what is built now)

```text
Phone (PWA / app stores via Capacitor) ─┐
Browser (desktop web) ──────────────────┼─▶ Twinverse API (Dockerfile.api)
                                        │     - auth: signup/login, bearer tokens
                                        │     - twins, council, talk, live, renders queue
                                        │     - SQLite today; Postgres at scale
                                        │
                                        └─▶ Inference service (Dockerfile.inference)
                                              services/inference/app.py on YOUR GPU cloud
                                              MeloTTS + OpenVoice (+ MuseTalk on CUDA)
                                              POST /v1/voice, /v1/video, token-gated
```

- **Placement is one env var** on the API:
  `TWINVERSE_AVATAR_PROVIDER=local` (dev laptop) or `http` +
  `TWINVERSE_INFERENCE_URL=https://…` + `TWINVERSE_INFERENCE_TOKEN=…`
  (production). Every render path (talking verdicts, Talk replies, Live
  replies) goes through `twinverse/avatar/provider.py`.
- **Inference service** scales independently: CPU workers render cloned
  voice + portrait video; a CUDA worker adds MuseTalk lip-sync. Put a queue
  ( managed or Redis) in front at real scale; today the API calls it
  synchronously per render job from background tasks.
- **Accounts**: `POST /api/auth/signup|login`, `GET /api/auth/me`
  (PBKDF2 passwords, HMAC tokens, stdlib only). Set
  `TWINVERSE_AUTH_REQUIRED=true` + `TWINVERSE_AUTH_SECRET=…` to require a
  bearer token across `/api/*`. The web app already stores/sends the token
  and ships a `/login` page.

## Packaging on devices

- **Phones today:** installable **PWA** — `apps/web/public/manifest.webmanifest`
  + Apple web-app metadata + mobile bottom tab bar. "Add to Home Screen"
  gives an app icon, standalone display, no store review.
- **App stores next:** wrap the same web build with Capacitor (iOS/Android)
  when you need push notifications, store presence, or native mic polish.
  No UI rewrite — the web app is the app.
- **Desktop:** the same responsive web app; an optional Tauri shell later.

## What production still needs (in order)

1. **Per-user tenancy**: add `owner_id` to twins/sessions/likeness and scope
   every query by the token's user (auth foundation already lands users +
   tokens). Encrypt likeness at rest (S3 + KMS), signed download URLs.
2. **Managed data**: Postgres (replace SQLite), object storage for media,
   Redis queue + worker autoscaling for renders and live segments.
3. **Live bridge**: RTMP/WHIP publishing + platform chat APIs per
   docs/LIVE.md; sub-second voice needs GPU segment rendering or a hosted
   streaming provider behind the same provider interface.
4. **Ops**: HTTPS everywhere, secrets in a manager (never env files in git),
   per-user rate limits + spend caps (already bounded per run), render
   metering for pricing.

## Run it

```bash
# API (any host / container)
docker build -f Dockerfile.api -t twinverse-api .
docker run -p 8000:8000 -v twinverse-data:/data \
  -e MODEL_API_KEY=… -e TWINVERSE_AVATAR_PROVIDER=http \
  -e TWINVERSE_INFERENCE_URL=https://inference.example.com \
  -e TWINVERSE_INFERENCE_TOKEN=… -e TWINVERSE_AUTH_REQUIRED=true \
  -e TWINVERSE_AUTH_SECRET=… twinverse-api

# Inference (GPU cloud host)
docker build -f Dockerfile.inference -t twinverse-inference .
docker run --gpus all -p 8100:8100 \
  -v /models:/models -e TWINVERSE_INFERENCE_TOKEN=… twinverse-inference

# Web
cd apps/web && NEXT_PUBLIC_API_URL=https://api.example.com npm run build && npm run start
```
