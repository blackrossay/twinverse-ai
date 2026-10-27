# DESIGN.md — Twinverse design system

Source of truth in code: `apps/web/app/globals.css` (@theme) and
`apps/web/lib/motion.ts` (springs). This doc explains the rules; if it and
the code disagree, fix the code.

## Tokens
- **Color (semantic, dark-only stage product):** abyss `#0A0A0A` canvas,
  panel `#111111`, panel2 `#1A1A1A`, edge `#242424`, mist `#F5F3EF` text,
  dim `#A1A1AA` (7.4:1 on panel), faint `#9C9CA5` (6.9:1), accent `#00FF88`,
  lime `#D6FF57`, violet `#B18CFF`. No raw hex in components — tokens only.
- **Type:** Instrument Serif for display only (brand voice, tight −0.03em);
  Space Grotesk for UI; JetBrains Mono for labels/data. Deviation from
  SF Pro is a deliberate brand decision; body text stays ≥13px, labels are
  never the only carrier of meaning.
- **Spacing:** 4pt base, 8pt rhythm; card padding 16–24px; bento radius
  24px; page max-width 72rem; one idea per tile.
- **Targets:** everything interactive ≥44×44px (`min-h-11`), mobile tab bar
  56px + safe-area inset.
- **Motion:** Apple-mapped springs in `lib/motion.ts` — movement (damping
  ~1.0) for direct manipulation, drawer (~0.8) for surfaces, pop (~0.65)
  for emphasis. CSS transitions 120–380ms tokens only. All anime cancels on
  unmount; everything is off under `prefers-reduced-motion`.

## Component rules
- One **white pill** primary action per screen; everything else ghost.
- Bento cards: border + shadow states only — never a CSS transform
  transition (anime owns transform for 1:1 pointer tracking).
- Badges communicate status with measured-contrast tones; skeleton =
  `role=status`; async regions are `aria-live=polite`; errors explain and
  offer a recovery action; empty states always carry the next step.
- Iconography: minimal geometric glyphs + text labels (never icon-only
  without an accessible name).

## Glowing glass system (voice-first surfaces)
- **Surfaces:** base (solid panel), raised glass (`backdrop-blur` + white/4
  fill), floating glass (stage, orb, teleprompter). 1px inner-light border
  (`inset 0 1px 0 rgba(255,255,255,.08)`), soft depth shadows, ≤3 blur layers
  per screen for 60fps on mid-range phones; GPU transforms only.
- **Glow = state:** idle breathing, listening mic-reactive, thinking orbiting
  shimmer, speaking audio pulse — via `.glow-*` utilities in globals.css.
- **Persona glow tokens:** nova (violet→pink), atlas (cyan→blue), ember
  (orange→red), sage (emerald→teal) as `--glow-<persona>` gradients, applied
  to orb, waveform, stage frame, and switcher highlights.
- **Fallbacks:** `prefers-reduced-transparency` → solid panel, no blur;
  `prefers-reduced-motion` → static glow, no pulse (global CSS already
  kills animation; glass falls back with the media query in globals.css).

## Navigation
Desktop: top pill nav. Mobile: bottom tab bar (Overview, Talk, Live,
Council, New) — every core feature ≤2 taps from launch, first screen is
the product (seeded personas, no onboarding wall).
