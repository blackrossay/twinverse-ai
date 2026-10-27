"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth, type Health } from "@/lib/api";

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="1" y="7" width="3" height="8" rx="1.5" fill="#fafafa" />
      <rect x="6" y="3" width="3" height="16" rx="1.5" fill="#fafafa" opacity="0.9" />
      <rect x="11" y="6" width="3" height="10" rx="1.5" fill="#fafafa" opacity="0.7" />
      <rect x="16" y="8" width="3" height="6" rx="1.5" fill="#fafafa" opacity="0.5" />
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [path]);

  if (offline)
    return (
      <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/20">
        api offline
      </span>
    );
  if (!health) return null;
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
        health.model_mode === "live"
          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-300 ring-amber-500/20"
      }`}
    >
      {health.model_mode === "live" ? `live · ${health.model}` : "fixture mode"}
    </span>
  );
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/council", label: "Council" },
  { href: "/sims/new", label: "New session" },
  { href: "/twins/new", label: "New twin" },
];

export default function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-bold tracking-tight text-white">
            TWINVERSE&nbsp;AI
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3.5 py-1.5 font-medium transition ${
                path === n.href ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <HealthBadge />
        </div>
      </div>
    </header>
  );
}
