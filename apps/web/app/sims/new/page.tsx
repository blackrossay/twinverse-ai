"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  launchRun,
  listTemplates,
  listTwins,
  type ScenarioTemplate,
  type Twin,
} from "@/lib/api";

const BodyViewer = dynamic(() => import("@/components/BodyViewer"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
      Loading 3D view…
    </div>
  ),
});

const MEDICAL_DEFAULTS = ["preop-consent", "postop-triage", "difficult-consult"];

export default function NewSimulation() {
  const router = useRouter();
  const [twins, setTwins] = useState<Twin[]>([]);
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [twinId, setTwinId] = useState("");
  const [picked, setPicked] = useState<string[]>(MEDICAL_DEFAULTS);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listTwins(), listTemplates()])
      .then(([t, tm]) => {
        setTwins(t);
        setTemplates(tm);
        if (t.length > 0) {
          const patient = t.find((x) => x.profile_type === "patient");
          setTwinId((patient ?? t[0]).id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, []);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 3)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!twinId || picked.length === 0) {
      setError("Pick a twin and at least one scenario.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const run = await launchRun({
        twin_id: twinId,
        scenarios: picked.map((template_id) => ({ template_id })),
      });
      router.push(`/sims/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
      setBusy(false);
    }
  }

  const pickedTemplates = templates.filter((t) => picked.includes(t.template_id));
  const anyClinical = pickedTemplates.some((t) => t.clinical);
  const regions = pickedTemplates.flatMap((t) => t.anatomy);
  const clinical = templates.filter((t) => t.clinical);
  const professional = templates.filter((t) => !t.clinical);

  function group(title: string, items: ScenarioTemplate[]) {
    if (items.length === 0) return null;
    return (
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        <div className="mt-2 space-y-2">
          {items.map((t) => (
            <label
              key={t.template_id}
              className="block cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm hover:border-violet-500"
            >
              <input
                type="checkbox"
                checked={picked.includes(t.template_id)}
                onChange={() => toggle(t.template_id)}
                className="mr-3 accent-violet-600"
              />
              <span className="font-semibold">{t.title}</span>
              <span className="block pl-6 pt-1 text-xs text-slate-400">{t.objective}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">New simulation</h1>
      <p className="mt-1 text-sm text-slate-300">
        One identity snapshot runs through each scenario in isolation. Up to 3 per run.
      </p>

      {anyClinical && (
        <p className="mt-4 rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 text-xs text-amber-200">
          Training simulation for clinical education only — not medical advice. The twin plays
          the patient; the figure below is illustrative, not patient anatomy.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="twin" className="text-sm font-semibold">Twin</label>
          <select
            id="twin"
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
          >
            {twins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.profile_type}, v{t.current_version})
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Scenarios</legend>
          {group("Patient training", clinical)}
          {group("Professional", professional)}
        </fieldset>

        {regions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold">Linked regions</h2>
            <div className="mt-2">
              <BodyViewer highlights={regions} height={320} />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Launching…" : `Launch ${picked.length} scenario${picked.length === 1 ? "" : "s"}`}
        </button>
      </form>
    </main>
  );
}
