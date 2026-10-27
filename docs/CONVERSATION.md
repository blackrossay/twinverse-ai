# Talk to your twin (conversational agent)

The `/talk` page is a multi-turn conversational agent built on the same
identity snapshot as the Council — the closest local analogue to a hosted
conversational-AI / voice-agent product, without any hosted voice service.

## Pipeline (per turn)

```text
Mic (browser Web Speech ASR) ─┐
                              ├─▶ POST /api/conversations/{id}/turns
Typing ───────────────────────┘        │
                                       ▼
              Meta muse-spark reply, in character, with memory
              (identity snapshot + last 12 turns, prompts/v1/conversation.md)
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                         ▼
     Instant browser TTS     Cloned-voice audio        Talking-avatar video
     (speechSynthesis,       (MeloTTS + OpenVoice,     (MuseTalk lip-sync on
      zero setup)             local, async)             CUDA / portrait, async)
```

- **Memory**: sessions and every turn are persisted in SQLite
  (`conversations`, `conversation_turns`). Resume any past chat from `/talk`.
- **Grounding**: replies cite only fact ids that exist in the snapshot;
  unknown cited ids are dropped server-side. Offline fixture replies are
  labeled in-band, like everywhere else in the app.
- **Voice modes**: *Instant* speaks immediately with the browser voice;
  *My cloned voice* renders the reply with the local clone (a few minutes on
  CPU) and auto-plays when ready; *Silent* is text-only. Every reply also has
  manual "Speak in my voice" and "Avatar video" buttons.
- **Recovery**: voice/video renders left in flight by a restart are marked
  failed on startup and can be retried from the chat.

## How this compares to ElevenLabs Conversational AI

| Capability | ElevenLabs Agents | TWINVERSE Talk (this build) |
|---|---|---|
| Multi-turn LLM dialogue with context | Yes, streaming | Yes, turn-based (persisted) |
| Speech input (ASR) | Scribe, server-side | Browser Web Speech API |
| Speech output | Hosted TTS, sub-second | Browser TTS instant; cloned voice async (local) |
| Voice clone of a specific person | Hosted instant/pro clones | Local OpenVoice V2 clone (self-consent upload) |
| Human avatar / lip-sync video | Via partners/integrations | Local MuseTalk (GPU) or animated portrait |
| Telephony (Twilio/SIP), 90+ languages | Yes | No — web only, English-first |
| Latency | Sub-second streaming | Seconds (LLM turn) to minutes (local clone render) |
| Data leaves your machine | Yes (cloud) | No — everything local except the Meta LLM call |

Deliberately unchanged safety rules: self-cloning only with explicit consent,
likeness deletable at any time, avatar clips labeled as AI-generated, and twin
replies are possibilities in character — never predictions of a real person.

## API

```text
POST   /api/twins/{id}/conversations            create session
GET    /api/twins/{id}/conversations            list sessions
GET    /api/conversations/{session_id}          session + turns
DELETE /api/conversations/{session_id}
POST   /api/conversations/{session_id}/turns    {message} -> twin Turn (sync LLM)
POST   /api/conversations/turns/{turn_id}/voice queue cloned-voice render (202)
POST   /api/conversations/turns/{turn_id}/video queue avatar-video render (202)
GET    /api/conversations/turns/{turn_id}/audio serve WAV when done
GET    /api/conversations/turns/{turn_id}/video serve MP4 when done
```
