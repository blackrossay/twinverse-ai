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
import TalkingVerdictPanel from "@/components/TalkingVerdict";
import { Badge, Banner, Button, Meter, Section, Skeleton, statusTone as tone } from "@/components/ui";

const TERMINAL = ["done", "partial", "failed"];

export default function RunPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-10"><Skeleton /></main>}>
      <RunView />
    </Suspense>
  );
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
    let timer: ReturnType<typeof setTimeout> | undefined;
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
          timer = setTimeout(poll, document.hidden ? 10_000 : 3000);
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
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  async function submitRerun(e: React.FormEvent) {
    e.preventDefault();
    if (!run) return;
    const included = Object.entries(draft).filter(([, v]) => v.include);
    if (included.length === 0) {
      setError("Include at least one task in the rerun.");
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
        <Link href="/" className="text-sm font-bold text-iris-soft">← Overview</Link>
        <div className="mt-6">
          <Banner tone="red">{error}</Banner>
        </div>
      </main>
    );
  }
  if (!run)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton lines={6} />
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm font-bold text-iris-soft hover:text-mist">
        ← Overview
      </Link>
      {run.parent_run_id && (
        <p className="mt-3 text-xs text-dim">
          Rerun of{" "}
          <Link href={`/sims/${run.parent_run_id}`} className="font-mono text-iris-soft">
            {run.parent_run_id}
          </Link>{" "}
          — the original session is preserved unchanged.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Session</h1>
          <p className="mt-1.5 font-mono text-xs text-faint">
            {run.id} · identity v{run.identity_version} · {run.scenarios.length} task
            {run.scenarios.length === 1 ? "" : "s"}
          </p>
        </div>
        <span aria-live="polite">
          <Badge tone={tone(run.status)}>{run.status === "running" ? "running…" : run.status}</Badge>
        </span>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {run.scenarios.map((s) => (
          <article key={s.scenario_id} className="rounded-2xl border border-white/10 bg-panel px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">{s.spec.title}</h2>
              <Badge tone={tone(s.status)}>{s.status === "running" ? "running…" : s.status}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-dim">{s.spec.objective}</p>
            {s.status === "running" && (
              <div className="mt-4">
                <Skeleton lines={3} />
                <p className="mt-2 text-xs text-faint">Working… ~30–90s per task on a live model.</p>
              </div>
            )}
            {s.status === "failed" && (
              <div className="mt-3">
                <Banner tone="red">{s.error}</Banner>
              </div>
            )}
            {s.output && (
              <div className="mt-4 space-y-3 border-t border-edge pt-4 text-sm leading-relaxed">
                <p className="whitespace-pre-wrap">{s.output.response_text}</p>
                {s.output.decisions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-dim">Decisions</h3>
                    <ul className="mt-1.5 space-y-1">
                      {s.output.decisions.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
                          <span>
                            {d.decision}
                            {d.rationale && <span className="text-dim"> — {d.rationale}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.output.assumptions.length > 0 && (
                  <p className="text-xs leading-relaxed text-dim">
                    Assumptions: {s.output.assumptions.join(" · ")}
                  </p>
                )}
                <p className="font-mono text-[11px] text-faint">
                  facts [{s.output.identity_facts_used.join(", ") || "none"}] · {s.model} ·{" "}
                  {(s.latency_ms / 1000).toFixed(1)}s
                </p>
              </div>
            )}
          </article>
        ))}
      </div>

      {evalState === "loading" && (
        <div className="mt-10">
          <Skeleton lines={4} />
          <p className="mt-2 text-xs text-faint">Evaluating against the rubric… (~1–2 min first time, then cached)</p>
        </div>
      )}
      {evalState === "error" && (
        <div className="mt-10">
          <Banner>Comparison unavailable (needs a live model key on the backend).</Banner>
        </div>
      )}
      {comparison && (
        <Section
          title="Comparison"
          action={
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `My Twin Council verdict:\n${comparison.summary}\n— via TWINVERSE AI`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:text-white"
            >
              Share verdict on WhatsApp
            </a>
          }
        >
          <p className="text-[15px] leading-relaxed">{comparison.summary}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {comparison.evaluations.map((e) => {
              const det = comparison.deterministic.find((d) => d.scenario_id === e.scenario_id);
              const title =
                run.scenarios.find((s) => s.scenario_id === e.scenario_id)?.spec.title ??
                e.template_id;
              return (
                <article key={e.scenario_id} className="rounded-2xl border border-white/10 bg-panel px-5 py-4">
                  <h3 className="text-sm font-bold">{title}</h3>
                  {!e.evaluated ? (
                    <p className="mt-2 text-xs text-dim">Not evaluated: {e.skip_reason}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {(
                        [
                          ["Consistency", e.identity_consistency],
                          ["Effectiveness", e.scenario_effectiveness],
                          ["Adaptation", e.adaptation],
                        ] as const
                      ).map(([label, d]) => (
                        <div key={label}>
                          <p className="mb-1 text-xs text-dim">{label} <span className="text-faint">(model est.)</span></p>
                          {d && <Meter value={d.score} />}
                          {d?.notes && <p className="mt-1 text-xs leading-relaxed text-dim">{d.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {det && (
                    <p className="mt-3 border-t border-edge pt-2 text-xs text-faint">
                      Code checks {det.checks_passed}/{det.checks_total}
                      {det.details.some((c) => !c.passed) &&
                        ` · failed: ${det.details.filter((c) => !c.passed).map((c) => c.name).join(", ")}`}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-faint">
            Scores are model-generated estimates under evaluation/v1; code checks are deterministic.
          </p>
        </Section>
      )}

      {comparison && run.status !== "failed" && <TalkingVerdictPanel runId={run.id} />}

      {parent && parentComp && comparison && (
        <Section title={`What changed since ${parent.id}`}>
          <div className="space-y-3">
            {run.scenarios.map((s) => {
              const old = parent.scenarios.find((o) => o.spec.template_id === s.spec.template_id);
              if (!old?.output || !s.output) return null;
              const newEv = comparison.evaluations.find((e) => e.scenario_id === s.scenario_id);
              const oldEv = parentComp.evaluations.find((e) => e.scenario_id === old.scenario_id);
              const varDiff = Object.entries(s.spec.variables).filter(
                ([k, v]) => old.spec.variables[k] !== v,
              );
              const dims = [
                ["consistency", newEv?.identity_consistency?.score, oldEv?.identity_consistency?.score],
                ["effectiveness", newEv?.scenario_effectiveness?.score, oldEv?.scenario_effectiveness?.score],
                ["adaptation", newEv?.adaptation?.score, oldEv?.adaptation?.score],
              ] as const;
              return (
                <article key={s.scenario_id} className="rounded-2xl border border-white/10 bg-panel px-6 py-5 text-sm">
                  <h3 className="font-bold">{s.spec.title}</h3>
                  <p className="mt-1 font-mono text-xs text-dim">
                    {varDiff.length === 0
                      ? "same variables — pure re-sample"
                      : varDiff.map(([k, v]) => `${k}: ${old.spec.variables[k] ?? "∅"} → ${v}`).join(" · ")}
                  </p>
                  {newEv?.evaluated && oldEv?.evaluated && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dims.map(([label, n, o]) => {
                        const d = (n ?? 0) - (o ?? 0);
                        return (
                          <Badge key={label} tone={d > 0 ? "green" : d < 0 ? "red" : "slate"}>
                            {label} {d > 0 ? `+${d}` : d}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-abyss p-3">
                      <h4 className="text-xs font-bold text-faint">Before</h4>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-dim">{old.output.response_text}</p>
                    </div>
                    <div className="rounded-lg bg-abyss p-3">
                      <h4 className="text-xs font-bold text-faint">After</h4>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{s.output.response_text}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {TERMINAL.includes(run.status) && (
        <Section title="Rerun with changes">
          <form onSubmit={submitRerun} className="space-y-3">
            {run.scenarios.map((s) => {
              const d = draft[s.scenario_id] ?? { include: true, variables: { ...s.spec.variables }, objective: "" };
              return (
                <div key={s.scenario_id} className="rounded-2xl border border-white/10 bg-panel px-5 py-4">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [s.scenario_id]: { ...d, include: e.target.checked },
                        }))
                      }
                      className="accent-white"
                    />
                    {s.spec.title}
                  </label>
                  {d.include && (
                    <div className="mt-3 space-y-2.5 pl-6">
                      {Object.entries(d.variables).map(([k, v]) => (
                        <label key={k} className="block text-xs font-bold text-dim">
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
                            className="mt-1 min-h-11 w-full rounded-lg border border-edge bg-abyss px-3 text-sm font-semibold"
                          />
                        </label>
                      ))}
                      <label className="block text-xs font-bold text-dim">
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
                          className="mt-1 min-h-11 w-full rounded-lg border border-edge bg-abyss px-3 text-sm placeholder:text-faint"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <Button type="submit" disabled={rerunBusy}>
              {rerunBusy ? "Rerunning…" : "Rerun selected"}
            </Button>
          </form>
        </Section>
      )}
    </main>
  );
}
