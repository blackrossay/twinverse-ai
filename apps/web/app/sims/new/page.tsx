"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  launchRun,
  listTemplates,
  listTwins,
  type ScenarioTemplate,
  type Twin,
} from "@/lib/api";

export default function NewSimulation() {
  const router = useRouter();
  const [twins, setTwins] = useState<Twin[]>([]);
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [twinId, setTwinId] = useState("");
  const [picked, setPicked] = useState<string[]>(["negotiation", "escalation", "leadership"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listTwins(), listTemplates()])
      .then(([t, tm]) => {
        setTwins(t);
        setTemplates(tm);
        if (t.length > 0) setTwinId(t[0].id);
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">New simulation</h1>
      <p className="mt-1 text-sm text-slate-300">
        One identity snapshot runs through each scenario in isolation. Up to 3 per run.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
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
                {t.name} (v{t.current_version})
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Scenarios</legend>
          <div className="mt-2 space-y-2">
            {templates.map((t) => (
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
        </fieldset>
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
