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
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold text-mist">{title}</h2>
        <div className="h-px flex-1 bg-edge" />
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-5 py-4">{children}</div>
  );
}

const badgeTones: Record<string, string> = {
  green: "bg-emerald-950 text-emerald-300",
  amber: "bg-amber-950 text-amber-300",
  red: "bg-red-950 text-red-300",
  slate: "bg-panel2 text-dim",
  iris: "bg-iris/15 text-iris-soft",
};

export function Badge({ tone = "slate", children }: { tone?: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Meter({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-iris"
          style={{ width: `${(Math.min(value, max) / max) * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs font-bold text-mist">
        {value}/{max}
      </span>
    </div>
  );
}

const bannerTones: Record<string, string> = {
  red: "border-red-900 bg-red-950/60 text-red-200",
  amber: "border-amber-900 bg-amber-950/60 text-amber-200",
};

export function Banner({ tone = "amber", children }: { tone?: string; children: ReactNode }) {
  return (
    <p className={`rounded-xl border px-4 py-3 text-sm ${bannerTones[tone]}`}>{children}</p>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-panel2" style={{ width: `${95 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-lg bg-iris px-4 py-2 text-sm font-bold text-white transition hover:bg-iris-soft hover:text-abyss disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-edge px-4 py-2 text-sm font-bold text-mist transition hover:border-dim"
    >
      {children}
    </a>
  );
}
