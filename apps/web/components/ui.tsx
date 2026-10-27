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
    <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] px-6 py-5">{children}</div>
  );
}

const badgeTones: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20",
  red: "bg-red-500/10 text-red-300 ring-1 ring-red-500/20",
  slate: "bg-white/5 text-zinc-300 ring-1 ring-white/10",
  iris: "bg-white/10 text-white ring-1 ring-white/10",
};

export function Badge({ tone = "slate", children }: { tone?: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Meter({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white"
          style={{ width: `${(Math.min(value, max) / max) * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs font-semibold text-zinc-300">
        {value}/{max}
      </span>
    </div>
  );
}

const bannerTones: Record<string, string> = {
  red: "border-red-500/20 bg-red-500/10 text-red-200",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  neutral: "border-white/10 bg-white/5 text-zinc-300",
};

export function Banner({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return (
    <p className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${bannerTones[tone]}`}>
      {children}
    </p>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
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
  "rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50";
const pillGhost =
  "rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 disabled:opacity-50";

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
    <a href={href} className={pillGhost}>
      {children}
    </a>
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
        const h = 6 + 26 * Math.abs(Math.sin(i * 1.35) * Math.cos(i * 0.5));
        return (
          <span
            key={i}
            className={`w-[3px] shrink-0 rounded-full bg-current ${
              animated ? "eq-bar" : "opacity-40"
            }`}
            style={{ height: `${h}px`, animationDelay: `${(i % 12) * 0.09}s` }}
          />
        );
      })}
    </div>
  );
}
