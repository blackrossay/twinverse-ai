"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  addAgendaPoint,
  advanceLive,
  apiBase,
  createLiveSession,
  createStageImage,
  endLiveSession,
  getAvatarStatus,
  getLiveDestination,
  getLiveSession,
  likenessPhotoUrl,
  listLiveSessions,
  listTwins,
  postLiveChat,
  publishLive,
  requestLiveVideo,
  requestLiveVoice,
  stageImageUrl,
  setLiveDestination,
  twinImageUrl,
  unpublishLive,
  type AvatarStatus,
  type LiveSession,
  type Twin,
} from "@/lib/api";
import { BackLink, Banner, GhostButton, PrimaryButton, Skeleton, Waveform } from "@/components/ui";

const PLATFORMS = [
  { id: "youtube", label: "YouTube" },
  { id: "twitch", label: "Twitch" },
  { id: "x", label: "X" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
];

const MODES = [
  { id: "general", label: "General", hint: "Balanced and friendly" },
  { id: "business", label: "Business", hint: "Clients, sales, support — no private details" },
  { id: "life", label: "Life", hint: "Personal stream — privacy guardrails on" },
  { id: "socials", label: "Socials", hint: "Punchy, on-brand, no pile-ons" },
];

const SIM_CHAT: Record<string, [string, string][]> = {
  general: [
    ["Sara", "hey twin! first time catching you live, what is this stream about?"],
    ["Marcus", "can you break that down more simply?"],
    ["Priya", "this is exactly what I needed today, thank you"],
    ["Leo", "what would you do differently if you started over?"],
    ["Ana", "drop your top 3 tips for beginners"],
  ],
  business: [
    ["ClientCam", "do you offer 1:1 sessions and how do we book?"],
    ["OpsOmar", "how do you handle revisions with difficult clients?"],
    ["FounderFay", "what does your onboarding process look like?"],
  ],
  life: [
    ["NeighborNia", "what does a normal week look like for you?"],
    ["OldFriendOli", "how do you protect your Fridays?"],
  ],
  socials: [
    ["ClipItKai", "that last point needs to be a clip, so good"],
    ["ModMina", "chat is loving this segment, keep going!"],
    ["NewSubNed", "just followed, your energy is unreal"],
  ],
};

const PENDING = ["queued", "rendering"];

export default function LivePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-6 py-10"><Skeleton /></main>}>
      <LiveView />
    </Suspense>
  );
}

function LiveView() {
  const params = useSearchParams();
  const demoMode = params.get("demo") === "1";
  const autoStarted = useRef(false);
  const [twins, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState("");
  const [past, setPast] = useState<LiveSession[]>([]);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [avatar, setAvatar] = useState<AvatarStatus | null>(null);
  const [stagePhoto, setStagePhoto] = useState(true);
  const [backdrop, setBackdrop] = useState(true);
  const [backdropCb, setBackdropCb] = useState(0);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("socials");
  const [platforms, setPlatforms] = useState<string[]>(["youtube"]);
  const [agendaText, setAgendaText] = useState("Welcome and wins of the week\nThe big topic, broken down\nLive Q&A with chat");
  const [newPoint, setNewPoint] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [streamKey, setStreamKey] = useState("");
  const [destination, setDestination] = useState<{ configured: boolean; key_hint: string } | null>(null);
  const [chatName, setChatName] = useState("HOST");
  const [chatText, setChatText] = useState("");
  const [priority, setPriority] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const spokenRef = useRef<Set<string>>(new Set());
  const simRef = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listTwins()
      .then((t) => {
        setTwins(t);
        const wanted = new URLSearchParams(window.location.search).get("twin");
        if (t.length > 0) setTwinId(t.some((x) => x.id === wanted) ? (wanted as string) : t[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load twins"));
    getAvatarStatus().then(setAvatar).catch(() => setAvatar(null));
  }, []);

  useEffect(() => {
    if (!twinId) return;
    listLiveSessions(twinId).then(setPast).catch(() => {});
  }, [twinId, session?.status]);

  // /live?demo=1 — one tap from the homepage lands on a running demo
  // stream (auto-created, simulated chat on) for the 1:30 wow window.
  useEffect(() => {
    if (!demoMode || !twinId || session || autoStarted.current) return;
    autoStarted.current = true;
    createLiveSession(twinId, {
      title: "Live with your twin — demo",
      mode: "socials",
      platforms: ["youtube", "twitch", "x"],
      agenda: ["Welcome and wins of the week", "The big topic, broken down", "Live Q&A with chat"],
    })
      .then((created) => {
        setSession(created);
        setSimulate(true);
      })
      .catch(() => setError("Demo stream could not start — set it up manually below."));
  }, [demoMode, twinId, session]);

  useEffect(() => {
    if (!session || session.status !== "live") return;
    const started = new Date(session.created_at).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))), 1000);
    return () => clearInterval(t);
  }, [session?.id, session?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const speak = useCallback((id: string, text: string) => {
    if (!voiceOn || spokenRef.current.has(id) || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    spokenRef.current.add(id);
    const utter = new SpeechSynthesisUtterance(text.replace(/\[OFFLINE FIXTURE\]\s*/g, ""));
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, [voiceOn]);

  const hasPending = session?.messages.some(
    (m) => PENDING.includes(m.voice_status) || PENDING.includes(m.video_status),
  );
  useEffect(() => {
    if (!session || !hasPending) return;
    const t = setTimeout(() => {
      getLiveSession(session.id).then(setSession).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [session, hasPending]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length]);

  const refresh = useCallback(async (id: string) => {
    setSession(await getLiveSession(id));
  }, []);

  useEffect(() => {
    if (!session) return;
    getLiveDestination(session.id)
      .then((d) => {
        setDestination(d);
        if (d.rtmp_url) setRtmpUrl(d.rtmp_url);
      })
      .catch(() => setDestination(null));
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulated multi-platform chat firehose
  useEffect(() => {
    if (!simulate || !session || session.status !== "live") return;
    const t = setInterval(async () => {
      const pool = SIM_CHAT[session.mode] ?? SIM_CHAT.general;
      const [username, message] = pool[simRef.current % pool.length];
      simRef.current += 1;
      const platform = session.platforms[simRef.current % Math.max(1, session.platforms.length)] ?? "youtube";
      try {
        const reply = await postLiveChat(session.id, { platform, username, message });
        await refresh(session.id);
        speak(reply.id, reply.reply);
      } catch {
        /* next tick retries */
      }
    }, 16000);
    return () => clearInterval(t);
  }, [simulate, session, refresh, speak]);

  async function goLive(e: React.FormEvent) {
    e.preventDefault();
    if (!twinId) return;
    setBusy(true);
    setError("");
    try {
      const created = await createLiveSession(twinId, {
        title: title.trim(),
        mode,
        platforms,
        agenda: agendaText.split("\n"),
      });
      setSession(created);
      spokenRef.current = new Set();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not go live");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !chatText.trim()) return;
    setBusy(true);
    try {
      const reply = await postLiveChat(session.id, {
        platform: "studio",
        username: chatName.trim() || "HOST",
        message: chatText.trim(),
        priority,
      });
      setChatText("");
      await refresh(session.id);
      speak(reply.id, reply.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function nextPoint() {
    if (!session) return;
    setBusy(true);
    try {
      const msg = await advanceLive(session.id);
      await refresh(session.id);
      speak(msg.id, msg.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not advance");
    } finally {
      setBusy(false);
    }
  }

  async function media(msgId: string, kind: "voice" | "video") {
    if (!session) return;
    try {
      if (kind === "voice") await requestLiveVoice(msgId);
      else await requestLiveVideo(msgId);
      await refresh(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render request failed");
    }
  }

  const twin = twins.find((t) => t.id === twinId);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const currentPoint = session?.agenda[session.current_point];

  if (!session) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <BackLink />
        <h1 className="display mt-4 text-5xl leading-[0.95] text-white">
          Your voice.<br />Your face. Live.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-400">
          Clone your voice and likeness once — your twin speaks verdicts, talks, and goes
          live as you, on every platform at once. It works through heads-up discussion
          points and answers live chat in real time, as if you were physically there on
          each channel.
        </p>
        {error && <div className="mt-5"><Banner tone="red">{error}</Banner></div>}
        {avatar && !avatar.configured && (
          <div className="mt-5">
            <Banner tone="amber">
              Near-real clone mode needs your likeness: instant browser voice works now.{" "}
              <Link href="/clone" className="font-semibold text-white underline underline-offset-4">Set up your clone</Link>{" "}
              to unlock your own voice and face.
            </Banner>
          </div>
        )}
        <form onSubmit={goLive} className="mt-7 space-y-5">
          <div>
            <label htmlFor="ltwin" className="text-sm font-semibold text-white">Twin going live</label>
            <select id="ltwin" value={twinId} onChange={(e) => setTwinId(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-white/40 [&>option]:bg-zinc-900">
              {twins.length === 0 && <option value="">Loading twins…</option>}
              {twins.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.current_version})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ltitle" className="text-sm font-semibold text-white">Stream title</label>
            <input id="ltitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
              placeholder={`Live with ${twin?.name ?? "your twin"}`}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-white">Mode — what is the twin running?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <label key={m.id} className={`cursor-pointer rounded-2xl border px-4 py-3 ${mode === m.id ? "border-white/50 bg-white/5" : "border-white/10 bg-panel"}`}>
                  <span className="flex min-h-8 items-center gap-2 text-sm font-semibold text-white">
                    <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="accent-white" />
                    {m.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{m.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-white">Multistream to</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" aria-pressed={platforms.includes(p.id)}
                  onClick={() => setPlatforms((cur) => cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id])}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition ${platforms.includes(p.id) ? "border-accent/50 bg-accent/10 text-emerald-200" : "border-white/10 text-zinc-400 hover:text-white"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Targets are staged here today; real RTMP/API publishing per platform is the
              go-live bridge in docs/LIVE.md.
            </p>
          </fieldset>
          <div>
            <label htmlFor="lagenda" className="text-sm font-semibold text-white">Heads-up discussion points (one per line)</label>
            <textarea id="lagenda" value={agendaText} onChange={(e) => setAgendaText(e.target.value)} rows={4}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
          </div>
          <PrimaryButton disabled={busy || !twinId}>{busy ? "Going live…" : "Go live"}</PrimaryButton>
        </form>
        {past.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Past streams</h2>
            <ul className="mt-3 space-y-2">
              {past.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <button onClick={() => getLiveSession(s.id).then(setSession).catch(() => {})}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-2.5 text-left text-sm hover:border-white/30">
                    <span className="font-medium text-white">{s.title}</span>
                    <span className="text-xs text-zinc-400">{s.mode} · {s.status} · {s.messages.length} chats</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-red-500/15 px-3.5 text-xs font-bold text-red-300 ring-1 ring-red-500/30">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> LIVE {mm}:{ss}
        </span>
        <h1 className="display text-3xl text-white">{session.title}</h1>
        <span className="text-xs text-zinc-400">{twin?.name} · {session.mode} mode</span>
        <span className="ml-auto flex gap-2">
          {session.platforms.map((p) => (
            <span key={p} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-300">
              {PLATFORMS.find((x) => x.id === p)?.label ?? p}
            </span>
          ))}
        </span>
      </div>

      {error && <div className="mt-4"><Banner tone="red">{error}</Banner></div>}

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        {/* STAGE */}
        <section aria-label="Live stage" className="lg:col-span-3">
          <div className="bento relative overflow-hidden p-0">
            <div className="relative aspect-video bg-black">
              {backdrop && twin && (
                <Image src={stageImageUrl(twin.id, backdropCb)} alt="" fill unoptimized
                  onError={() => setBackdrop(false)} className="object-cover opacity-50" />
              )}
              {stagePhoto ? (
                <Image src={likenessPhotoUrl()} alt={`Live avatar of ${twin?.name ?? "your twin"}`}
                  fill unoptimized onError={() => setStagePhoto(false)}
                  className={`object-cover opacity-90 ${speaking ? "scale-[1.02]" : ""} transition-transform duration-700`} />
              ) : twin ? (
                <Image src={twinImageUrl(twin.id)} alt="" fill unoptimized
                  className={`object-cover opacity-80 ${speaking ? "scale-[1.02]" : ""} transition-transform duration-700`} />
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5 pt-16">
                <Waveform bars={40} animated={speaking} className="text-accent/80" />
                <p aria-live="polite" className="mt-2 min-h-6 text-[15px] font-medium leading-relaxed text-white">
                  {[...session.messages].reverse().find((m) => m.reply)?.reply ?? "Your twin is on stage — advance a point or let chat roll in."}
                </p>
              </div>
              {currentPoint && (
                <div className="absolute left-4 top-4 max-w-xs rounded-2xl border border-white/15 bg-black/70 px-4 py-3 backdrop-blur">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Heads-up · point {session.current_point + 1}/{session.agenda.length}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{currentPoint.text}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={nextPoint} disabled={busy || session.status !== "live"}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50">
              {busy ? "…" : "Deliver next point →"}
            </button>
            <button onClick={() => setSimulate((s) => !s)} aria-pressed={simulate}
              className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold transition ${simulate ? "border-accent/50 bg-accent/10 text-emerald-200" : "border-white/15 text-white hover:border-white/40"}`}>
              {simulate ? "Chat simulation on" : "Simulate live chat"}
            </button>
            <button onClick={() => {
                if (!voiceOn && typeof window !== "undefined") window.speechSynthesis?.cancel();
                setVoiceOn((v) => !v);
              }} aria-pressed={voiceOn}
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white hover:border-white/40">
              Voice {voiceOn ? "on" : "off"}
            </button>
            <button
              onClick={async () => {
                if (!twin) return;
                setBusy(true);
                try {
                  await createStageImage(twin.id);
                  setBackdrop(true);
                  setBackdropCb((v) => v + 1);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Stage backdrop needs a live model key");
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-white/40">
              Generate stage backdrop
            </button>
            {session.status === "live" ? (
              <GhostButton onClick={async () => { await endLiveSession(session.id).catch(() => {}); await refresh(session.id); }}>End stream</GhostButton>
            ) : (
              <GhostButton onClick={() => setSession(null)}>Back to studio setup</GhostButton>
            )}
          </div>


          <div className="bento mt-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Publish to YouTube</h2>
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${session.stream_status === "publishing" ? "bg-red-500/15 text-red-300" : session.stream_status === "error" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-zinc-300"}`}>
                {session.stream_status === "publishing" ? "ON AIR" : session.stream_status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Your persona renders on our side and pushes straight to YouTube — no software
              on your device. The stream loops your stage with every rendered avatar reply;
              republish after new clips render to include them.
            </p>
            {destination?.configured ? (
              <p className="mt-3 text-sm text-zinc-300">
                Destination saved · key {destination.key_hint}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="rtmp" className="sr-only">YouTube RTMP URL</label>
                <input id="rtmp" value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none focus:border-white/40" />
                <label htmlFor="skey" className="sr-only">YouTube stream key</label>
                <input id="skey" type="password" value={streamKey} onChange={(e) => setStreamKey(e.target.value)}
                  placeholder="Stream key (YouTube Studio → Go live → Stream)"
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
                <button
                  onClick={async () => {
                    if (!streamKey.trim()) { setError("Paste your YouTube stream key first."); return; }
                    try {
                      setDestination(await setLiveDestination(session.id, rtmpUrl.trim(), streamKey.trim()));
                      setStreamKey("");
                    } catch (e) { setError(e instanceof Error ? e.message : "Could not save destination"); }
                  }}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white hover:border-white/40">
                  Save destination
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {session.stream_status === "publishing" ? (
                <button onClick={async () => { await unpublishLive(session.id).catch(() => {}); await refresh(session.id); }}
                  className="inline-flex min-h-11 items-center rounded-full bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-400">
                  Stop publishing
                </button>
              ) : (
                <button disabled={!destination?.configured || session.status !== "live"}
                  onClick={async () => {
                    try { await publishLive(session.id); await refresh(session.id); }
                    catch (e) { setError(e instanceof Error ? e.message : "Publish failed — check the key and try again"); await refresh(session.id).catch(() => {}); }
                  }}
                  className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">
                  Publish to YouTube
                </button>
              )}
              <span className="text-xs text-zinc-400">
                {session.messages.filter((m) => m.video_status === "done").length} avatar clip(s) in the loop
              </span>
            </div>
            {session.stream_status === "error" && (
              <p className="mt-2 text-xs text-amber-300">The stream stopped unexpectedly — usually a wrong key or closed ingest. Check YouTube Studio, then publish again.</p>
            )}
          </div>

          <div className="bento mt-4 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Discussion points</h2>
            <ol className="mt-3 space-y-2">
              {session.agenda.map((pt, i) => (
                <li key={pt.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${pt.done ? "border-white/5 text-zinc-500 line-through" : i === session.current_point ? "border-accent/40 bg-accent/5 text-white" : "border-white/10 text-zinc-300"}`}>
                  <span className="font-mono text-xs">{pt.done ? "✓" : i + 1}</span> {pt.text}
                </li>
              ))}
            </ol>
            {session.status === "live" && (
              <form onSubmit={async (e) => { e.preventDefault(); if (!newPoint.trim()) return; await addAgendaPoint(session.id, newPoint.trim()).catch(() => {}); setNewPoint(""); await refresh(session.id); }} className="mt-3 flex gap-2">
                <label htmlFor="newpoint" className="sr-only">Add discussion point</label>
                <input id="newpoint" value={newPoint} onChange={(e) => setNewPoint(e.target.value)} placeholder="Add a point mid-stream…"
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
                <button type="submit" className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white hover:border-white/40">Add</button>
              </form>
            )}
          </div>
        </section>

        {/* CHAT */}
        <section aria-label="Live chat" className="lg:col-span-2">
          <div ref={feedRef} aria-live="polite" className="bento max-h-[560px] space-y-3 overflow-y-auto p-4">
            {session.messages.length === 0 && (
              <p className="text-sm leading-relaxed text-zinc-400">Chat is quiet — for now. Turn on simulation or post as a viewer and your twin answers out loud, in character.</p>
            )}
            {session.messages.map((m) => (
              <article key={m.id} className={`rounded-2xl border px-4 py-3 ${m.priority ? "border-amber-400/40 bg-amber-400/10" : m.kind !== "chat" ? "border-accent/30 bg-accent/5" : "border-white/10 bg-white/[0.03]"}`}>
                <p className="text-xs text-zinc-400">
                  <span className="font-bold text-zinc-200">{m.username}</span> · {m.platform}
                  {m.priority && <span className="ml-2 font-bold text-amber-300">PINNED</span>}
                </p>
                {m.message && <p className="mt-1 text-sm text-zinc-200">{m.message}</p>}
                {m.reply && (
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <p className="text-sm leading-relaxed text-white">{m.reply}</p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-400">{m.fixture ? "offline fixture · " : ""}{m.model}{m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)}s` : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.voice_status === "done" && m.voice_url ? (
                        <audio controls src={`${apiBase()}${m.voice_url}`} className="h-9 max-w-full" />
                      ) : (
                        <button onClick={() => media(m.id, "voice")} disabled={PENDING.includes(m.voice_status)}
                          className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 hover:border-white/40 disabled:opacity-50">
                          {m.voice_status === "failed" ? "Voice failed — retry" : PENDING.includes(m.voice_status) ? "Cloning voice…" : "Speak in my voice"}
                        </button>
                      )}
                      {m.video_status !== "done" && (
                        <button onClick={() => media(m.id, "video")} disabled={PENDING.includes(m.video_status)}
                          className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 hover:border-white/40 disabled:opacity-50">
                          {m.video_status === "failed" ? "Avatar failed — retry" : PENDING.includes(m.video_status) ? "Rendering avatar…" : "Avatar video"}
                        </button>
                      )}
                    </div>
                    {m.media_error && <p className="mt-1 text-xs text-red-300">{m.media_error}</p>}
                    {m.video_status === "done" && m.video_url && (
                      <video controls playsInline preload="metadata" src={`${apiBase()}${m.video_url}`} className="mt-2 w-full rounded-xl border border-white/10" />
                    )}
                  </div>
                )}
              </article>
            ))}
            {busy && <p role="status" className="text-sm text-zinc-400">Twin is answering…</p>}
          </div>

          <form onSubmit={sendChat} className="mt-3 space-y-2">
            <div className="flex gap-2">
              <label htmlFor="chatname" className="sr-only">Viewer name</label>
              <input id="chatname" value={chatName} onChange={(e) => setChatName(e.target.value)} maxLength={60}
                className="min-h-11 w-28 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/40" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-300">
                <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} className="h-5 w-5 accent-amber-300" />
                Pinned
              </label>
            </div>
            <label htmlFor="chattext" className="sr-only">Chat message</label>
            <div className="flex gap-2">
              <input id="chattext" value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={500}
                placeholder="Chat as a viewer — the twin answers live…"
                className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-white/40" />
              <button type="submit" disabled={busy || !chatText.trim() || session.status !== "live"}
                className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">Send</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
