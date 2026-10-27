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
      <span title="API offline — is the backend running?" aria-label="API offline"
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-2.5 text-xs font-semibold text-red-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
        <span className="hidden sm:inline">Offline</span>
      </span>
    );
  if (!health) return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/20" aria-hidden />;
  const live = health.model_mode === "live";
  return (
    <span
      title={live ? `Live model · ${health.model}` : "Offline fixture mode — add a model key for live output"}
      aria-label={live ? `Live model ${health.model}` : "Offline fixture mode"}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-2.5 text-xs font-semibold ${live ? "text-emerald-300" : "text-amber-300"}`}
    >
      <span className={`h-2 w-2 animate-pulse rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span className="hidden sm:inline">{live ? "Live" : "Fixture"}</span>
    </span>
  );
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/council", label: "Council" },
  { href: "/talk", label: "Talk" },
  { href: "/live", label: "Live" },
];

const MENU = [
  { href: "/twins/new", label: "New twin", hint: "Create a persona from a bio" },
  { href: "/sims/new", label: "New session", hint: "Council or secretary tasks" },
  { href: "/clone", label: "Your Clone", hint: "Voice, face, and render settings" },
  { href: "/login", label: "Account", hint: "Sign in and devices" },
];

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-2.5">
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
            <span className="display text-[19px] leading-none tracking-[-0.02em] text-white">
              TWINVERSE<span className="italic text-zinc-400">.AI</span>
            </span>
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
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <HealthBadge />
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[13px] font-semibold text-black transition hover:bg-zinc-200"
              >
                + New
                <span aria-hidden className={`text-[10px] transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {menuOpen && (
                <div role="menu" aria-label="Create and settings"
                  className="glass-floating absolute right-0 top-[calc(100%+8px)] w-72 rounded-3xl p-2">
                  {MENU.map((m) => (
                    <Link key={m.href} href={m.href} role="menuitem" onClick={() => setMenuOpen(false)}
                      className="block rounded-2xl px-4 py-3 transition hover:bg-white/[0.06]">
                      <span className="block text-sm font-semibold text-white">{m.label}</span>
                      <span className="mt-0.5 block text-xs text-zinc-400">{m.hint}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
