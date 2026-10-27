import Link from "next/link";
import type { ReactNode } from "react";

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-4">
        <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {title}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-panel px-6 py-5">{children}</div>
  );
}

export type Tone = "green" | "amber" | "red" | "slate" | "iris";

const badgeTones: Record<Tone, string> = {
  green: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20",
  red: "bg-red-500/10 text-red-300 ring-1 ring-red-500/20",
  slate: "bg-white/5 text-zinc-300 ring-1 ring-white/10",
  iris: "bg-white/10 text-white ring-1 ring-white/10",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone] ?? badgeTones.slate}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (status === "done") return "green";
  if (status === "failed") return "red";
  if (status === "partial") return "amber";
  return "slate";
}

export function Meter({ value, max = 5 }: { value: number; max?: number }) {
  const clamped = Math.max(0, Math.min(value, max));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="h-full rounded-full bg-white"
          style={{ width: `${(clamped / max) * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs font-semibold text-zinc-300">
        {value}/{max}
      </span>
    </div>
  );
}

const bannerTones = {
  red: "border-red-500/20 bg-red-500/10 text-red-200",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  neutral: "border-white/10 bg-white/5 text-zinc-300",
} as const;

export function Banner({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof bannerTones;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "red" ? "alert" : undefined}
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${bannerTones[tone]}`}
    >
      {children}
    </p>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-white/5"
          style={{ width: `${95 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

const pillPrimary =
  "interactive inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50";
const pillGhost =
  "interactive inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 disabled:opacity-50";

export function PrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={disabled} className={pillPrimary}>
      {children}
    </button>
  );
}

export function Button({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={pillPrimary}>
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={pillGhost}>
      {children}
    </button>
  );
}

export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={pillGhost}>
      {children}
    </Link>
  );
}

export function BackLink({ href = "/", label = "Overview" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="text-sm font-medium text-zinc-400 transition hover:text-white">
      ← {label}
    </Link>
  );
}

/** Decorative voice waveform. Inherits color from the parent's text color. */
export function Waveform({
  bars = 44,
  animated = true,
  className = "",
}: {
  bars?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex h-10 items-center gap-[3px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        // Fixed-precision values: raw floats serialize differently in SSR
        // HTML vs the client DOM, which triggers hydration mismatches.
        const h = (6 + 26 * Math.abs(Math.sin(i * 1.35) * Math.cos(i * 0.5))).toFixed(2);
        const delay = ((i % 12) * 0.09).toFixed(2);
        return (
          <span
            key={i}
            className={`w-[3px] shrink-0 rounded-full bg-current ${
              animated ? "eq-bar" : "opacity-40"
            }`}
            style={{ height: `${h}px`, animationDelay: `${delay}s` }}
          />
        );
      })}
    </div>
  );
}
