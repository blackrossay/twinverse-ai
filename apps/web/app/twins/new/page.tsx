"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTwin } from "@/lib/api";
import { Banner, PrimaryButton, BackLink} from "@/components/ui";

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition focus-visible:shadow-[0_0_0_4px_rgba(250,249,246,0.22)] placeholder:text-zinc-400 focus:border-white/40";

export default function NewTwin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const twin = await createTwin({ name, bio });
      router.push(`/twins/${twin.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <BackLink />
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">New twin</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        The AI reads the bio and extracts a structured identity — verified facts
        stay separate from inferred hypotheses. Takes ~30s on a live model.
      </p>

      {error && (
        <div className="mt-6">
          <Banner tone="red">{error}</Banner>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="name" className="text-sm font-semibold text-white">
            Name or alias
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Maya Chen"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="bio" className="text-sm font-semibold text-white">
            Biography
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            required
            rows={6}
            placeholder="Role, history, style, goals — a few sentences is enough."
            className={inputCls}
          />
        </div>
        <PrimaryButton disabled={busy}>{busy ? "Extracting identity…" : "Create twin"}</PrimaryButton>
      </form>
    </main>
  );
}
