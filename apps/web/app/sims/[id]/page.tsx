"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  getComparison,
  getRun,
  rerunRun,
  type Comparison,
  type SimulationRun,
} from "@/lib/api";

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

type RerunDraft = Record<string, { include: boolean; variables: Record<string, string>; objective: string }>;

function RunView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [parent, setParent] = useState<SimulationRun | null>(null);
  const [parentComp, setParentComp] = useState<Comparison | null>(null);
  const [evalState, setEvalState] = useState<"idle" | "loading" | "error">("idle");
  const [draft, setDraft] = useState<RerunDraft>({});
  const [rerunBusy, setRerunBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await getRun(id);
        if (stop) return;
        setRun(r);
        setDraft((d) => {
          if (Object.keys(d).length > 0) return d;
          const init: RerunDraft = {};
          for (const s of r.scenarios) {
            init[s.scenario_id] = { include: true, variables: { ...s.spec.variables }, objective: "" };
          }
          return init;
        });
        if (!TERMINAL.includes(r.status)) {
          setTimeout(poll, 3000);
        } else {
          if (r.status !== "failed") {
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
          if (r.parent_run_id) {
            try {
              const [p, pc] = await Promise.all([getRun(r.parent_run_id), getComparison(r.parent_run_id)]);
              if (!stop) {
                setParent(p);
                setParentComp(pc);
              }
            } catch {
              /* diff extras are optional */
            }
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

  async function submitRerun(e: React.FormEvent) {
    e.preventDefault();
    if (!run) return;
    const included = Object.entries(draft).filter(([, v]) => v.include);
    if (included.length === 0) {
      setError("Include at least one scenario in the rerun.");
      return;
    }
    setRerunBusy(true);
    setError("");
    try {
      const variables: Record<string, Record<string, string>> = {};
      const objective_overrides: Record<string, string> = {};
      for (const [sid, v] of included) {
        variables[sid] = v.variables;
        if (v.objective.trim()) objective_overrides[sid] = v.objective.trim();
      }
      const child = await rerunRun(run.id, {
        scenario_ids: included.map(([sid]) => sid),
        variables,
        objective_overrides,
      });
      router.push(`/sims/${child.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rerun failed");
      setRerunBusy(false);
    }
  }

  if (error && !run) {
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
      {run.parent_run_id && (
        <p className="mt-2 text-xs text-slate-400">
          Rerun of{" "}
          <Link href={`/sims/${run.parent_run_id}`} className="font-mono text-violet-300">
            {run.parent_run_id}
          </Link>{" "}
          — the parent run is preserved unchanged.
        </p>
      )}
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

      {error && (
        <p className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

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

      {parent && parentComp && comparison && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            What changed since {parent.id}
          </h2>
          <div className="mt-3 space-y-4">
            {run.scenarios.map((s) => {
              const old = parent.scenarios.find((o) => o.spec.template_id === s.spec.template_id);
              if (!old?.output || !s.output) return null;
              const newEv = comparison.evaluations.find((e) => e.scenario_id === s.scenario_id);
              const oldEv = parentComp.evaluations.find((e) => e.scenario_id === old.scenario_id);
              const varDiff = Object.entries(s.spec.variables).filter(
                ([k, v]) => old.spec.variables[k] !== v,
              );
              return (
                <article key={s.scenario_id} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm">
                  <h3 className="font-semibold">{s.spec.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {varDiff.length === 0
                      ? "Same variables — pure re-sample."
                      : varDiff.map(([k, v]) => `${k}: ${old.spec.variables[k] ?? "∅"} → ${v}`).join(" · ")}
                  </p>
                  {newEv?.evaluated && oldEv?.evaluated && (
                    <p className="mt-1 text-xs text-slate-300">
                      Score deltas (new − old): consistency{" "}
                      {(newEv.identity_consistency?.score ?? 0) - (oldEv.identity_consistency?.score ?? 0) > 0
                        ? "+"
                        : ""}
                      {(newEv.identity_consistency?.score ?? 0) - (oldEv.identity_consistency?.score ?? 0)} ·{" "}
                      effectiveness{" "}
                      {(newEv.scenario_effectiveness?.score ?? 0) - (oldEv.scenario_effectiveness?.score ?? 0) > 0
                        ? "+"
                        : ""}
                      {(newEv.scenario_effectiveness?.score ?? 0) - (oldEv.scenario_effectiveness?.score ?? 0)} ·{" "}
                      adaptation{" "}
                      {(newEv.adaptation?.score ?? 0) - (oldEv.adaptation?.score ?? 0) > 0 ? "+" : ""}
                      {(newEv.adaptation?.score ?? 0) - (oldEv.adaptation?.score ?? 0)}
                    </p>
                  )}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400">Before</h4>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{old.output.response_text}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400">After</h4>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{s.output.response_text}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {TERMINAL.includes(run.status) && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Rerun with changes
          </h2>
          <form onSubmit={submitRerun} className="mt-3 space-y-3">
            {run.scenarios.map((s) => {
              const d = draft[s.scenario_id] ?? { include: true, variables: { ...s.spec.variables }, objective: "" };
              return (
                <div key={s.scenario_id} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [s.scenario_id]: { ...d, include: e.target.checked },
                        }))
                      }
                      className="accent-violet-600"
                    />
                    {s.spec.title}
                  </label>
                  {d.include && (
                    <div className="mt-2 space-y-2 pl-6">
                      {Object.entries(d.variables).map(([k, v]) => (
                        <label key={k} className="block text-xs text-slate-400">
                          {k}
                          <input
                            value={v}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [s.scenario_id]: {
                                  ...d,
                                  variables: { ...d.variables, [k]: e.target.value },
                                },
                              }))
                            }
                            className="mt-0.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                          />
                        </label>
                      ))}
                      <label className="block text-xs text-slate-400">
                        Objective override (optional)
                        <input
                          value={d.objective}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [s.scenario_id]: { ...d, objective: e.target.value },
                            }))
                          }
                          placeholder="Leave blank to keep the original objective"
                          className="mt-0.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="submit"
              disabled={rerunBusy}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {rerunBusy ? "Rerunning…" : "Rerun selected"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
