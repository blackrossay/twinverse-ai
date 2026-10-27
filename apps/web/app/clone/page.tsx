"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  deleteLikeness,
  getAvatarStatus,
  getInferenceSettings,
  likenessPhotoSrc,
  setInferenceSettings,
  uploadLikeness,
  type AvatarStatus,
  type InferenceSettings,
} from "@/lib/api";
import { BackLink, Banner, Button, GhostButton, Section, Skeleton } from "@/components/ui";

const VOICE_SCRIPT =
  "Hi, this is me. I'm recording this so my twin can speak in my own voice. " +
  "I talk at a natural pace, I pause between thoughts, and I sound like myself on a good day. " +
  "The quick brown fox jumps over the lazy dog. Numbers check: one, two, three, four, five.";

export default function ClonePage() {
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [inference, setInference] = useState<InferenceSettings | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [photoShown, setPhotoShown] = useState(true);
  const [photoCb, setPhotoCb] = useState(0);
  const [provider, setProvider] = useState("local");
  const [infUrl, setInfUrl] = useState("");
  const [infToken, setInfToken] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvatarStatus().then(setStatus).catch(() => setStatus(null));
    getInferenceSettings()
      .then((s) => {
        setInference(s);
        setProvider(s.provider);
        setInfUrl(s.inference_url);
      })
      .catch(() => setInference(null));
  }, []);

  async function upload() {
    if (!photo || !voice) {
      setError("Choose both a photo and a voice sample.");
      return;
    }
    if (!consent) {
      setError("Please confirm this is your own face and voice.");
      return;
    }
    setBusy("upload");
    setError("");
    try {
      setStatus(await uploadLikeness(photo, voice));
      setPhoto(null);
      setVoice(null);
      setConsent(false);
      setPhotoShown(true);
      setPhotoCb((v) => v + 1);
      if (photoRef.current) photoRef.current.value = "";
      if (voiceRef.current) voiceRef.current.value = "";
      setSaved("Your likeness is saved. Your twin can now speak and appear as you.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — check the files and try again");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      setStatus(await deleteLikeness());
      setPhotoShown(false);
      setSaved("Your likeness was deleted — every byte of it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function saveInference(e: React.FormEvent) {
    e.preventDefault();
    setBusy("inference");
    setError("");
    try {
      const next = await setInferenceSettings({
        provider,
        inference_url: infUrl.trim(),
        inference_token: infToken.trim() || undefined,
      });
      setInference(next);
      setInfToken("");
      setStatus(await getAvatarStatus().catch(() => status));
      setSaved(
        next.provider === "http"
          ? "Rendering now runs on your cloud inference service."
          : "Rendering now runs on this machine (best for local demos).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save render settings");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink />
      <h1 className="display mt-4 text-5xl leading-[0.95] text-white">
        Your voice.<br />Your face. Live.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-400">
        Clone your voice and likeness once — your twin speaks verdicts, talks, and goes
        live as you, on every platform at once. Set everything up here; nothing is
        configured outside the app.
      </p>

      {error && <div className="mt-5"><Banner tone="red">{error}</Banner></div>}
      {saved && !error && (
        <div className="mt-5" role="status">
          <Banner tone="amber">{saved}</Banner>
        </div>
      )}

      <Section title="1 · Your face and voice">
        {!status ? (
          <Skeleton lines={3} />
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${status.likeness_present ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" : "bg-white/5 text-zinc-300 ring-white/10"}`}>
                {status.likeness_present ? "Likeness saved" : "No likeness yet"}
              </span>
              <span className="text-zinc-400">
                Voice engine: {status.voice_ready ? "ready" : "not ready"} · Device: {status.device}
                {status.lipsync_ready ? " · Lip-sync ready" : ""}
              </span>
            </div>

            {status.likeness_present && photoShown && (
              <div className="mt-4">
                <Image
                  src={likenessPhotoSrc(photoCb)}
                  alt="Your uploaded likeness photo"
                  width={160}
                  height={160}
                  unoptimized
                  onError={() => setPhotoShown(false)}
                  className="h-40 w-40 rounded-2xl border border-white/10 object-cover"
                />
              </div>
            )}

            {!status.voice_ready && status.missing.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-sm text-amber-200">The render engine still needs:</p>
                <ul className="mt-1.5 space-y-1">
                  {status.missing.map((m) => (
                    <li key={m} className="font-mono text-xs leading-relaxed text-amber-100/80">• {m}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-400">
                  Tip: pick cloud rendering below and none of this needs installing on this machine.
                </p>
              </div>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-bold text-zinc-300">
                Photo — clear, front-facing (jpg/png/webp, ≤10 MB)
                <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="mt-1.5 w-full text-sm text-white file:mr-3 file:min-h-11 file:rounded-full file:border file:border-white/15 file:bg-transparent file:px-4 file:text-xs file:font-bold file:text-white" />
              </label>
              <label className="block text-xs font-bold text-zinc-300">
                Voice — ~30s of clean speech (wav/mp3/m4a, ≤15 MB)
                <input ref={voiceRef} type="file" accept="audio/*"
                  onChange={(e) => setVoice(e.target.files?.[0] ?? null)}
                  className="mt-1.5 w-full text-sm text-white file:mr-3 file:min-h-11 file:rounded-full file:border file:border-white/15 file:bg-transparent file:px-4 file:text-xs file:font-bold file:text-white" />
              </label>
            </div>
            <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-200">What should I read for the voice sample?</summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{VOICE_SCRIPT}</p>
            </details>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-zinc-200">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 accent-white" />
              This is my own face and voice.
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={upload} disabled={busy === "upload"}>
                {busy === "upload" ? "Saving…" : status.likeness_present ? "Replace my likeness" : "Save my likeness"}
              </Button>
              {status.likeness_present && (
                <GhostButton onClick={remove} disabled={busy === "delete"}>
                  {busy === "delete" ? "Deleting…" : "Delete my likeness"}
                </GhostButton>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Your photo and voice stay on the server you control, are only used for your
              twin, and deleting them removes every byte.
            </p>
          </div>
        )}
      </Section>

      <Section title="2 · Where rendering runs">
        {!inference ? (
          <Skeleton lines={3} />
        ) : (
          <form onSubmit={saveInference}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Render location">
              <label className={`cursor-pointer rounded-2xl border px-4 py-3 ${provider === "local" ? "border-white/50 bg-white/5" : "border-white/10 bg-panel"}`}>
                <span className="flex min-h-8 items-center gap-2 text-sm font-semibold text-white">
                  <input type="radio" name="provider" checked={provider === "local"} onChange={() => setProvider("local")} className="accent-white" />
                  This machine
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                  Best for local demos. Needs the open-source voice stack installed here.
                </span>
              </label>
              <label className={`cursor-pointer rounded-2xl border px-4 py-3 ${provider === "http" ? "border-white/50 bg-white/5" : "border-white/10 bg-panel"}`}>
                <span className="flex min-h-8 items-center gap-2 text-sm font-semibold text-white">
                  <input type="radio" name="provider" checked={provider === "http"} onChange={() => setProvider("http")} className="accent-white" />
                  My cloud (recommended)
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                  Your GPU inference service renders everything. Customers and devices
                  install nothing — this is how the product ships.
                </span>
              </label>
            </div>
            {provider === "http" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="infurl" className="text-sm font-semibold text-white">Inference service URL</label>
                  <input id="infurl" value={infUrl} onChange={(e) => setInfUrl(e.target.value)}
                    placeholder="https://inference.yourcloud.example"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
                </div>
                <div>
                  <label htmlFor="inftoken" className="text-sm font-semibold text-white">
                    Service token {inference.token_hint && <span className="text-zinc-400">(saved {inference.token_hint} — leave blank to keep)</span>}
                  </label>
                  <input id="inftoken" type="password" value={infToken} onChange={(e) => setInfToken(e.target.value)}
                    placeholder="Shared secret for your inference service" autoComplete="off"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy === "inference"}>
                {busy === "inference" ? "Saving…" : "Save render location"}
              </Button>
              <span className="text-sm text-zinc-400">
                Status: {inference.ready ? "ready to render" : "not ready yet"}
              </span>
            </div>
          </form>
        )}
      </Section>

      <Section title="3 · Go live destinations">
        <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
          Stream keys are added per stream, right where you publish — open Live Studio,
          start a stream, and paste your YouTube stream key in the Publish panel. Keys
          are stored server-side only and shown back as just the last 4 characters.
        </p>
        <Link href="/live"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-200">
          Open Live Studio
        </Link>
      </Section>
    </main>
  );
}
