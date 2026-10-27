# TWINVERSE AI — Product Design Spec (filled template)

> Senior product design / UX spec for the mobile-first MVP. Every screen must
> make the twin's purpose obvious to a first-time user — no tutorial needed.

---

## 1. PRODUCT IDENTITY

- **App name:** TWINVERSE AI
- **App type:** AI digital-twin platform (decision council, conversational
  voice agent, live-streaming clone, secretary tasks)
- **One-sentence goal:** "This app lets a busy professional clone their
  identity, voice, and face so their twin can debate decisions, talk, go live,
  and handle routine interactions — measurably, and always under their control."
- **Core problem solved:** "I can't be everywhere. Decisions pile up, messages
  and calls interrupt deep work, and growing an audience means showing up live
  on five platforms at once. I need a version of me that thinks, talks, and
  appears like me — with evidence it's staying in character."

## 2. TARGET USER

- **Persona:** Founders, creators, and senior professionals, 28–45, high
  message/call load, comfortable with AI tools, frustrated by generic chatbots
  that don't know them or drift off-character.
- **Primary use context:** Short bursts between commitments — a 2-minute
  council check before a decision, a live session from the desk, reviewing
  what the twin said afterward. Mobile first, desktop for long sessions.
- **What they do today instead:** Ask a generic chatbot (no memory of them),
  deliberate alone or in group chats, skip platforms they can't show up on,
  let calls and messages pile up unanswered.

## 3. CORE FEATURES (priority order)

1. **Digital Twin Identity** — User writes a short bio (or structured facts)
   → gets a versioned identity card: verified facts kept visibly separate from
   confidence-scored inferred hypotheses. Solves "generic AI doesn't know me,
   and I can't tell what it invented."
2. **Twin Council** — User asks one decision question → three lenses of their
   twin (Strategist, Skeptic, Counselor) answer in parallel, then an
   evidence-scored verdict (0–5, deterministic code checks + model estimates).
   Solves "big decisions deserve more than one gut take, and I need receipts."
3. **Talk (conversational voice agent)** — User speaks or types → the twin
   answers in character, remembers the thread, and replies out loud (instant
   voice, or their cloned voice). Solves "I want to think out loud with a
   version of me that pushes back like me."
4. **Live Twin Studio** — User picks platforms, mode (Business/Life/Socials/
   General), and heads-up discussion points → the clone goes live on stage
   with their face and voice, delivers points, and answers live chat in real
   time. Solves "I can't be physically live on YouTube, Twitch, X, TikTok,
   and LinkedIn at the same time."
5. **Talking Verdicts + Secretary** — User finishes a council/secretary run →
   gets a downloadable video of their clone speaking the verdict, plus
   secretary flows (booking/screening within stated constraints). Solves
   "results I can't share or delegate are results I redo myself."

## 4. SCREENS & NAVIGATION

| # | Screen | Purpose | Key Elements (priority order) | Primary CTA |
|---|--------|---------|--------------|-------------|
| 1 | Overview `/` | Show twins, sessions, and the one next action at a glance | Hero (Ask once. Hear every side.), live twin/session counts, twin bento grid, recent sessions | Ask the council |
| 2 | New Twin `/twins/new` | Create a twin in under a minute | Name field, bio field, plain-language note that facts stay separate from inferences | Create twin |
| 3 | Twin Detail `/twins/[id]` | Show exactly what the twin knows, version by version | Identity card, verified facts, hypotheses (labeled), provenance, sessions | Talk to {name} |
| 4 | Council `/council` | Ask one decision question | Twin picker, question box with examples, depth selector | Ask the council |
| 5 | Session `/sims/[id]` | Watch parallel answers land and read the scored verdict | Per-lens cards with live status, comparison scores, share, talking-verdict panel, rerun-with-changes | Rerun selected |
| 6 | Talk `/talk` | Hold a real conversation with the twin | Voice-mode selector, chat transcript, mic + composer, cloned-voice/avatar reply actions | Send |
| 7 | Live Studio `/live` | Put the clone on stage across platforms | Setup (mode, platforms, agenda), stage with teleprompter point, live chat, deliver-next-point | Go live |
| 8 | New Session `/sims/new` | Launch secretary/council task runs | Twin picker, grouped task checklist (max 3) | Launch tasks |

**Navigation pattern:** Desktop top pill-nav; **mobile bottom tab bar**
(Overview, Talk, Live, Council, New) with labels, thumb-reach, ≥44px targets.
**Max taps to any feature: 2** (tab → screen; tab → screen → primary CTA).

## 5. USER FLOW (first session)

1. App opens → Overview with four seeded demo twins already present. User
   sees "Ask once. Hear every side of yourself." and one white CTA.
2. User taps **Ask the council** → Council screen, demo twin pre-selected,
   example questions as one-tap chips.
3. User taps an example question → taps **Ask the council** → Session screen
   opens immediately with three lens cards in "running" state (skeletons,
   ~30–90s note).
4. Cards flip to done one by one → Comparison appears: verdict summary first,
   then three score cards with evidence and code-check results.
5. User taps **Generate talking verdict** (after optional likeness upload) →
   their clone speaks the verdict on video — the aha moment: "that's me,
   saying what I'd say."
6. Every step gives feedback: live status badges, aria-live updates, score
   meters, and preserved history (rerun never edits the original).

## 6. DATA MODEL (core objects)

| Object | Key Fields | Relationships |
|--------|-----------|---------------|
| Twin | id, name, profile_type, current_version | has many IdentityVersions, Sessions, Conversations, LiveSessions |
| IdentityVersion | version, verified_facts[], skills, goals, constraints, hypotheses[], style, provenance[] | belongs to Twin (immutable) |
| SimulationRun | id, identity_version, status, parent_run_id | belongs to Twin; has many ScenarioResults |
| ScenarioResult | spec, status, output, model, latency_ms | belongs to SimulationRun |
| Comparison | deterministic[], evaluations[], summary | belongs to SimulationRun |
| Conversation / Turn | twin_id, role, text, voice/video status | Twin → Conversations → Turns |
| LiveSession | mode, platforms[], agenda[], status | Twin → LiveSessions → LiveMessages |
| Likeness | photo, voice, consent (local only) | belongs to the user, deletable anytime |

## 7. VISUAL DESIGN DIRECTION

- **Style:** Monochrome editorial voice-lab (ElevenLabs-meets-sitereel):
  pure-black canvas, oversized serif headlines, bento grids, one green accent.
- **Color palette:** abyss `#0A0A0A`, panel `#111111`, paper `#FAF9F6`,
  accent `#00FF88`, lime `#D6FF57`, violet `#B18CFF` — semantic tokens only
  (`--color-*` in `globals.css`), never raw hex in components.
- **Typography:** Instrument Serif (display), Space Grotesk (UI), JetBrains
  Mono (labels/data). Display tight-tracking, UI 13–15px, mono 10–12px labels.
- **Spacing:** 4pt base, 16–24px card padding, 24px bento radius, generous
  whitespace; cognitive load cut by one idea per bento tile.
- **Components:** Bento cards, pill CTAs (white = the one primary action),
  waveform motif, badges with measured-contrast tones.
- **Motion:** Apple-style springs via `lib/motion.ts` (movement damping ~1.0,
  drawer ~0.8, pop ~0.65), 1:1 pointer tracking, cancellable on unmount,
  fully off under `prefers-reduced-motion`.
- **Dark mode:** Dark-only by design (stage/voice-lab product); no light mode.
- **Reference feel:** Linear's clarity, ElevenLabs' voice-lab calm, sitereel's
  editorial confidence.

## 8. USABILITY RULES (non-negotiable, as implemented)

- One primary (white pill) action per screen; everything else ghost/secondary.
- Tap targets ≥44×44px (`min-h-11` across the UI kit and controls).
- Empty states always carry a next step ("No twins yet — seed the demo
  personas or create one."); loading = skeletons/status, never frozen UI.
- Errors explain + recover ("Check the backend is running, then try again" +
  Retry button).
- Primary actions sit in the thumb zone on mobile (bottom tab bar, sticky
  composers).
- Max 3 options per decision (3 lenses, 3 tasks per run, 3 voice modes).
- WCAG AA contrast measured (body grays ≥7:1 on panel), aria-live for chat/
  polling, visible focus rings, labeled controls, screen-reader text for
  icon-only actions.

## 9. ONBOARDING

- **Zero onboarding screens.** The Overview ships with seeded fictional demo
  twins, so the first tap is the real product (Ask the council), not a tour.
- Likeness (face/voice clone) is introduced just-in-time on the Talking
  Verdict and Live/Talk surfaces, with one plain sentence: what to upload,
  that it never leaves this machine, and that it can be deleted anytime.

## 10. EXCLUSIONS (not in MVP)

- No real RTMP/API publishing yet (platform targets staged; bridge in
  docs/LIVE.md) — no YouTube/Twitch/X/TikTok/LinkedIn account connections.
- No phone-call telephony (Twilio/SIP), no push notifications, no social
  auto-posting, no analytics dashboard, no multi-language UI, no light mode.
- No cloning anyone but yourself (consent-gated); no medical/legal/hiring
  advice hardening.

## 11. OUTPUT (deliverables summary)

1. **Feature summary (user stories):** As a founder, I want my twin to debate
   a decision from three angles so I commit with evidence. As a creator, I
   want my clone live on five platforms at once so my audience hears *me*
   everywhere. As a professional, I want to talk to my twin out loud so I can
   rehearse and decide in minutes. As the owner, I want facts and inferences
   separated so I always know what my twin actually knows.
2. **Screen specs:** Section 4 table + per-screen states — default (seeded/
   live data), loading (skeletons + status copy), empty (next-step prompt),
   error (explanation + retry), success (result first, history preserved).
3. **Happy path:** Overview → Ask the council → pick example → Session →
   scored verdict → talking verdict. **Error path:** backend offline → red
   banner with recovery copy + Retry → health badge shows "api offline" until
   it recovers.
4. **Interactions:** Spring entrance staggers (anime.js, cancellable), 1:1
   magnetic/tilt hover on desktop only, waveform speaking indicator, live
   status flips announced via aria-live; haptics N/A on web.
5. **Design system:** Tokens in `globals.css` (@theme colors, ease/duration,
   44px tap token), springs in `lib/motion.ts`, shared kit in
   `components/ui.tsx` (Section, Badge, Meter, Banner, Skeleton, pill buttons).
6. **Edge cases:** (a) No API key → clearly labeled offline-fixture replies,
   never fake "live". (b) A scenario fails → run ends `partial`, others still
   scored. (c) Server restarts mid-stream → renders marked failed with retry.
   (d) Chat tries prompt injection → twin deflects, chat is data not commands.
   (e) No likeness → instant browser voice still works everywhere.
7. **v2 backlog:** Real platform publishing (RTMP + chat APIs) — needs user
   credentials per platform. Sub-second streaming voice (GPU/hosted provider)
   — cost/latency tradeoff. Phone telephony — compliance + carrier setup.
   Team/shared twins — permissions model. Light mode — dark-only is a brand
   choice for now.
