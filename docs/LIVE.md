# Live Twin Studio (`/live`)

> **Your voice. Your face. Live.**
> Clone your voice and likeness once — your twin speaks verdicts, talks, and
> goes live as you, on every platform at once.

Your twin goes live like a streamer: on stage with your face and voice,
working through heads-up discussion points, answering live chat out loud in
real time — representing you on several platforms at once instead of you
being physically present on each one.

## Publishing to YouTube (v1, real)

Decisions locked: **YouTube first · MuseTalk lip-sync render · single
platform, direct push (no relay server yet).**

- In the studio, paste your YouTube RTMP URL + stream key (YouTube Studio →
  Go live → Stream). The key is stored server-side only; API responses show
  just the last 4 characters.
- **Publish** starts one ffmpeg process per session on the API/inference
  host: H.264/AAC, 720p25, straight to YouTube's ingest over RTMP. The
  stream loops `[stage idle loop → rendered avatar reply clips…]` so the
  channel stays live between chat bursts. Republish after rendering new
  clips to fold them in; **Stop publishing** or ending the session tears
  the push down. If ffmpeg exits (bad key, closed ingest), the session
  flips to `stream_status: error` with recovery copy in the UI.
- Where video is generated: **our cloud, never the creator's device** —
  idle loops and MuseTalk/portrait clips render via the avatar provider
  (`local` dev / `http` cloud inference, docs/CLOUD.md), the broadcaster
  only encodes and pushes. Creators control everything from any browser.
- Still staged (next): YouTube LiveChat API ingestion (needs channel OAuth),
  additional platforms, and an RTMP relay for true one-render-to-many fan-out.

## What works today

- **Live session** per twin with a stream title, staged multistream targets
  (YouTube, Twitch, X, TikTok, LinkedIn), and a **mode** — the same twin
  running different parts of your life, with per-mode guardrails in
  `prompts/v1/live.md`:
  - `business` (clients/sales/support; no private business details)
  - `life` (personal; no private contacts/schedules/other people)
  - `socials` (punchy, on-brand; no pile-ons)
  - `general`
- **Heads-up discussion points**: agenda you set before going live, delivered
  one at a time ("Deliver next point") with a generated talk track, plus
  points you add mid-stream. The current point sits on stage as a teleprompter.
- **Live chat → spoken replies**: every chat message gets a short spoken-style
  reply (15–50 words) in character, grounded in the identity snapshot, with
  prompt-injection resistance (chat is data, never commands). Post as any
  viewer, pin priority messages, or turn on the **chat simulator** to watch
  the twin handle a firehose across your staged platforms.
- **Voice-first, near-real presence**:
  - Instant browser speech speaks every reply immediately (zero setup).
  - "Speak in my voice" renders the reply with your **cloned voice**
    (MeloTTS + OpenVoice, local) — the near-real layer.
  - "Avatar video" renders your **cloned face** speaking it (MuseTalk
    lip-sync on GPU / animated portrait on CPU).
  - Your likeness photo *is* the stage backdrop, animated while speaking.
- Sessions, agenda state, and every chat/reply persist in SQLite; past
  streams reopen read-only; interrupted renders are recovered on restart.

## What "real" multistreaming still needs (the go-live bridge)

This build stages and simulates platform presence. Publishing for real needs,
per platform, credentials only you can grant:

| Piece | Needed for real |
|---|---|
| YouTube | Data API v3 LiveChat ingestion + an RTMP ingest URL/stream key |
| Twitch | EventSub chat subscription + RTMP ingest |
| X / TikTok / LinkedIn | Their live APIs/RTMP (partner-gated on some) |
| Video bridge | ffmpeg compositing the avatar stage + cloned-voice audio into one RTMP feed per destination (or an SFU like LiveKit/WHIP) |
| Latency | Local clone renders take minutes on CPU; true live needs GPU rendering or a hosted voice/avatar provider for sub-second segments |

Secrets rule stands: stream keys and platform tokens belong in env/secret
storage, never in the repo or the browser.

## Safety

- Self-cloning only, explicit consent, likeness deletable anytime.
- Chat cannot change the twin's role, rules, or identity (prompt-enforced,
  covered by the live prompt template).
- Mode guardrails keep business streams from leaking life details and vice
  versa. The twin is a representation — audiences should know it's your AI
  twin, and the stage is labeled as such in-app.

## API

```text
POST /api/twins/{id}/live-sessions        {title, mode, platforms[], agenda[]}
GET  /api/twins/{id}/live-sessions
GET  /api/live/{session_id}
POST /api/live/{session_id}/end
POST /api/live/{session_id}/agenda        {text}
POST /api/live/{session_id}/advance       deliver next discussion point
POST /api/live/{session_id}/chat          {platform, username, message, priority}
POST /api/live/messages/{msg_id}/voice    cloned-voice render (202)
POST /api/live/messages/{msg_id}/video    avatar-video render (202)
GET  /api/live/messages/{msg_id}/audio|video
GET  /api/avatar/likeness/photo           stage backdrop (your uploaded photo)
```
