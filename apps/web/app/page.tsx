"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getHealth, listTwins, seedTwins, type Health, type Twin } from "@/lib/api";

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [twins, setTwins] = useState<Twin[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError("");
      const [h, t] = await Promise.all([getHealth(), listTwins()]);
      setHealth(h);
      setTwins(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach API");
    }
  }, []);

  useEffect(() => {
    // Client-side fetch against the local API; empty state renders first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function seed() {
    setBusy(true);
    try {
      const created = await seedTwins();
      if (created.length === 0) setError("Demo personas already exist.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TWINVERSE AI</h1>
          <p className="mt-1 text-sm text-slate-300">
            One identity. Multiple realities. Measurable outcomes.
          </p>
        </div>
        {health && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              health.model_mode === "live"
                ? "bg-emerald-900 text-emerald-200"
                : "bg-amber-900 text-amber-200"
            }`}
          >
            {health.model_mode === "live" ? `● live · ${health.model}` : "○ fixture mode"}
          </span>
        )}
      </header>

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <button
          onClick={seed}
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Seeding…" : "Seed demo personas"}
        </button>
        <Link
          href="/twins/new"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-400"
        >
          New twin
        </Link>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Twins ({twins.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {twins.map((t) => (
          <li key={t.id}>
            <Link
              href={`/twins/${t.id}`}
              className="block rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 hover:border-violet-500"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t.name}</span>
                <span className="text-xs text-slate-400">v{t.current_version}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {t.profile_type} · updated {new Date(t.updated_at).toLocaleString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {twins.length === 0 && !error && (
        <p className="mt-4 text-sm text-slate-400">
          No twins yet — seed the demo personas or create one.
        </p>
      )}
    </main>
  );
}
