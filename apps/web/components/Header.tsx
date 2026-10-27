"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth, type Health } from "@/lib/api";

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <circle cx="9" cy="13" r="7" fill="none" stroke="#7c5cff" strokeWidth="2.4" />
      <circle cx="17" cy="13" r="7" fill="none" stroke="#a48fff" strokeWidth="2.4" opacity="0.65" />
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
      <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-semibold text-red-300">
        api offline
      </span>
    );
  if (!health) return null;
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        health.model_mode === "live"
          ? "bg-emerald-950 text-emerald-300"
          : "bg-amber-950 text-amber-300"
      }`}
    >
      {health.model_mode === "live" ? `live · ${health.model}` : "fixture mode"}
    </span>
  );
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/council", label: "Council" },
  { href: "/sims/new", label: "Simulate" },
  { href: "/twins/new", label: "New twin" },
];

export default function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-abyss/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-extrabold tracking-tight">
            TWINVERSE <span className="text-iris-soft">AI</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                path === n.href ? "bg-panel2 text-mist" : "text-dim hover:text-mist"
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
