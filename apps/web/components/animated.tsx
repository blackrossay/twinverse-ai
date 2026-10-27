"use client";
import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { anime, springs } from "@/lib/motion";

/* Animated primitives (spring motion) */

export function StaggerText({
  text,
  className = "",
  as = "h2",
}: {
  text: string;
  className?: string;
  as?: ElementType;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    (async () => {
      const mod = await anime();
      if (!mod) return;
      const { animate, stagger } = mod;
      const chars = ref.current?.querySelectorAll(".char");
      if (!chars) return;
      animate(chars, {
        y: [{ from: "110%" }, { to: "0%" }],
        opacity: [{ from: 0 }, { to: 1 }],
        duration: 800,
        delay: stagger(24, { start: 100 }),
        ease: "out(4)",
      });
    })();
  }, [text]);
  const Tag = as as "h2";
  return (
    <Tag ref={ref} className={className}>
      {text.split("").map((c, i) => (
        <span key={i} className="char inline-block overflow-hidden">
          <span className="inline-block">{c === " " ? "\u00A0" : c}</span>
        </span>
      ))}
    </Tag>
  );
}

export function BentoCard({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const mod = await anime();
      if (!mod) return;
      const { animate, spring } = mod;
      const el = ref.current;
      if (!el) return;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        animate(el, {
          rotateY: (mx / r.width) * 6,
          rotateX: (my / r.height) * -4,
          x: mx * 0.05,
          y: my * 0.08,
          duration: 500,
          ease: "out(2)",
        });
      };
      const onLeave = () =>
        animate(el, {
          rotateX: 0,
          rotateY: 0,
          x: 0,
          y: 0,
          duration: 800,
          ease: spring(springs.drawer),
        });
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      cleanup = () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      };
    })();
    return () => cleanup?.();
  }, []);
  return (
    <div
      ref={ref}
      className={`bento ${className} ${glow ? "shadow-[0_0_0_1px_rgba(0,255,136,0.18),0_20px_60px_-20px_rgba(0,255,136,0.4)]" : ""}`}
    >
      {children}
    </div>
  );
}

export function Magnetic({
  children,
  strength = 18,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const mod = await anime();
      if (!mod) return;
      const { animate, spring } = mod;
      const el = ref.current;
      if (!el) return;
      const move = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        animate(el, {
          x: x * (strength / 100),
          y: y * (strength / 120),
          duration: 420,
          ease: spring(springs.pop),
        });
      };
      const leave = () =>
        animate(el, {
          x: 0,
          y: 0,
          duration: 700,
          ease: spring(springs.drawer),
        });
      el.addEventListener("mousemove", move);
      el.addEventListener("mouseleave", leave);
      cleanup = () => {
        el.removeEventListener("mousemove", move);
        el.removeEventListener("mouseleave", leave);
      };
    })();
    return () => cleanup?.();
  }, [strength]);
  return (
    <div ref={ref} className={`magnetic will-change-transform ${className}`}>
      {children}
    </div>
  );
}
