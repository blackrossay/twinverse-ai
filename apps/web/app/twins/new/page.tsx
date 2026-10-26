"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTwin } from "@/lib/api";

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
      <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">New twin</h1>
      <p className="mt-1 text-sm text-slate-300">
        The AI reads the bio and extracts a structured identity — verified facts
        stay separate from inferred hypotheses. Takes ~30s on a live model.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm font-semibold">
            Name or alias
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Alex Morgan"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label htmlFor="bio" className="text-sm font-semibold">
            Biography
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            required
            rows={6}
            placeholder="Role, experience, style, goals — a few sentences is enough."
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Extracting identity…" : "Create twin"}
        </button>
      </form>
    </main>
  );
}
