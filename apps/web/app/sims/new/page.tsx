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
import { Banner, PrimaryButton, BackLink} from "@/components/ui";

const COUNCIL_DEFAULTS = ["council-strategist", "council-skeptic", "council-empath"];

const GROUP_LABELS: Record<string, string> = {
  council: "Twin Council",
  secretary: "Twin Secretary",
};

export default function NewSimulation() {
  const router = useRouter();
  const [twins, setTwins] = useState<Twin[]>([]);
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [twinId, setTwinId] = useState("");
  const [picked, setPicked] = useState<string[]>(COUNCIL_DEFAULTS);
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
  }, []);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 3)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!twinId || picked.length === 0) {
      setError("Pick a twin and at least one task.");
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

  const groups = [...new Set(templates.map((t) => t.type))];

  function group(type: string, items: ScenarioTemplate[]) {
    if (items.length === 0) return null;
    return (
      <div className="mt-4">
        <div className="flex items-center gap-3">
          <h3 className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            {GROUP_LABELS[type] ?? type}
          </h3>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <div className="mt-3 space-y-2">
          {items.map((t) => (
            <label
              key={t.template_id}
              className={`block cursor-pointer rounded-2xl border px-4 py-3.5 text-sm transition ${
                picked.includes(t.template_id)
                  ? "border-white/50 bg-white/5"
                  : "border-white/10 bg-panel hover:border-white/25"
              }`}
            >
              <input
                type="checkbox"
                checked={picked.includes(t.template_id)}
                onChange={() => toggle(t.template_id)}
                className="mr-3 accent-white"
              />
              <span className="font-semibold text-white">{t.title}</span>
              <span className="block pl-6 pt-1 text-[13px] leading-relaxed text-zinc-400">{t.objective}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <BackLink />
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">New session</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        Your twin takes on up to 3 tasks in parallel — council lenses, calls, or a mix.{" "}
        <Link href="/council" className="font-semibold text-white underline underline-offset-4">
          Or ask the council a question →
        </Link>
      </p>

      {error && (
        <div className="mt-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-6">
        <div>
          <label htmlFor="twin" className="text-sm font-semibold text-white">Twin</label>
          <select
            id="twin"
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            disabled={twins.length === 0}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white outline-none transition focus-visible:shadow-[0_0_0_4px_rgba(250,249,246,0.22)] focus:border-white/40 [&>option]:bg-zinc-900"
          >
            {twins.length === 0 && <option value="">Loading twins…</option>}
            {twins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.profile_type}, v{t.current_version})
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-white">Tasks</legend>
          {groups.map((g) => group(g, templates.filter((t) => t.type === g)))}
        </fieldset>

        <PrimaryButton disabled={busy}>
          {busy ? "Launching…" : `Launch ${picked.length} task${picked.length === 1 ? "" : "s"}`}
        </PrimaryButton>
      </form>
    </main>
  );
}
