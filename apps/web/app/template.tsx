"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { anime, springs } from "@/lib/motion";

/** Route transition: every page enters with a spring fade-rise.
 *  Instant (no animation) under prefers-reduced-motion via lib/motion. */
export default function Template({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await anime();
      if (!mod || cancelled || !ref.current) return;
      mod.animate(ref.current, {
        opacity: [{ from: 0 }, { to: 1 }],
        y: [{ from: "10px" }, { to: "0px" }],
        duration: 420,
        ease: mod.spring(springs.movement),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
