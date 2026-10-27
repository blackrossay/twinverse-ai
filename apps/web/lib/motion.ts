/**
 * Apple-style motion toolkit.
 *
 * Spring presets mapped from UIKit response/damping language to anime.js
 * spring parameters (stiffness/damping/mass):
 * - movement: damping ~1.0 (critically damped) — direct manipulation, panels
 * - drawer:   damping ~0.8 (slight overshoot) — sheets, drawers, menus
 * - pop:      damping ~0.65 — playful emphasis, badges, success pops
 * - gentle:   slow, critically damped — large surfaces, hero elements
 *
 * Every animation in the app must go through `motionAllowed()` so
 * prefers-reduced-motion is honored in JS (CSS alone can't stop anime.js),
 * and callers must cancel returned animations on unmount so motion never
 * locks or leaks past its component's lifetime (interruptibility).
 */

export const springs = {
  movement: { stiffness: 180, damping: 28, mass: 1 },
  drawer: { stiffness: 220, damping: 21, mass: 1 },
  pop: { stiffness: 320, damping: 16, mass: 1 },
  gentle: { stiffness: 120, damping: 22, mass: 1 },
} as const;

export type SpringPreset = keyof typeof springs;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when animated motion is allowed for this user right now. */
export function motionAllowed(): boolean {
  return !prefersReducedMotion();
}

type AnimeModule = typeof import("animejs");

let cached: AnimeModule | null = null;

export async function anime(): Promise<AnimeModule | null> {
  if (!motionAllowed()) return null;
  if (!cached) cached = await import("animejs");
  return cached;
}

export type Cancellable = { cancel: () => void };

/** Registry that cancels a component's animations on unmount. */
export function animationScope() {
  const active = new Set<Cancellable>();
  return {
    track<T extends Cancellable>(animation: T): T {
      active.add(animation);
      return animation;
    },
    cancelAll() {
      active.forEach((a) => {
        try {
          a.cancel();
        } catch {
          /* already finished */
        }
      });
      active.clear();
    },
  };
}
