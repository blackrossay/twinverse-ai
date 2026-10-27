"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listRuns, listTwins, seedTwins, twinImageUrl, type SimulationRun, type Twin } from "@/lib/api";
import { Badge, Banner, GhostButton, Section, Skeleton, Waveform } from "@/components/ui";

function TwinAvatar({ id, name }: { id: string; name: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={twinImageUrl(id)}
      alt=""
      width={40}
      height={40}
      unoptimized
      onError={() => setShown(false)}
      className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
    />
  );
}

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
      <div className="relative -mx-6 px-6 pb-10 pt-14 text-center">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Twin Council · Twin Secretary
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
            Ask once. Hear every side of yourself.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
            Your twin debates your decision from three angles in parallel — then handles
            your calls and calendar like you would. Every answer scored with evidence.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/council"
              className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Ask the council
            </Link>
            <GhostButton onClick={seed} disabled={busy}>
              {busy ? "Seeding…" : "Seed demo personas"}
            </GhostButton>
          </div>
          <Waveform bars={56} animated={false} className="mx-auto mt-9 max-w-xl justify-center text-white/25" />
          <div className="mt-4 flex items-center justify-center gap-6 text-sm text-zinc-500">
            <span><strong className="text-base font-semibold text-white">{twins.length}</strong> twins</span>
            <span className="h-4 w-px bg-white/10" aria-hidden />
            <span><strong className="text-base font-semibold text-white">{runs.length}</strong> sessions</span>
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
              <Link href="/twins/new" className="shrink-0 text-sm font-semibold text-zinc-300 hover:text-white">
                + New twin
              </Link>
            }
          >
            {twins.length === 0 ? (
              <p className="text-sm text-zinc-400">No twins yet — seed the demo personas or create one.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {twins.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/twins/${t.id}`}
                      className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[#0c0c0c] px-5 py-4 transition hover:border-white/30"
                    >
                      <TwinAvatar id={t.id} name={t.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold text-white">{t.name}</span>
                          <Badge tone="iris">
                            {t.profile_type} · v{t.current_version}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          updated {new Date(t.updated_at).toLocaleString()}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Recent sessions (${runs.length})`}>
            {runs.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No sessions yet.{" "}
                <Link href="/sims/new" className="font-semibold text-white underline underline-offset-4">
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
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0c0c0c] px-5 py-3 transition hover:border-white/30"
                    >
                      <span className="font-mono text-[13px] text-zinc-200">{r.id}</span>
                      <span className="flex items-center gap-3 text-xs text-zinc-400">
                        {r.scenarios.length} task{r.scenarios.length === 1 ? "" : "s"} · v
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
