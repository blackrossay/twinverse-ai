"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { launchRun, listTwins, type Twin } from "@/lib/api";
import { Banner, PrimaryButton, Waveform } from "@/components/ui";

const LENSES = ["council-strategist", "council-skeptic", "council-empath"];

const SAMPLES = [
  "Should I quit my stable job to go freelance full-time?",
  "Should I take on a big client that pays well but has a chaotic process?",
  "Should I say yes to extra on-call shifts to get promoted faster?",
];

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white outline-none transition placeholder:text-zinc-600 focus:border-white/40";

export default function Council() {
  const router = useRouter();
  const [twins, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState("");
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState("quick take — 3 reasons + verdict");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTwins()
      .then((t) => {
        setTwins(t);
        if (t.length > 0) setTwinId(t[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load twins"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!twinId || !question.trim()) {
      setError("Pick a twin and ask a question.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const run = await launchRun({
        twin_id: twinId,
        scenarios: LENSES.map((template_id) => ({
          template_id,
          variables: { depth },
          context_override: `The decision on the table: ${question.trim()}`,
        })),
      });
      router.push(`/sims/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-white">
        ← Overview
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">Twin Council</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        Ask one question. Three lenses of your twin — the <strong className="text-zinc-200">Strategist</strong>, the{" "}
        <strong className="text-zinc-200">Skeptic</strong>, and the <strong className="text-zinc-200">Counselor</strong> — answer in
        parallel, then the comparison synthesizes a verdict.
      </p>
      <Waveform bars={36} animated={false} className="mt-5 text-white/20" />

      {error && (
        <div className="mt-4">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="twin" className="text-sm font-semibold text-white">Twin</label>
          <select
            id="twin"
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            className={`${inputCls} [&>option]:bg-zinc-900`}
          >
            {twins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.current_version})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="question" className="text-sm font-semibold text-white">Your question</label>
          <textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            rows={3}
            placeholder="e.g. Should I quit my stable job to go freelance full-time?"
            className={inputCls}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuestion(s)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-white/30 hover:text-white"
              >
                {s.length > 48 ? s.slice(0, 48) + "…" : s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="depth" className="text-sm font-semibold text-white">Depth</label>
          <select
            id="depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className={`${inputCls} [&>option]:bg-zinc-900`}
          >
            <option value="quick take — 3 reasons + verdict">Quick take — 3 reasons + verdict</option>
            <option value="deep dive — steelman the case, then pre-mortem it">Deep dive — steelman + pre-mortem</option>
          </select>
        </div>
        <PrimaryButton disabled={busy}>
          {busy ? "Convening the council…" : "Ask the council"}
        </PrimaryButton>
      </form>
    </main>
  );
}
