"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getComparison, getRun, type Comparison, type SimulationRun } from "@/lib/api";

const TERMINAL = ["done", "partial", "failed"];

export default function RunPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-10 text-sm">Loading…</main>}>
      <RunView />
    </Suspense>
  );
}

function statusColor(s: string) {
  if (s === "done") return "bg-emerald-900 text-emerald-200";
  if (s === "failed") return "bg-red-900 text-red-200";
  if (s === "partial") return "bg-amber-900 text-amber-200";
  return "bg-slate-700 text-slate-200";
}

function RunView() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [evalState, setEvalState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await getRun(id);
        if (stop) return;
        setRun(r);
        if (!TERMINAL.includes(r.status)) {
          setTimeout(poll, 3000);
        } else if (r.status !== "failed") {
          setEvalState("loading");
          try {
            const c = await getComparison(id);
            if (!stop) {
              setComparison(c);
              setEvalState("idle");
            }
          } catch {
            if (!stop) setEvalState("error");
          }
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Failed to load run");
      }
    }
    poll();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="text-sm text-violet-300">← Dashboard</Link>
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      </main>
    );
  }
  if (!run) return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
        ← Dashboard
      </Link>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulation run</h1>
          <p className="mt-1 text-xs text-slate-400">
            {run.id} · identity v{run.identity_version} · {run.scenarios.length} scenario
            {run.scenarios.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(run.status)}`}>
          {run.status === "running" ? "running…" : run.status}
        </span>
      </div>

      <div className="mt-6 space-y-6">
        {run.scenarios.map((s) => (
          <article key={s.scenario_id} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{s.spec.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(s.status)}`}>
                {s.status === "running" ? "running…" : s.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{s.spec.objective}</p>
            {s.status === "running" && (
              <p className="mt-3 animate-pulse text-sm text-slate-400">
                Simulating… this takes ~30–90s per scenario on a live model.
              </p>
            )}
            {s.status === "failed" && (
              <p className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">{s.error}</p>
            )}
            {s.output && (
              <div className="mt-3 space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{s.output.response_text}</p>
                {s.output.decisions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Decisions</h3>
                    <ul className="mt-1 list-disc pl-5">
                      {s.output.decisions.map((d, i) => (
                        <li key={i}>
                          {d.decision}
                          {d.rationale && <span className="text-slate-400"> — {d.rationale}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.output.assumptions.length > 0 && (
                  <p className="text-xs text-slate-400">
                    Assumptions: {s.output.assumptions.join(" · ")}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  Facts used: {s.output.identity_facts_used.join(", ") || "none"} ·
                  model {s.model} · {(s.latency_ms / 1000).toFixed(1)}s
                </p>
              </div>
            )}
          </article>
        ))}
      </div>

      {evalState === "loading" && (
        <p className="mt-8 animate-pulse text-sm text-slate-400">
          Evaluating outcomes against the rubric… (~1–2 min first time, then cached)
        </p>
      )}
      {evalState === "error" && (
        <p className="mt-8 text-sm text-amber-300">
          Comparison unavailable (needs a live model key on the backend).
        </p>
      )}
      {comparison && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Comparison
          </h2>
          <p className="mt-2 text-sm text-slate-200">{comparison.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {comparison.evaluations.map((e) => {
              const det = comparison.deterministic.find((d) => d.scenario_id === e.scenario_id);
              const title =
                run.scenarios.find((s) => s.scenario_id === e.scenario_id)?.spec.title ??
                e.template_id;
              return (
                <article key={e.scenario_id} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  {!e.evaluated ? (
                    <p className="mt-2 text-xs text-slate-400">Not evaluated: {e.skip_reason}</p>
                  ) : (
                    <dl className="mt-2 space-y-2 text-xs">
                      {(
                        [
                          ["Consistency", e.identity_consistency],
                          ["Effectiveness", e.scenario_effectiveness],
                          ["Adaptation", e.adaptation],
                        ] as const
                      ).map(([label, d]) => (
                        <div key={label}>
                          <dt className="flex justify-between text-slate-400">
                            <span>{label} (model est.)</span>
                            <span className="font-bold text-slate-100">{d?.score}/5</span>
                          </dt>
                          <dd className="mt-0.5 text-slate-300">{d?.notes}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {det && (
                    <p className="mt-2 text-xs text-slate-400">
                      Code checks: {det.checks_passed}/{det.checks_total} ·{" "}
                      {det.details.filter((c) => !c.passed).map((c) => c.name).join(", ") || "all pass"}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Scores are model-generated estimates under evaluation/v1; code checks are deterministic.
          </p>
        </section>
      )}
    </main>
  );
}
