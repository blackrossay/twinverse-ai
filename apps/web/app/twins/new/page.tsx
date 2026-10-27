"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTwin } from "@/lib/api";
import { Banner, PrimaryButton } from "@/components/ui";

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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm font-bold text-iris-soft hover:text-mist">
        ← Overview
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">New twin</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-dim">
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
          <label htmlFor="name" className="text-sm font-bold">
            Name or alias
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Maya Chen"
            className="mt-1.5 w-full rounded-lg border border-edge bg-panel px-3.5 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-iris"
          />
        </div>
        <div>
          <label htmlFor="bio" className="text-sm font-bold">
            Biography
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            required
            rows={6}
            placeholder="Role, history, style, goals — a few sentences is enough."
            className="mt-1.5 w-full rounded-lg border border-edge bg-panel px-3.5 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-iris"
          />
        </div>
        <PrimaryButton disabled={busy}>{busy ? "Extracting identity…" : "Create twin"}</PrimaryButton>
      </form>
    </main>
  );
}
