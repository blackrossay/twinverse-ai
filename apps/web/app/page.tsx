"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listRuns, listTwins, seedTwins, twinImageUrl, type SimulationRun, type Twin } from "@/lib/api";
import { Badge, Banner, Skeleton, statusTone, Waveform } from "@/components/ui";
import { anime as animeMotion, animationScope, springs } from "@/lib/motion";

function TwinAvatar({ id, name }: { id: string; name: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white ring-1 ring-white/10">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={twinImageUrl(id)}
      alt={`Identity card for ${name}`}
      width={44}
      height={44}
      unoptimized
      onError={() => setShown(false)}
      className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
    />
  );
}

export default function Dashboard() {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const bentoRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setError("");
      const [t, r] = await Promise.all([listTwins(), listRuns()]);
      setTwins(t);
      setRuns(r.slice(0, 8));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach API");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTwins(), listRuns()])
      .then(([t, r]) => {
        if (cancelled) return;
        setTwins(t);
        setRuns(r.slice(0, 8));
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to reach API");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Hero entrance + card stagger + scroll progress
  useEffect(() => {
    const cleanupFns: (()=>void)[] = [];
    const scope = animationScope();
    (async () => {
      try {
        const mod = await animeMotion();
        if (!mod) return;
        const { animate, createTimeline, stagger, spring, onScroll } = mod;

        // scroll progress
        const progress = document.getElementById("scrollProgress");
        const onScrollProg = () => {
          const h = document.documentElement.scrollHeight - window.innerHeight;
          const pct = h>0 ? (window.scrollY / h) * 100 : 0;
          if(progress) progress.style.width = pct + "%";
        };
        window.addEventListener("scroll", onScrollProg, { passive:true });
        cleanupFns.push(()=>window.removeEventListener("scroll", onScrollProg));

        // hero split text (manual: chars wrapped)
        const titleChars = document.querySelectorAll("#heroTitle .char");
        if(titleChars.length){
          scope.track(animate(titleChars, {
            y: [{ from: "110%" }, { to: "0%" }],
            opacity: [{ from: 0 }, { to: 1 }],
            rotate: [{ from: "6deg" }, { to: "0deg" }],
            duration: 900,
            delay: stagger(28, { start: 120 }),
            ease: "out(4)",
          }));
        }

        // hero sub + ctas
        const tl = createTimeline({ defaults: { ease: "out(3)", duration: 700 } });
        tl.add("#heroSub", { y: ["12px","0px"], opacity: [0,1], duration: 600 }, "+=120")
          .add("#heroCtas", { y: ["10px","0px"], opacity: [0,1], duration: 500 }, "-=200")
          .add("#heroWave", { opacity: [0,1], scale: [{ from: .96 }, { to: 1 }], duration: 700 }, "-=100");

        // bento grid stagger
        if(bentoRef.current){
          const cards = bentoRef.current.querySelectorAll(".bento");
          scope.track(animate(cards, {
            y: [{ from: "20px" }, { to: "0px" }],
            opacity: [{ from: 0 }, { to: 1 }],
            scale: [{ from: .97 }, { to: 1 }],
            duration: 700,
            delay: stagger(70, { from: "first", grid: [2,3] }),
            ease: spring(springs.gentle),
          }));
        }

        // twins grid stagger when enters viewport
        try{
          const twinsGrid = document.querySelectorAll("#twinsGrid .bento");
          twinsGrid.forEach((el) => {
            onScroll({
              target: el,
              enter: "bottom top+=20%",
              onEnter: () => {
                animate(el, {
                  y: ["16px","0px"], opacity: [0,1],
                  duration: 600, ease: "out(3)",
                });
              }
            });
          });
        }catch{}

        // magnetic + tilt for bento cards
        const bentos = document.querySelectorAll<HTMLElement>(".bento");
        bentos.forEach(card=>{
          const handleMove = (e: MouseEvent) => {
            const r = card.getBoundingClientRect();
            const mx = e.clientX - r.left - r.width/2;
            const my = e.clientY - r.top - r.height/2;
            const dx = (mx / r.width) * 6;
            const dy = (my / r.height) * -4;
            animate(card, { rotateY: dx, rotateX: dy, x: mx*0.04, y: my*0.06, duration: 500, ease: "out(2)" });
          };
          const handleLeave = () => animate(card, { rotateX:0, rotateY:0, x:0, y:0, duration: 800, ease: spring(springs.drawer) });
          card.addEventListener("mousemove", handleMove);
          card.addEventListener("mouseleave", handleLeave);
          cleanupFns.push(()=>{card.removeEventListener("mousemove", handleMove); card.removeEventListener("mouseleave", handleLeave);});
        });

      } catch (e) { console.warn("anime init failed", e); }
    })();
    return () => { cleanupFns.forEach(fn=>fn()); scope.cancelAll(); };
  }, [loaded, twins.length, runs.length]);

  async function seed() {
    setBusy(true);
    try {
      const created = await seedTwins();
      if (created.length === 0) setError("Demo personas already exist — already seeded.");
      await refresh();
      // pop animation
      try{
        const mod = await animeMotion();
        if (!mod) return;
        const { animate, spring, stagger } = mod;
        const grid = document.querySelectorAll("#twinsGrid .bento");
        animate(grid, { scale: [{from:.96},{to:1.02},{to:1}], duration: 500, delay: stagger(40), ease: spring(springs.pop) });
      }catch{}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto max-w-6xl px-6 pb-16">
      {/* HERO */}
      <div ref={heroRef} className="relative -mx-6 overflow-hidden px-6 pb-12 pt-16">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          {/* top meta */}
          <div className="mx-auto flex max-w-5xl items-center justify-center gap-3">
            <span className="mono inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Twin Council · Twin Secretary · Twin Live
            </span>
            <span className="hidden mono rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-black md:inline-flex">New · Live Studio</span>
          </div>

          <h1 id="heroTitle" className="display mx-auto mt-6 max-w-4xl text-center text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.88] text-white">
            <span className="block overflow-hidden">
              <span className="inline-block">
                {"Ask once.".split("").map((c,i)=><span key={i} className="char inline-block">{c===" "? "\u00A0" : c}</span>)}
              </span>
            </span>
            <span className="block overflow-hidden">
              <span className="inline-block">
                {"Hear every side".split("").map((c,i)=><span key={`2-${i}`} className="char inline-block">{c===" "? "\u00A0" : c}</span>)}
                <span className="char inline-block italic text-zinc-400">{" of yourself.".split("").map((c,j)=><span key={`3-${j}`} className="char inline-block">{c===" "? "\u00A0" : c}</span>)}</span>
              </span>
            </span>
          </h1>

          <p id="heroSub" className="mx-auto mt-6 max-w-2xl text-center text-[15px] leading-relaxed text-zinc-400 md:text-[17px]">
            Your twin debates your decision from three angles in parallel — then handles your calls and calendar like you would.
            Every answer scored with evidence. Talk to it, watch it deliberate, or put it live in your voice and face.
          </p>

          <div id="heroCtas" className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/council"
              className="group relative inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-full bg-white px-7 text-[14px] font-semibold text-black transition hover:bg-zinc-200 magnetic"
            >
              <span className="relative z-10">Ask the council</span>
              <span className="relative z-10 transition group-hover:translate-x-0.5">→</span>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent to-lime opacity-0 transition group-hover:opacity-20" />
            </Link>
            <button
              onClick={seed}
              disabled={busy}
              className="mono inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-[13px] font-semibold text-white backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-50"
            >
              <span className={`h-2 w-2 rounded-full ${busy ? "animate-spin border border-white/30 border-t-white" : "bg-accent"}`} />
              {busy ? "Seeding…" : "Seed demo personas"}
            </button>
            <Link href="/sims/new" className="mono inline-flex min-h-11 items-center rounded-full border border-white/10 px-6 text-[13px] text-zinc-400 transition hover:border-white/20 hover:text-white">
              New session ↗
            </Link>
          </div>

          <div id="heroWave" className="mx-auto mt-10 max-w-3xl">
            <Waveform bars={64} animated className="justify-center text-white/30" />
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center backdrop-blur">
                <div className="mono text-[10px] uppercase tracking-widest text-zinc-400">Twins</div>
                <div className="display mt-1 text-3xl text-white">{twins.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center backdrop-blur">
                <div className="mono text-[10px] uppercase tracking-widest text-zinc-400">Sessions</div>
                <div className="display mt-1 text-3xl text-white">{runs.length}</div>
              </div>
              <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] px-4 py-3 text-center backdrop-blur">
                <div className="mono text-[10px] uppercase tracking-widest text-emerald-300/70">Live now</div>
                <div className="mono mt-1 text-[12px] font-bold text-emerald-200">Talk · Council · Live</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD */}
      <div ref={bentoRef} className="mt-2 grid grid-cols-12 gap-4">
        <div className="bento bento-accent col-span-12 md:col-span-7 p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live council pipeline
              </div>
              <h2 className="display mt-3 text-[28px] leading-[0.95]">Three voices,<br /><span className="italic text-zinc-400">one decision.</span></h2>
              <p className="mt-3 max-w-[36ch] text-[13px] leading-relaxed text-zinc-400">Parallel debate → synthesis → evidence scoring. Every run measurable, every twin versioned. Spring physics on hover.</p>
            </div>
            <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black md:grid">⟡</div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { k: "Optimist", v: "Sees upside", c: "#00FF88" },
              { k: "Realist", v: "Balances risk", c: "#FAF9F6" },
              { k: "Skeptic", v: "Finds flaws", c: "#B18CFF" },
            ].map(o=>(
              <div key={o.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mono text-[10px] uppercase tracking-wide text-zinc-400">{o.k}</div>
                <div className="mt-1 text-[13px] font-semibold text-white">{o.v}</div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${o.k==="Realist"? 72 : o.k==="Optimist"? 64 : 58}%`, background: o.c }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bento col-span-12 md:col-span-5 p-6">
          <div className="mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">How it works</div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="mono text-[12px] text-zinc-300">1 · Create your twin</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-black">bio → identity</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="mono text-[12px] text-zinc-300">2 · Ask, talk, or go live</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-zinc-200">in your voice</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-accent/20 bg-accent/10 px-4 py-3">
              <span className="mono text-[12px] text-emerald-200">3 · Check the evidence</span>
              <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-black">scored 0–5</span>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
            Facts stay separate from inferences, every answer cites its evidence, and the final call is always yours.
          </p>
        </div>

        <div className="bento bento-green col-span-12 md:col-span-5 p-6">
          <div className="flex items-center justify-between">
            <span className="mono text-[11px] font-bold uppercase tracking-widest text-black/60">New drop</span>
            <span className="rounded-full bg-black px-3 py-1 text-[10px] font-bold text-white">VOICE + FACE</span>
          </div>
          <h3 className="display mt-4 text-[32px] leading-[0.9] text-black">Your voice.<br />Your face. Live.</h3>
          <p className="mt-3 text-[13px] leading-relaxed text-black/70">Clone your voice and likeness once — your twin speaks verdicts, talks, and goes live as you, on every platform at once.</p>
          <div className="mt-5 flex gap-2">
            <div className="h-8 w-8 rounded-full bg-black" />
            <div className="h-8 w-8 rounded-full border border-black/10 bg-white" />
            <div className="h-8 w-8 rounded-full bg-violet" />
          </div>
        </div>

        <div className="bento col-span-12 md:col-span-7 p-0 overflow-hidden">
          <div className="grid grid-cols-3">
            <div className="border-r border-white/10 p-5">
              <div className="mono text-[10px] uppercase text-zinc-400">Latency</div>
              <div className="display mt-2 text-2xl text-white">~1.2s</div>
              <div className="mono mt-1 text-[11px] text-zinc-400">parallel fan-out</div>
              <div className="mt-3 h-1 w-full rounded-full bg-white/10"><div className="h-full w-[82%] rounded-full bg-accent" /></div>
            </div>
            <div className="border-r border-white/10 p-5">
              <div className="mono text-[10px] uppercase text-zinc-400">Evidence</div>
              <div className="display mt-2 text-2xl text-white">scored</div>
              <div className="mono mt-1 text-[11px] text-zinc-400">0‒5 scale</div>
              <div className="mt-3 flex gap-1">{[1,1,1,0.6,0.2].map((o,i)=><div key={i} className="h-1 flex-1 rounded-full bg-white" style={{ opacity:o }} />)}</div>
            </div>
            <div className="p-5">
              <div className="mono text-[10px] uppercase text-zinc-400">Voice</div>
              <div className="display mt-2 text-2xl text-white">Lab</div>
              <div className="mono mt-1 text-[11px] text-zinc-400">TTS · STT · Wave</div>
              <div className="mt-3"><Waveform bars={18} animated className="text-white/40" /></div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="min-w-64 flex-1">
            <Banner tone="red">{error} Check the backend is running, then try again.</Banner>
          </div>
          <button
            onClick={() => void refresh()}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-white/40"
          >
            Retry
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="mt-12 grid gap-4">
          <Skeleton lines={5} />
        </div>
      ) : (
        <>
          {/* Twins */}
          <div className="mt-14 flex items-center gap-4">
            <h2 className="mono shrink-0 text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-400">Twins ({twins.length})</h2>
            <div className="h-px flex-1 bg-white/10" />
            <Link href="/twins/new" className="mono inline-flex min-h-11 items-center rounded-full border border-white/15 bg-white/[0.04] px-4 text-[12px] font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white">
              + New twin
            </Link>
          </div>

          <div id="twinsGrid" className="mt-6">
            {twins.length === 0 ? (
              <div className="bento p-6">
                <p className="text-sm text-zinc-400">No twins yet — seed the demo personas or create one.</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {twins.map((t) => (
                  <li key={t.id} className="bento group p-0 overflow-hidden">
                    <Link href={`/twins/${t.id}`} className="flex items-center gap-4 px-5 py-5">
                      <TwinAvatar id={t.id} name={t.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="display truncate text-[18px] tracking-[-0.01em] text-white">{t.name}</span>
                          <Badge tone="iris">{t.profile_type} · v{t.current_version}</Badge>
                        </div>
                        <p className="mono mt-1 text-[11px] text-zinc-400">updated {new Date(t.updated_at).toLocaleString()}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="mono rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-zinc-400">Identity · Voice · Live</span>
                          <span className="mono text-[11px] text-zinc-400 opacity-0 transition group-hover:opacity-100">Explore →</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent sessions */}
          <div className="mt-14 flex items-center gap-4">
            <h2 className="mono shrink-0 text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-400">Recent sessions ({runs.length})</h2>
            <div className="h-px flex-1 bg-white/10" />
            <Link href="/sims/new" className="mono text-[12px] text-zinc-400 hover:text-white">Launch ↗</Link>
          </div>

          <div className="mt-6">
            {runs.length === 0 ? (
              <div className="bento p-6">
                <p className="text-sm text-zinc-400">No sessions yet. <Link href="/sims/new" className="font-semibold text-white underline underline-offset-4">Launch one</Link>.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {runs.map((r) => (
                  <li key={r.id} className="bento group flex items-center justify-between gap-3 px-5 py-4 transition hover:border-white/20">
                    <Link href={`/sims/${r.id}`} className="flex flex-1 items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-white/10 grid place-items-center font-mono text-[11px] text-white">{r.scenarios.length}</div>
                        <span className="mono text-[13px] text-zinc-200">{r.id.slice(0, 16)}…</span>
                        <span className="mono hidden text-[11px] text-zinc-400 md:inline">{r.scenarios.length} task{r.scenarios.length === 1 ? "" : "s"} · v{r.identity_version}</span>
                      </div>
                      <span className="flex items-center gap-3">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        <span className="mono text-[11px] text-zinc-400 opacity-0 transition group-hover:opacity-100">Open →</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer CTA — editorial */}
          <div className="mt-16 grid grid-cols-12 gap-4">
            <div className="bento col-span-12 md:col-span-8 p-7 bg-panel">
              <div className="mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">Next step</div>
              <h3 className="display mt-3 max-w-[20ch] text-[30px] leading-[0.95]">Every side, scored.<br /><span className="italic text-zinc-400">Your call, always.</span></h3>
              <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-zinc-400">Seed personas, launch a council debate, then port the winner to your calendar and calls.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/council" className="rounded-full bg-white px-6 py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-200">Open council →</Link>
                <Link href="/talk" className="rounded-full border border-white/15 px-6 py-2.5 text-[13px] font-semibold text-white transition hover:border-white/30">Talk mode</Link>
              </div>
            </div>
            <div className="bento col-span-12 md:col-span-4 p-6">
              <div className="mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">Your control</div>
              <div className="mt-4 space-y-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="mono text-[11px] text-zinc-300">Facts and inferences, always kept separate</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="mono text-[11px] text-zinc-300">Your likeness stays yours — delete it anytime</div>
                </div>
                <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
                  <div className="mono text-[11px] text-emerald-200">The final call is always yours</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
