"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  deleteConversation,
  apiBase,
  getAvatarStatus,
  getConversation,
  listConversations,
  listTwins,
  postTurn,
  requestTurnVideo,
  requestTurnVoice,
  type AvatarStatus,
  type Conversation,
  type Twin,
} from "@/lib/api";
import { BackLink, Banner, GhostButton, Skeleton, Waveform } from "@/components/ui";
import { PersonaSwitcher, TranscriptCaption, VoiceOrb, personaTheme } from "@/components/voice";

type VoiceMode = "instant" | "clone" | "silent";
type VoiceStyle = "natural" | "warm" | "energetic";
const VOICE_STYLES: Record<VoiceStyle, { rate: number; pitch: number; label: string }> = {
  natural: { rate: 1, pitch: 1, label: "Natural" },
  warm: { rate: 0.94, pitch: 0.88, label: "Warm" },
  energetic: { rate: 1.07, pitch: 1.12, label: "Energetic" },
};

function pickDeviceVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  return (
    pool.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ??
    pool.find((v) => /google us english|samantha|zira|aria/i.test(v.name)) ??
    pool[0] ??
    null
  );
}

const PENDING = ["queued", "rendering"];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export default function TalkPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-10"><Skeleton /></main>}>
      <TalkView />
    </Suspense>
  );
}

function TalkView() {
  const params = useSearchParams();
  const [twins, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState(params.get("twin") ?? "");
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [session, setSession] = useState<Conversation | null>(null);
  const [avatar, setAvatar] = useState<AvatarStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("instant");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("natural");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listTwins()
      .then((t) => {
        setTwins(t);
        setTwinId((cur) => cur || (t.length > 0 ? t[0].id : ""));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load twins"));
    getAvatarStatus().then(setAvatar).catch(() => setAvatar(null));
  }, []);

  const refreshSessions = useCallback(async (id: string) => {
    try {
      setSessions(await listConversations(id));
    } catch {
      /* session list is secondary */
    }
  }, []);

  useEffect(() => {
    if (!twinId) return;
    let cancelled = false;
    listConversations(twinId)
      .then((s) => {
        if (cancelled) return;
        setSessions(s);
        setSession((cur) => (cur && cur.twin_id !== twinId ? null : cur));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [twinId]);

  const hasPendingMedia = session?.turns.some(
    (t) => PENDING.includes(t.voice_status) || PENDING.includes(t.video_status),
  );

  useEffect(() => {
    if (!session || !hasPendingMedia) return;
    const t = setTimeout(async () => {
      try {
        const fresh = await getConversation(session.id);
        setSession(fresh);
        const last = fresh.turns.at(-1);
        if (last?.voice_status === "done" && last.voice_url && voiceMode === "clone") {
          document
            .querySelector<HTMLAudioElement>(`#voice-${CSS.escape(last.id)}`)
            ?.play()
            .catch(() => {});
        }
      } catch {
        /* keep last state */
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [session, hasPendingMedia, voiceMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.turns.length, busy]);

  function speakInstant(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/\[OFFLINE FIXTURE[^\]]*\]/, ""));
    const style = VOICE_STYLES[voiceStyle];
    utter.rate = style.rate;
    utter.pitch = style.pitch;
    const voice = pickDeviceVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  async function ensureSession(): Promise<Conversation> {
    if (session) return session;
    const created = await createConversation(twinId);
    setSession(created);
    return created;
  }

  async function send(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const message = (override ?? draft).trim();
    if (!message || !twinId || busy) return;
    setBusy(true);
    setError("");
    setDraft("");
    try {
      const s = await ensureSession();
      setSession((cur) =>
        cur
          ? {
              ...cur,
              turns: [
                ...cur.turns,
                {
                  id: "pending-user",
                  role: "user" as const,
                  text: message,
                  created_at: new Date().toISOString(),
                  model: "",
                  latency_ms: 0,
                  fixture: false,
                  facts_used: [],
                  voice_status: "idle" as const,
                  voice_url: "",
                  video_status: "idle" as const,
                  video_url: "",
                  render_mode: "",
                  media_error: "",
                },
              ],
            }
          : cur,
      );
      const reply = await postTurn(s.id, message);
      const fresh = await getConversation(s.id);
      setSession(fresh);
      void refreshSessions(twinId);
      if (voiceMode === "instant") speakInstant(reply.text);
      if (voiceMode === "clone" && avatar?.configured) {
        try {
          await requestTurnVoice(reply.id);
          setSession(await getConversation(s.id));
        } catch {
          /* clone is optional; instant voice remains available */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed");
      if (session) setSession(await getConversation(session.id).catch(() => session));
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setError("Voice input needs Chrome or Edge (Web Speech API). Typing works everywhere.");
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ");
      setDraft(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function media(turnId: string, kind: "voice" | "video") {
    if (!session) return;
    setError("");
    try {
      if (kind === "voice") await requestTurnVoice(turnId);
      else await requestTurnVideo(turnId);
      setSession(await getConversation(session.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render request failed");
    }
  }

  async function newSession() {
    if (!twinId) return;
    try {
      const created = await createConversation(twinId);
      setSession(created);
      void refreshSessions(twinId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a conversation");
    }
  }

  const twin = twins.find((t) => t.id === twinId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Talk to your twin</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            A real conversation, not a form. Speak or type — your twin answers in character,
            remembers the thread, and can reply in your cloned voice and face.
          </p>
        </div>
        <Waveform bars={28} animated={listening || speaking} className="text-white/40" />
      </div>

      {avatar && !avatar.configured && (
        <div className="mt-5">
          <Banner tone="amber">
            Cloned voice/avatar isn&apos;t ready yet, so replies use instant browser
            speech.{" "}
            <Link href="/clone" className="font-semibold text-white underline underline-offset-4">Set up your clone</Link>{" "}
            to unlock your own voice and face.
          </Banner>
        </div>
      )}
      {error && (
        <div className="mt-5">
          <Banner tone="red">{error}</Banner>
        </div>
      )}


      {/* Voice-first hero: orb is the primary input (VOICE.md) */}
      <div className="mt-8 flex flex-col items-center">
        <VoiceOrb
          state={busy ? "thinking" : speaking ? "speaking" : "idle"}
          gradient={personaTheme(twinId || "twin").gradient}
          onTranscript={(text) => setDraft(text)}
          onFinal={(text) => void send(undefined, text)}
          onUnsupported={() => setError("Mic's off in this browser — type instead, or tap a suggestion below.")}
        />
        <p className="mt-3 text-center text-sm text-zinc-400" role="status">
          {busy ? `${twin?.name ?? "Your twin"} is thinking…` : speaking ? "Speaking…" : "Tap the orb and tell your twin what you need — typing works too."}
        </p>
        <div className="mt-4 w-full">
          <TranscriptCaption
            label={session?.turns.at(-1)?.role === "twin" ? `${twin?.name ?? "Twin"} said` : undefined}
            text={[...(session?.turns ?? [])].reverse().find((x) => x.role === "twin")?.text ?? ""}
          />
        </div>
        <div className="mt-5">
          <PersonaSwitcher personas={twins} activeId={twinId} onSwitch={setTwinId} />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Suggested prompts">
          {[
            "What should I protect this week?",
            "Give me the boldest case for my next move",
            "What would you say to a client pushing my boundaries?",
          ].map((q) => (
            <button key={q} onClick={() => void send(undefined, q)} disabled={busy || !twinId}
              className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/5 px-4 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm font-semibold text-white">
          Twin
          <select
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 min-h-11 text-sm font-medium text-white outline-none focus:border-white/40 [&>option]:bg-zinc-900"
          >
            {twins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.current_version})
              </option>
            ))}
          </select>
        </label>
        {voiceMode === "instant" && (
          <label className="text-sm font-semibold text-white">
            Voice style
            <select
              value={voiceStyle}
              onChange={(e) => setVoiceStyle(e.target.value as VoiceStyle)}
              className="mt-1.5 block min-h-11 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-white/40 [&>option]:bg-zinc-900"
            >
              {Object.entries(VOICE_STYLES).map(([id, s]) => (
                <option key={id} value={id}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-semibold text-white">
          Reply voice
          <select
            value={voiceMode}
            onChange={(e) => setVoiceMode(e.target.value as VoiceMode)}
            className="mt-1.5 block rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 min-h-11 text-sm font-medium text-white outline-none focus:border-white/40 [&>option]:bg-zinc-900"
          >
            <option value="instant">Instant (browser)</option>
            <option value="clone">My cloned voice</option>
            <option value="silent">Silent</option>
          </select>
        </label>
        <GhostButton onClick={newSession}>New conversation</GhostButton>
      </div>

      {sessions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sessions.slice(0, 6).map((s) => (
            <span
              key={s.id}
              className={`inline-flex min-h-11 items-center gap-1 rounded-full border pl-4 pr-1 text-xs ${
                session?.id === s.id
                  ? "border-white/50 text-white"
                  : "border-white/10 text-zinc-400"
              }`}
            >
              <button
                onClick={() => getConversation(s.id).then(setSession).catch(() => {})}
                className="inline-flex min-h-11 max-w-44 items-center truncate font-medium hover:text-white"
              >
                {s.title || "Untitled chat"}
              </button>
              <button
                aria-label={`Delete conversation ${s.title || s.id}`}
                onClick={async () => {
                  await deleteConversation(s.id).catch(() => {});
                  if (session?.id === s.id) setSession(null);
                  void refreshSessions(twinId);
                }}
                className="grid h-11 w-11 place-items-center rounded-full text-base text-zinc-400 hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        aria-live="polite"
        aria-label="Conversation with your twin"
        className="mt-6 max-h-[52vh] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-panel px-5 py-5"
      >
        {!session || session.turns.length === 0 ? (
          <p className="text-sm leading-relaxed text-zinc-400">
            Say hello to {twin?.name ?? "your twin"} — ask for advice, rehearse a hard
            conversation, or just think out loud together.
          </p>
        ) : (
          session.turns.map((t) => (
            <article
              key={t.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                t.role === "user"
                  ? "ml-auto bg-white text-black"
                  : "border border-white/10 bg-white/5 text-zinc-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.role === "twin" && (
                <div className="mt-2.5 border-t border-white/10 pt-2.5">
                  <p className="font-mono text-[11px] text-zinc-400">
                    {t.fixture ? "offline fixture · " : ""}
                    {t.model}
                    {t.latency_ms ? ` · ${(t.latency_ms / 1000).toFixed(1)}s` : ""}
                    {t.facts_used.length > 0 ? ` · facts [${t.facts_used.join(", ")}]` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.voice_status === "done" && t.voice_url ? (
                      <audio
                        id={`voice-${t.id}`}
                        controls
                        src={`${apiBase()}${t.voice_url}`}
                        className="h-9 max-w-full"
                      />
                    ) : (
                      <button
                        onClick={() => media(t.id, "voice")}
                        disabled={PENDING.includes(t.voice_status)}
                        className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/40 disabled:opacity-50"
                      >
                        {t.voice_status === "failed"
                          ? "Voice failed — retry"
                          : PENDING.includes(t.voice_status)
                            ? "Cloning voice…"
                            : "Speak in my voice"}
                      </button>
                    )}
                    {t.video_status !== "done" && (
                      <button
                        onClick={() => media(t.id, "video")}
                        disabled={PENDING.includes(t.video_status)}
                        className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/40 disabled:opacity-50"
                      >
                        {t.video_status === "failed"
                          ? "Avatar failed — retry"
                          : PENDING.includes(t.video_status)
                            ? "Rendering avatar…"
                            : "Avatar video"}
                      </button>
                    )}
                  </div>
                  {t.media_error && <p className="mt-1.5 text-xs text-red-300">{t.media_error}</p>}
                  {t.video_status === "done" && t.video_url && (
                    <div className="mt-2">
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        src={`${apiBase()}${t.video_url}`}
                        className="w-full max-w-md rounded-xl border border-white/10"
                      />
                      <p className="mt-1 text-[11px] text-zinc-400">
                        AI-generated likeness ·{" "}
                        {t.render_mode === "lipsync" ? "lip-synced (MuseTalk)" : "animated portrait"} ·
                        cloned voice
                      </p>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))
        )}
        {busy && (
          <p role="status" className="max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
            {twin?.name ?? "Twin"} is thinking…
          </p>
        )}
      </div>

      <form onSubmit={send} className="mt-4">
        <label htmlFor="message" className="sr-only">
          Message your twin
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={listening ? "Listening… speak now" : "Type, or tap the mic and talk…"}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition focus-visible:shadow-[0_0_0_4px_rgba(250,249,246,0.22)] placeholder:text-zinc-400 focus:border-white/40"
          />
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            className={`min-h-11 rounded-full border px-5 text-sm font-semibold transition ${
              listening
                ? "border-red-400/50 bg-red-500/15 text-red-200"
                : "border-white/15 text-white hover:border-white/40"
            }`}
          >
            {listening ? "Stop" : "Mic"}
          </button>
          <button
            type="submit"
            disabled={busy || !draft.trim() || !twinId}
            className="min-h-11 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Enter sends · Shift+Enter for a new line ·{" "}
          <Link href="/council" className="underline underline-offset-2 hover:text-zinc-300">
            want a 3-lens council verdict instead?
          </Link>
        </p>
      </form>
    </main>
  );
}
