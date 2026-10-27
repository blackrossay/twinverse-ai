"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createImage, deleteTwin, getTwin, listRuns, listVersions, twinImageUrl, type SimulationRun, type TwinDetail } from "@/lib/api";
import { Badge, Banner, Section, Skeleton, statusTone } from "@/components/ui";

export default function TwinPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-10"><Skeleton /></main>}>
      <TwinView />
    </Suspense>
  );
}

function TwinView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [twin, setTwin] = useState<TwinDetail | null>(null);
  const [versions, setVersions] = useState<number[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [imgCb, setImgCb] = useState(0);
  const [imgShown, setImgShown] = useState(true);
  const [imgBusy, setImgBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTwin(id, version), listVersions(id), listRuns(id)])
      .then(([t, v, r]) => {
        if (cancelled) return;
        setTwin(t);
        setVersions(v);
        setRuns(r);
        setError("");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load twin");
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  async function generateCard() {
    setImgBusy(true);
    try {
      await createImage(id);
      setImgCb((v) => v + 1);
      setImgShown(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card generation failed");
    } finally {
      setImgBusy(false);
    }
  }

  async function remove() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteTwin(id);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setConfirmingDelete(false);
    }
  }

  if (error && !twin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="text-sm font-bold text-iris-soft">← Overview</Link>
        <div className="mt-6">
          <Banner tone="red">{error}</Banner>
        </div>
      </main>
    );
  }
  if (!twin)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton lines={6} />
      </main>
    );

  const p = twin.payload;
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm font-bold text-iris-soft hover:text-mist">
        ← Overview
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">{twin.name}</h1>
            <Badge tone="iris">
              {twin.profile_type}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-faint">
            viewing v{twin.version} of v{twin.current_version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={version ?? twin.current_version}
            onChange={(e) => setVersion(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-edge bg-panel px-3 text-sm font-semibold"
            aria-label="Identity version"
          >
            {versions.map((v) => (
              <option key={v} value={v}>v{v}</option>
            ))}
          </select>
          <button
            onClick={remove}
            onBlur={() => setConfirmingDelete(false)}
            className="inline-flex min-h-11 items-center rounded-full border border-red-500/30 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
          >
            {confirmingDelete ? `Confirm delete ${twin.name}?` : "Delete"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      <div className="mt-6 flex items-start gap-5 rounded-2xl border border-white/10 bg-panel p-5">
        {imgShown && (
          <Image
            src={twinImageUrl(twin.id, imgCb)}
            alt={`Identity card for ${twin.name}`}
            width={112}
            height={112}
            unoptimized
            onError={() => setImgShown(false)}
            className="h-28 w-28 shrink-0 rounded-xl border border-edge object-cover"
          />
        )}
        <div className="min-w-0">
          {p.bio && <p className="text-[15px] leading-relaxed text-dim">{p.bio}</p>}
          <button
            onClick={generateCard}
            disabled={imgBusy}
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:text-white disabled:opacity-50"
          >
            {imgBusy ? "Generating…" : imgShown ? "Regenerate identity card" : "Generate identity card"}
          </button>
          <Link
            href={`/talk?twin=${twin.id}`}
            className="ml-2 mt-3 inline-flex min-h-11 items-center rounded-full bg-white px-4 text-xs font-semibold text-black transition hover:bg-zinc-200"
          >
            Talk to {twin.name}
          </Link>
        </div>
      </div>

      <Section title={`Verified facts (${p.verified_facts.length})`}>
        <ul className="space-y-2">
          {p.verified_facts.map((f) => (
            <li key={f.id} className="rounded-2xl border border-white/10 bg-panel px-4 py-3 text-sm text-zinc-200">
              {f.statement}
              <span className="ml-2 text-xs text-faint">· {f.category}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Skills · Goals · Constraints">
        <div className="flex flex-wrap gap-2 text-sm">
          {p.skills.map((s) => (
            <span key={s} className="rounded-full bg-panel2 px-3 py-1 font-semibold">{s}</span>
          ))}
          {p.goals.map((g) => (
            <span key={g} className="rounded-full bg-emerald-950 px-3 py-1 font-semibold text-emerald-300">{g}</span>
          ))}
          {p.constraints.map((c) => (
            <span key={c} className="rounded-full bg-amber-950 px-3 py-1 font-semibold text-amber-300">{c}</span>
          ))}
        </div>
      </Section>

      <Section title={`Behavioral hypotheses — inferred, not verified (${p.behavioral_hypotheses.length})`}>
        <ul className="space-y-2">
          {p.behavioral_hypotheses.map((h) => (
            <li key={h.id} className="rounded-2xl border border-dashed border-white/15 bg-panel px-4 py-3 text-sm text-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <span>{h.statement}</span>
                <span className="shrink-0 font-mono text-xs font-bold text-iris-soft">
                  {(h.confidence * 100).toFixed(0)}%
                </span>
              </div>
              {h.basis && <p className="mt-1 text-xs text-faint">{h.basis}</p>}
            </li>
          ))}
        </ul>
      </Section>

      {Object.keys(p.communication_style).length > 0 && (
        <Section title="Communication style">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(p.communication_style).map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-panel px-4 py-2.5">
                <dt className="text-xs text-faint">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Provenance">
        <ul className="space-y-1 text-xs text-faint">
          {p.provenance.map((e, i) => (
            <li key={i}>
              {e.field} · {e.source}
              {e.detail ? ` · ${e.detail}` : ""} · {new Date(e.at).toLocaleString()}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Sessions (${runs.length})`}>
        {runs.length === 0 ? (
          <p className="text-sm text-dim">
            No sessions yet.{" "}
            <Link href="/sims/new" className="font-bold text-iris-soft">Launch one</Link>.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/sims/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-2.5 text-sm transition hover:border-white/30"
                >
                  <span className="font-mono text-xs">{r.id}</span>
                  <span className="flex items-center gap-2 text-xs text-dim">
                    {r.scenarios.length} task{r.scenarios.length === 1 ? "" : "s"}
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
