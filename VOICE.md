# VOICE.md — voice interaction spec

Voice is the primary input. Typing is the fallback, never the requirement.

## Surfaces
- **Talk**: VoiceOrb is the hero. Tap → listening glow → streaming transcript
  → twin replies out loud (instant TTS, cloned voice when configured).
- **Live Studio**: the persona speaks replies + agenda points; host steers
  with chips/buttons, audience hears the persona.
- **Council**: voice arrives via Talk; council stays form-first for precision.

## Rules
- **Tap-to-talk** everywhere; hands-free not required for MVP. Mic permission
  is asked in context (first orb tap), with a friendly pre-prompt line:
  "Tap and tell your twin what you need — typing works too."
- **Latency:** listening state appears instantly (<100ms), partial transcript
  streams as you speak, thinking state is an orbiting shimmer (never blank),
  speech starts before the full turn renders when cloned audio is pending
  (instant voice first, clone replaces it).
- **Barge-in:** tapping the orb (or Stop) while the twin speaks cancels
  speech immediately (speechSynthesis.cancel + render jobs keep state).
- **Captions:** every spoken response is also captioned (TranscriptCaption) —
  nothing exists only as audio.
- **Errors, spoken plainly:** mic denied → "Mic's off — type instead, or tap
  a suggestion." API/voice failure → replies fall back to text + instant
  voice; fixtures are labeled, never faked as live.
- **Scripted mode** (demo safety): suggestion chips under the orb send exact
  prompts, so the full flow demos deterministically with mic/API down.
