"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { deleteTwin, getTwin, listVersions, type TwinDetail } from "@/lib/api";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function TwinPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-10 text-sm">Loading…</main>}>
      <TwinView />
    </Suspense>
  );
}

function TwinView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [twin, setTwin] = useState<TwinDetail | null>(null);
  const [versions, setVersions] = useState<number[]>([]);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [t, v] = await Promise.all([getTwin(id, version), listVersions(id)]);
      setTwin(t);
      setVersions(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load twin");
    }
  }, [id, version]);

  useEffect(() => {
    // Client-side fetch against the local API; loading state renders first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function remove() {
    if (!confirm(`Delete ${twin?.name} and all its versions?`)) return;
    try {
      await deleteTwin(id);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

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
  if (!twin) return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Loading…</main>;

  const p = twin.payload;
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
        ← Dashboard
      </Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{twin.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {twin.profile_type} · viewing v{twin.version} of v{twin.current_version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={version ?? twin.current_version}
            onChange={(e) => setVersion(Number(e.target.value))}
            className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm"
            aria-label="Identity version"
          >
            {versions.map((v) => (
              <option key={v} value={v}>v{v}</option>
            ))}
          </select>
          <button
            onClick={remove}
            className="rounded-lg border border-red-800 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      </div>

      {p.bio && <p className="mt-4 text-sm text-slate-300">{p.bio}</p>}

      <Section title={`Verified facts (${p.verified_facts.length})`}>
        <ul className="space-y-2">
          {p.verified_facts.map((f) => (
            <li key={f.id} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm">
              {f.statement}
              <span className="ml-2 text-xs text-slate-400">· {f.category}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Skills · Goals · Constraints">
        <div className="flex flex-wrap gap-2 text-sm">
          {p.skills.map((s) => (
            <span key={s} className="rounded-full bg-slate-800 px-3 py-1">{s}</span>
          ))}
          {p.goals.map((g) => (
            <span key={g} className="rounded-full bg-emerald-950 px-3 py-1 text-emerald-200">{g}</span>
          ))}
          {p.constraints.map((c) => (
            <span key={c} className="rounded-full bg-amber-950 px-3 py-1 text-amber-200">{c}</span>
          ))}
        </div>
      </Section>

      <Section title={`Behavioral hypotheses — inferred, not verified (${p.behavioral_hypotheses.length})`}>
        <ul className="space-y-2">
          {p.behavioral_hypotheses.map((h) => (
            <li key={h.id} className="rounded-lg border border-dashed border-slate-600 bg-slate-900 px-4 py-2 text-sm">
              {h.statement}
              <span className="ml-2 text-xs text-slate-400">
                {(h.confidence * 100).toFixed(0)}% · {h.basis}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {Object.keys(p.communication_style).length > 0 && (
        <Section title="Communication style">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(p.communication_style).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-900 px-4 py-2">
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Provenance">
        <ul className="space-y-1 text-xs text-slate-400">
          {p.provenance.map((e, i) => (
            <li key={i}>
              {e.field} · {e.source}
              {e.detail ? ` · ${e.detail}` : ""} · {new Date(e.at).toLocaleString()}
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
