# BACKLOG.md — merged overhaul backlog (Agents 1–3)

> The hosted sub-agent runner was unavailable (internal error), so the
> orchestrator executed Agents 1–3 directly and merged findings here.
> Agent 4 implements P0 → P1; Agent 5 validates against DEMO.md.

## Agent 1 — Demo narrative (dilution audit)
- Hero stats + showcase tiles push the 3 core features below the fold.
  **Promote:** Council / Talk / Live as three tappable paths under the hero.
- Talking-verdict "wow" can't land cold in 3 min (needs likeness + render).
  **Promote:** Talk instant voice + Live simulated chat as the 1:30 wow;
  verdict becomes the close when a likeness exists.
- **Demote:** footer duplicate council CTA, stack/inspiration tiles (cut
  already), secretary-first framing. **Cut:** nothing user-facing beyond that.

## Agent 2 — Apple HIG audit
- P0: no focus or contrast blockers remain (fixed in WCAG pass); bento CSS
  transform transition fought anime tilt (fixed — DESIGN.md rule).
- P1: competing white primaries on Overview (hero + footer CTA) — demote
  footer to ghost. Display font is brand, not SF — documented deviation.
- P1: nav glyphs (◍ ◐ ● ◑) are geometric, not SF-Symbol consistent — keep
  with text labels (accessible names present), revisit with an icon set.
- P2: sheet/drawer spring for mobile tab transitions; haptic-like micro
  scale on primary press.

## Agent 3 — UX flow (tap counts, fresh DB)
| Destination | Taps from launch |
|---|---|
| Ask the council | 1 (hero) / 1 (tab) |
| Talk | 1 (tab/nav) |
| Go live setup | 1 (tab/nav) |
| First council answer sent | 3 (Council → chip → Ask) |
- P0: fresh DB shows "No twins yet" — judges must find Seed. **Fix:**
  auto-seed personas once when the twin list is empty.
- P0: no way to reset a polluted demo between judge runs. **Fix:** hidden
  demo reset (footer action → backend wipe + reseed).
- P0: Live wow needs 4 manual steps. **Fix:** homepage "Watch it live"
  card → `/live?demo=1` auto-starts a demo stream with chat simulation on.
- P1: Live setup agenda/platform defaults are good; keep. Session page
  expectation copy already states per-task timing.

## Implementation status
- [x] DEMO.md, DESIGN.md written; hero trio + auto-seed + demo reset +
      live auto-demo implemented by Agent 4 (see git log).
- [ ] Agent 5 pass: headless timed walk of DEMO.md (in BACKLOG after run).
