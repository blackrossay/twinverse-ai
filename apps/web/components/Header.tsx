"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getHealth, resetDemo, type Health } from "@/lib/api";
import { anime, springs } from "@/lib/motion";

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="markGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FF88" />
          <stop offset="100%" stopColor="#D6FF57" />
        </linearGradient>
      </defs>
      <rect x="2" y="7" width="4" height="14" rx="2" fill="url(#markGrad)" />
      <rect x="9" y="3" width="4" height="22" rx="2" fill="#FAF9F6" opacity="0.95" />
      <rect x="16" y="9" width="4" height="12" rx="2" fill="#FAF9F6" opacity="0.7" />
      <rect x="23" y="5" width="1.5" height="4" rx="0.75" fill="#B18CFF" />
    </svg>
  );
}

function HealthBadge() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const path = usePathname();

  useEffect(() => {
    let stop = false;
    getHealth()
      .then((h) => {
        if (!stop) {
          setHealth(h);
          setOffline(false);
        }
      })
      .catch(() => {
        if (!stop) setOffline(true);
      });
    return () => {
      stop = true;
    };
  }, [path]);

  if (offline)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3.5 py-1.5 text-[11px] font-bold text-red-300 ring-1 ring-red-500/20">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> api offline
      </span>
    );
  if (!health) return (
    <span className="h-6 w-20 animate-pulse rounded-full bg-white/5" />
  );
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold ring-1 transition ${
        health.model_mode === "live"
          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-300 ring-amber-500/20"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      {health.model_mode === "live" ? `live · ${health.model}` : "fixture mode"}
    </span>
  );
}

const NAV = [
  { href: "/", label: "Overview", emoji: "◍" },
  { href: "/council", label: "Council", emoji: "◑" },
  { href: "/talk", label: "Talk", emoji: "◐" },
  { href: "/live", label: "Live", emoji: "●" },
  { href: "/clone", label: "Clone", emoji: "◉" },
  { href: "/sims/new", label: "New session", emoji: "⟡" },
  { href: "/twins/new", label: "New twin", emoji: "+" },
];

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Animate indicator to active tab
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await anime();
        if (!mod || cancelled) return;
        const { animate, spring } = mod;
        const active = navRef.current?.querySelector(`a[href="${path}"]`) as HTMLElement | null;
        const indicator = indicatorRef.current;
        if (!active || !indicator || !navRef.current) return;
        const navRect = navRef.current.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const x = activeRect.left - navRect.left;
        animate(indicator, {
          x,
          width: activeRect.width,
          opacity: 1,
          duration: 600,
          ease: spring(springs.movement),
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [path]);

  // Initial mount - show indicator
  useEffect(() => {
    const init = () => {
      const active = navRef.current?.querySelector(`a[href="${path}"]`) as HTMLElement | null;
      const indicator = indicatorRef.current;
      if (!active || !indicator || !navRef.current) return;
      const navRect = navRef.current.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      indicator.style.transform = `translateX(${activeRect.left - navRect.left}px)`;
      indicator.style.width = `${activeRect.width}px`;
      indicator.style.opacity = "1";
    };
    requestAnimationFrame(init);
    window.addEventListener("resize", init);
    return () => window.removeEventListener("resize", init);
  }, [path]);

  // Magnetic effect on header actions
  useEffect(() => {
    let cleanup: (()=>void) | undefined;
    (async () => {
      try {
        const mod = await anime();
        if (!mod) return;
        const { animate, spring } = mod;
        const mags = document.querySelectorAll<HTMLElement>(".magnetic");
        const handlers: (()=>void)[] = [];
        mags.forEach(el => {
          const onMove = (e: MouseEvent) => {
            const r = el.getBoundingClientRect();
            const x = e.clientX - r.left - r.width/2;
            const y = e.clientY - r.top - r.height/2;
            animate(el, { x: x*0.18, y: y*0.22, duration: 420, ease: spring(springs.pop) });
          };
          const onLeave = () => animate(el, { x: 0, y:0, duration: 700, ease: spring(springs.drawer) });
          el.addEventListener("mousemove", onMove);
          el.addEventListener("mouseleave", onLeave);
          handlers.push(() => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); });
        });
        cleanup = () => handlers.forEach(fn=>fn());
      } catch {}
    })();
    return () => cleanup?.();
  }, []);

  return (
    <>
      <div className="scroll-progress" id="scrollProgress" />
      <div className="bg-blobs" aria-hidden>
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl transition-all ${
          scrolled
            ? "border-white/10 bg-black/80 shadow-[0_8px_32px_-16px_rgba(0,0,0,0.8)]"
            : "border-white/[0.06] bg-black/40"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
          <Link
            href="/"
            className="group flex items-center gap-3 magnetic"
            onClick={(e) => {
              // Hidden demo shortcut: triple-tap the logo resets demo data.
              const now = Date.now();
              const taps = (window as unknown as { __logoTaps?: number[] }).__logoTaps ?? [];
              const recent = [...taps.filter((t) => now - t < 1200), now];
              (window as unknown as { __logoTaps?: number[] }).__logoTaps = recent;
              if (recent.length >= 3) {
                e.preventDefault();
                (window as unknown as { __logoTaps?: number[] }).__logoTaps = [];
                if (window.confirm("Reset demo data and reseed personas?")) {
                  resetDemo()
                    .then(() => {
                      router.push("/");
                      router.refresh();
                    })
                    .catch(() => {});
                }
              }
            }}
          >
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-accent/20 to-lime/20 blur-[6px] opacity-0 transition group-hover:opacity-100" />
              <Mark />
            </div>
            <div className="leading-[0.9]">
              <span className="display block text-[18px] font-[400] tracking-[-0.02em] text-white">
                TWINVERSE<span className="italic text-zinc-400">.AI</span>
              </span>
              <span className="mono block text-[9px] uppercase tracking-[0.18em] text-zinc-400">
                  Council · Talk · Live
              </span>
            </div>
          </Link>

          <nav ref={navRef} aria-label="Primary" className="relative hidden items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] p-1 backdrop-blur md:flex">
            <div
              ref={indicatorRef}
              className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_12px_-2px_rgba(255,255,255,0.12)] opacity-0"
              style={{ width: 0 }}
            />
            {NAV.map((n) => {
              const active = path === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`relative z-[1] inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-[500] transition-all ${
                    active
                      ? "text-black"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-[11px] opacity-70">{n.emoji}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link href="/login" className="hidden min-h-11 items-center rounded-full border border-white/15 px-4 text-[13px] font-semibold text-zinc-200 transition hover:border-white/40 hover:text-white sm:inline-flex">
              Account
            </Link>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 md:flex">
              <span className="mono text-[10px] uppercase tracking-wide text-zinc-400">Twins</span>
              <span className="mono text-[11px] font-medium text-zinc-300">Council · Talk · Live</span>
            </div>
            <HealthBadge />
          </div>
        </div>
      </header>
    </>
  );
}
