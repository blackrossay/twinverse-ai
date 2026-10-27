"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  deleteLikeness,
  getAvatarStatus,
  getInferenceSettings,
  getVoiceCatalogue,
  speakStudio,
  type VoiceCatalogue,
  likenessPhotoSrc,
  setInferenceSettings,
  uploadLikeness,
  type AvatarStatus,
  type InferenceSettings,
} from "@/lib/api";
import Logo from "@/components/Logo";
import { BackLink, Banner, Button, GhostButton, Section, Skeleton } from "@/components/ui";

const VOICE_SCRIPT =
  "Hi, this is me. I'm recording this so my twin can speak in my own voice. " +
  "I talk at a natural pace, I pause between thoughts, and I sound like myself on a good day. " +
  "The quick brown fox jumps over the lazy dog. Numbers check: one, two, three, four, five.";

export default function ClonePage() {
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [inference, setInference] = useState<InferenceSettings | null>(null);
  const [catalogue, setCatalogue] = useState<VoiceCatalogue | null>(null);
  const [deviceVoices, setDeviceVoices] = useState<SpeechSynthesisVoice[]>([]);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [camOn, setCamOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setError("Camera's off — allow camera access, or upload a reference photo instead.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPhoto(new File([blob], "photo-capture.png", { type: "image/png" }));
      stopCamera();
      setSaved("Photo captured — now record or upload your voice below.");
    }, "image/png");
  }

  function startRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        chunksRef.current = [];
        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => chunksRef.current.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((tr) => tr.stop());
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          setVoice(new File([blob], "voice-recording.webm", { type: blob.type }));
          setRecordedUrl(URL.createObjectURL(blob));
          setRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
        };
        rec.start();
        setRecording(true);
        setRecSeconds(0);
        timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
      })
      .catch(() => setError("Mic's off — allow microphone access, or upload a voice file instead."));
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  useEffect(() => {
    getAvatarStatus().then(setStatus).catch(() => setStatus(null));
    getVoiceCatalogue().then(setCatalogue).catch(() => setCatalogue(null));
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const load = () => setDeviceVoices(window.speechSynthesis.getVoices());
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
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
      <Logo size={40} glow className="mb-5" />
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


            {/* Capture in-app: camera photo + mic recording (no files needed) */}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Use your camera</p>
                {camOn ? (
                  <div className="mt-3">
                    <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full rounded-xl object-cover" />
                    <div className="mt-3 flex gap-2">
                      <Button onClick={capturePhoto}>Capture photo</Button>
                      <GhostButton onClick={stopCamera}>Cancel</GhostButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      Front-facing, good light, look at the lens — this becomes your avatar.
                    </p>
                    <div className="mt-3">
                      <GhostButton onClick={startCamera}>Open camera</GhostButton>
                    </div>
                  </>
                )}
                {photo && <p className="mt-2 text-xs text-emerald-300">Reference photo ready: {photo.name}</p>}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Record your voice</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Read the sample script below for ~30 seconds in your natural voice.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {recording ? (
                    <button onClick={stopRecording}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-400">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Stop · {recSeconds}s
                    </button>
                  ) : (
                    <GhostButton onClick={startRecording}>Start recording</GhostButton>
                  )}
                  {recordedUrl && <audio controls src={recordedUrl} className="h-10 max-w-full" />}
                </div>
                {voice && <p className="mt-2 text-xs text-emerald-300">Voice sample ready: {voice.name}</p>}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-bold text-zinc-300">
                Or upload a reference photo (jpg/png/webp, ≤10 MB)
                <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="mt-1.5 w-full text-sm text-white file:mr-3 file:min-h-11 file:rounded-full file:border file:border-white/15 file:bg-transparent file:px-4 file:text-xs file:font-bold file:text-white" />
              </label>
              <label className="block text-xs font-bold text-zinc-300">
                Or upload a voice file (wav/mp3/m4a/webm, ≤15 MB)
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


      <Section title="3 · Voice catalogue">
        <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
          Hear the options before you commit. Your cloned voice is the star;
          device voices are the instant fallback; a hosted catalogue can be
          switched on server-side for studio-grade realism.
        </p>
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3">
            <span className="text-sm font-semibold text-white">Your cloned voice</span>
            <span className="text-xs text-zinc-300">
              {catalogue?.cloned.ready
                ? "Ready — Talk and Live replies can speak as you."
                : catalogue?.cloned.engine_ready
                  ? "Engine ready — save your likeness above to activate."
                  : "Engine not ready on this server yet."}
            </span>
          </div>
          {deviceVoices.slice(0, 8).map((v) => (
            <div key={v.voiceURI} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{v.name}</span>
              <span className="text-xs text-zinc-400">{v.lang} · device</span>
              <button
                onClick={() => {
                  const u = new SpeechSynthesisUtterance("Hi, I'm one of your instant voices. Your clone will sound like you — I'll hold the fort until it's ready.");
                  u.voice = v;
                  window.speechSynthesis.cancel();
                  window.speechSynthesis.speak(u);
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-white transition hover:border-white/40">
                Preview
              </button>
            </div>
          ))}

          {catalogue?.studio.ready && catalogue.studio.voices.slice(0, 8).map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-400/25 bg-violet-400/5 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{v.name}</span>
              <span className="text-xs text-zinc-400">Kokoro · studio</span>
              <button
                onClick={async () => {
                  try {
                    const blob = await speakStudio("Hi, I'm a studio voice — natural, local, and open source. Your clone will sound like you.", v.id);
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    audio.onended = () => URL.revokeObjectURL(url);
                    await audio.play();
                  } catch {
                    setError("Studio voice preview failed — is the backend running the avatar venv?");
                  }
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-white transition hover:border-white/40">
                Preview
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-sm font-semibold text-white">Hosted catalogue (ElevenLabs-style)</span>
            <span className="text-xs text-zinc-300">
              {catalogue?.elevenlabs.configured
                ? `${catalogue.elevenlabs.voices.length} voices available on this server.`
                : "Optional — set ELEVENLABS_API_KEY on the server to enable studio voices. Your clone never depends on it."}
            </span>
          </div>
        </div>
      </Section>

      <Section title="4 · Go live destinations">
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
