"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listRuns, listTwins, seedTwins, type SimulationRun, type Twin } from "@/lib/api";
import { Badge, Banner, Section, Skeleton } from "@/components/ui";

function statusTone(s: string) {
  if (s === "done") return "green";
  if (s === "failed") return "red";
  if (s === "partial") return "amber";
  return "slate";
}

export default function Dashboard() {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError("");
      const [t, r] = await Promise.all([listTwins(), listRuns()]);
      setTwins(t);
      setRuns(r.slice(0, 8));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach API");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <main className="mx-auto max-w-5xl px-6 pb-10">
      <div className="relative -mx-6 px-6 pb-8 pt-10">
        <div className="bg-blueprint pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
        <p className="text-sm font-bold text-iris-soft">Twin Council · Twin Secretary</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight">
          Ask once. Hear every side of yourself.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-dim">
          Your twin debates your decision from three angles in parallel — then handles
          your calls and calendar like you would. Every answer scored with evidence.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/council"
            className="rounded-lg bg-iris px-5 py-2.5 text-sm font-bold text-white transition hover:bg-iris-soft hover:text-abyss"
          >
            Ask the council
          </Link>
          <button
            onClick={seed}
            disabled={busy}
            className="rounded-lg border border-edge px-5 py-2.5 text-sm font-bold text-mist transition hover:border-dim disabled:opacity-50"
          >
            {busy ? "Seeding…" : "Seed demo personas"}
          </button>
          <div className="ml-1 flex gap-5 text-sm">
            <span><strong className="text-lg font-extrabold">{twins.length}</strong> <span className="text-dim">twins</span></span>
            <span><strong className="text-lg font-extrabold">{runs.length}</strong> <span className="text-dim">recent runs</span></span>
          </div>
        </div>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      {!loaded ? (
        <div className="mt-10">
          <Skeleton lines={5} />
        </div>
      ) : (
        <>
          <Section
            title={`Twins (${twins.length})`}
            action={
              <Link href="/twins/new" className="text-sm font-bold text-iris-soft hover:text-mist">
                + New twin
              </Link>
            }
          >
            {twins.length === 0 ? (
              <p className="text-sm text-dim">No twins yet — seed the demo personas or create one.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {twins.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/twins/${t.id}`}
                      className="block rounded-xl border border-edge bg-panel px-5 py-4 transition hover:border-iris"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">{t.name}</span>
                        <Badge tone="iris">
                          {t.profile_type} · v{t.current_version}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-faint">
                        updated {new Date(t.updated_at).toLocaleString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Recent simulations (${runs.length})`}>
            {runs.length === 0 ? (
              <p className="text-sm text-dim">
                No simulations yet.{" "}
                <Link href="/sims/new" className="font-bold text-iris-soft">
                  Launch one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/sims/${r.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-panel px-5 py-3 transition hover:border-iris"
                    >
                      <span className="font-mono text-[13px]">{r.id}</span>
                      <span className="flex items-center gap-3 text-xs text-dim">
                        {r.scenarios.length} scenario{r.scenarios.length === 1 ? "" : "s"} · v
                        {r.identity_version}
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </main>
  );
}
