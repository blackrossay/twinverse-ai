"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { anime, springs } from "@/lib/motion";
import { GlassCard } from "@/components/voice";

/**
 * Landing "How it works" showcase: three product moments interchange
 * automatically (create → deliberate/talk → go live) with spring crossfades.
 * Pauses on hover/focus, fully manual with reduced motion.
 */
const STEPS = [
  {
    id: "create",
    kicker: "Step 1 · Create",
    title: "Write a bio. Get a persona.",
    body: "Your words become a versioned identity — verified facts kept visibly separate from confidence-scored inferences.",
    cta: { href: "/twins/new", label: "Create your twin" },
    accent: "linear-gradient(135deg,#8B5CF6,#EC4899)",
  },
  {
    id: "talk",
    kicker: "Step 2 · Deliberate & talk",
    title: "Ask once. Hear every side.",
    body: "Three lenses of you debate the decision with evidence scores — then keep talking, out loud, in your own voice.",
    cta: { href: "/talk", label: "Talk to a twin" },
    accent: "linear-gradient(135deg,#22D3EE,#3B82F6)",
  },
  {
    id: "live",
    kicker: "Step 3 · Go live",
    title: "Your voice. Your face. Live.",
    body: "Your persona takes the stage with discussion points queued, answering live chat as you — on every platform at once.",
    cta: { href: "/live?demo=1", label: "Watch it live" },
    accent: "linear-gradient(135deg,#34D399,#14B8A6)",
  },
] as const;

function Panel({ step }: { step: (typeof STEPS)[number] }) {
  if (step.id === "create") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">You write</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-200">
            “Freelance designer in Berlin. Two retainers, no meetings before 10am,
            saving to open a studio…”
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Your persona</p>
          <div className="mt-2 space-y-1.5 text-xs">
            <p className="rounded-lg bg-white/5 px-2.5 py-1.5 text-zinc-100">✓ Verified · No meetings before 10am</p>
            <p className="rounded-lg bg-white/5 px-2.5 py-1.5 text-zinc-100">✓ Verified · Goal: open a studio</p>
            <p className="rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-zinc-400">~ Inferred (72%) · Protects mornings fiercely</p>
          </div>
        </div>
      </div>
    );
  }
  if (step.id === "talk") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Strategist", "Take it. Upside compounds.", "4/5"],
            ["Skeptic", "Price the downside first.", "3/5"],
            ["Counselor", "What does it cost your weekends?", "4/5"],
          ].map(([name, line, score]) => (
            <div key={name} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs font-bold text-white">{name}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{line}</p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white" style={{ width: score === "4/5" ? "80%" : "60%" }} />
              </div>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">evidence {score}</p>
            </div>
          ))}
        </div>
        <p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-200">
          🎙 “Okay — I’ll take it, but Fridays stay mine. Draft the reply like I would.”
        </p>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold text-red-300 ring-1 ring-red-500/30">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
        </span>
        <span className="text-xs text-zinc-400">YouTube · Twitch · X · TikTok</span>
      </div>
      <div className="mt-3 space-y-2 text-xs">
        <p className="max-w-[85%] rounded-xl bg-white/5 px-3 py-2 text-zinc-200"><b>Sara</b> · ship it or polish more?</p>
        <p className="ml-auto max-w-[85%] rounded-xl bg-white px-3 py-2 font-medium text-black">Ship it, Sara — done beats perfect, then we iterate live together.</p>
        <p className="max-w-[85%] rounded-xl bg-white/5 px-3 py-2 text-zinc-200"><b>Kai</b> · this needs to be a clip 🔥</p>
      </div>
      <p className="mt-3 border-t border-white/10 pt-2.5 text-[11px] text-zinc-400">
        Heads-up next: <span className="text-zinc-200">Live teardown of viewer work</span>
      </p>
    </div>
  );
}

export default function HowItWorks() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];

  const go = useCallback((next: number) => setIndex(((next % STEPS.length) + STEPS.length) % STEPS.length), []);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % STEPS.length), 5200);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await anime();
      if (!mod || cancelled || !panelRef.current) return;
      mod.animate(panelRef.current, {
        opacity: [{ from: 0 }, { to: 1 }],
        y: [{ from: "14px" }, { to: "0px" }],
        scale: [{ from: 0.985 }, { to: 1 }],
        duration: 480,
        ease: mod.spring(springs.movement),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [index]);

  return (
    <section aria-label="How Twinverse works" className="mt-10">
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <GlassCard floating className="overflow-hidden p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display text-[30px] leading-[0.95] text-white">How it works</h2>
            <div className="ml-auto flex gap-1.5" role="tablist" aria-label="How it works steps">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={s.kicker}
                  onClick={() => go(i)}
                  className="grid min-h-11 min-w-11 place-items-center rounded-full"
                >
                  <span
                    className={`h-2 rounded-full transition-all duration-300 ${i === index ? "w-8" : "w-2 bg-white/20"}`}
                    style={i === index ? { background: s.accent } : undefined}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="space-y-2">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => go(i)}
                    aria-current={i === index ? "step" : undefined}
                    className={`block w-full rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ${
                      i === index ? "border-white/25 bg-white/[0.05]" : "border-white/[0.06] hover:border-white/15"
                    }`}
                  >
                    <span className="flex min-h-6 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-300"
                        style={{ background: s.accent, opacity: i === index ? 1 : 0.35, transform: i === index ? "scale(1.25)" : "scale(1)" }}
                      />
                      <span className={`text-sm font-semibold ${i === index ? "text-white" : "text-zinc-400"}`}>{s.kicker}</span>
                    </span>
                    {i === index && (
                      <>
                        <span className="display mt-2 block text-[24px] leading-[0.95] text-white">{s.title}</span>
                        <span className="mt-1.5 block text-[13px] leading-relaxed text-zinc-400">{s.body}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => go(index - 1)} aria-label="Previous step"
                  className="grid min-h-11 min-w-11 place-items-center rounded-full border border-white/15 text-white transition hover:border-white/40">←</button>
                <button onClick={() => go(index + 1)} aria-label="Next step"
                  className="grid min-h-11 min-w-11 place-items-center rounded-full border border-white/15 text-white transition hover:border-white/40">→</button>
                <Link href={step.cta.href}
                  className="ml-1 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200">
                  {step.cta.label} →
                </Link>
              </div>
            </div>
            <div ref={panelRef} role="tabpanel" aria-label={step.title} className="lg:col-span-3">
              <Panel step={step} />
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
