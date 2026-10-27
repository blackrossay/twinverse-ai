"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Overview", icon: "◍" },
  { href: "/talk", label: "Talk", icon: "◐" },
  { href: "/live", label: "Live", icon: "●" },
  { href: "/council", label: "Council", icon: "◑" },
  { href: "/sims/new", label: "New", icon: "⟡" },
];

/** Mobile bottom tab bar: thumb-reach, labelled, >=44px targets (spec §4). */
export default function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                  active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className={`text-base leading-none ${active ? "text-accent" : ""}`} aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
