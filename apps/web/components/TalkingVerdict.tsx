"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  apiBase,
  deleteLikeness,
  getAvatarStatus,
  getTalkingVerdict,
  requestTalkingVerdict,
  uploadLikeness,
  type AvatarStatus,
  type TalkingVerdict,
} from "@/lib/api";
import { Banner, Button, GhostButton, Section, Skeleton, Waveform } from "@/components/ui";

const PENDING = ["queued", "rendering"];

export default function TalkingVerdictPanel({ runId }: { runId: string }) {
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [job, setJob] = useState<TalkingVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let stop = false;
    getAvatarStatus()
      .then(async (s) => {
        if (stop) return;
        setStatus(s);
        if (!s.configured) return;
        try {
          const v = await getTalkingVerdict(runId);
          if (!stop) setJob(v);
        } catch (e) {
          if (stop) return;
          if (!(e instanceof ApiError && e.status === 404)) {
            setError(e instanceof Error ? e.message : "Failed to load talking verdict");
          }
        }
      })
      .catch((e) => {
        if (!stop) setError(e instanceof Error ? e.message : "Failed to load avatar status");
      });
    return () => {
      stop = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!job || !PENDING.includes(job.status)) return;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const v = await getTalkingVerdict(runId);
        if (!stop) setJob(v);
      } catch {
        /* keep last state */
      }
    }, 8000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [job, runId]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      setJob(await requestTalkingVerdict(runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render request failed");
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!photo || !voice) {
      setError("Choose both a photo and a voice sample.");
      return;
    }
    if (!consent) {
      setError("Please confirm this is your own face and voice.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      setStatus(await uploadLikeness(photo, voice));
      setPhoto(null);
      setVoice(null);
      setConsent(false);
      if (photoRef.current) photoRef.current.value = "";
      if (voiceRef.current) voiceRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setError("");
    try {
      setStatus(await deleteLikeness());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Section title="Talking verdict">
      {!status && !error && <Skeleton lines={2} />}
      {error && <Banner tone="red">{error}</Banner>}

      {status && !status.voice_ready && (
        <div>
          <p className="text-sm leading-relaxed text-dim">
            The avatar engine isn&apos;t installed on this backend yet. Your twin can still
            speak this verdict once the open-source voice + video stack is set up:
          </p>
          <ul className="mt-2 space-y-1">
            {status.missing.map((m) => (
              <li key={m} className="font-mono text-xs leading-relaxed text-dim">• {m}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">
            Full steps: <span className="font-mono">docs/AVATAR.md</span> — everything is
            open-source and runs locally, no accounts or API keys.
          </p>
        </div>
      )}

      {status?.voice_ready && !status.likeness_present && (
        <div>
          <p className="text-sm leading-relaxed text-dim">
            Upload a clear front-facing photo and ~30s of clean speech. Both stay on this
            machine — nothing is sent anywhere — and you can delete them anytime.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-dim">
              Photo (jpg/png/webp, ≤10 MB)
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-sm font-semibold text-mist file:mr-3 file:rounded-lg file:border file:border-edge file:bg-abyss file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-mist"
              />
            </label>
            <label className="block text-xs font-bold text-dim">
              Voice sample (wav/mp3/m4a, ≤15 MB)
              <input
                ref={voiceRef}
                type="file"
                accept="audio/*"
                onChange={(e) => setVoice(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-sm font-semibold text-mist file:mr-3 file:rounded-lg file:border file:border-edge file:bg-abyss file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-mist"
              />
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="accent-white"
            />
            This is my own face and voice.
          </label>
          <div className="mt-3">
            <Button onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : "Save my likeness"}
            </Button>
          </div>
        </div>
      )}

      {status?.configured && !job && !error && (
        <div>
          <p className="text-sm leading-relaxed text-dim">
            Have your twin speak this verdict in your cloned face and voice.{" "}
            <span className="text-faint">{status.lipsync_note}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={generate} disabled={busy}>
              {busy ? "Requesting render…" : "Generate talking verdict"}
            </Button>
            <GhostButton onClick={remove}>Delete my likeness</GhostButton>
          </div>
        </div>
      )}

      {job && PENDING.includes(job.status) && (
        <div>
          <Waveform bars={48} className="text-white/70" />
          <p className="mt-2 text-xs text-faint">
            Rendering locally… voice cloning plus video takes a few minutes on CPU. This
            page keeps checking.
          </p>
          {job.script && (
            <p className="mt-2 text-xs italic leading-relaxed text-dim">“{job.script}”</p>
          )}
        </div>
      )}

      {job?.status === "done" && job.video_url && (
        <div>
          <video
            controls
            playsInline
            preload="metadata"
            src={`${apiBase()}${job.video_url}`}
            className="w-full max-w-xl rounded-xl border border-edge"
          />
          <p className="mt-2 text-xs text-faint">
            AI-generated likeness of you ·{" "}
            {job.render_mode === "lipsync"
              ? "lip-synced (MuseTalk, open-source)"
              : "animated portrait + cloned voice (open-source)"}{" "}
            ·{" "}
            <a
              href={`${apiBase()}${job.video_url}`}
              download
              className="underline hover:text-mist"
            >
              download / share this clip
            </a>
          </p>
          <div className="mt-3">
            <GhostButton onClick={remove}>Delete my likeness</GhostButton>
          </div>
        </div>
      )}

      {job?.status === "failed" && (
        <div>
          <Banner tone="red">{job.error || "Render failed."}</Banner>
          <div className="mt-3">
            <GhostButton onClick={generate} disabled={busy}>
              {busy ? "Retrying…" : "Try again"}
            </GhostButton>
          </div>
        </div>
      )}
    </Section>
  );
}
