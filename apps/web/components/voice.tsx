"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* Named voice-first components (diff spec): VoiceOrb, PersonaSwitcher,
   GlassCard, TranscriptCaption. Glow is state, never decoration. */

export const PERSONA_THEMES = [
  { id: "nova", label: "Nova", gradient: "linear-gradient(135deg,#8B5CF6,#EC4899)" },
  { id: "atlas", label: "Atlas", gradient: "linear-gradient(135deg,#22D3EE,#3B82F6)" },
  { id: "ember", label: "Ember", gradient: "linear-gradient(135deg,#FB923C,#EF4444)" },
  { id: "sage", label: "Sage", gradient: "linear-gradient(135deg,#34D399,#14B8A6)" },
] as const;

export function personaTheme(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PERSONA_THEMES[h % PERSONA_THEMES.length];
}

export function GlassCard({
  children,
  className = "",
  floating = false,
}: {
  children: ReactNode;
  className?: string;
  floating?: boolean;
}) {
  return <div className={`${floating ? "glass-floating" : "glass"} rounded-3xl ${className}`}>{children}</div>;
}

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => Recognition)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export function VoiceOrb({
  state,
  gradient,
  onTranscript,
  onFinal,
  onUnsupported,
  size = 112,
}: {
  state: OrbState;
  gradient: string;
  onTranscript?: (text: string) => void;
  onFinal?: (text: string) => void;
  onUnsupported?: () => void;
  size?: number;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      onUnsupported?.();
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const results = Array.from(e.results);
      const text = results.map((r) => r[0]?.transcript ?? "").join(" ");
      onTranscript?.(text);
      if (results.some((r) => r.isFinal)) onFinal?.(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const effective: OrbState = listening ? "listening" : state;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Tap to talk to your twin"}
      className="group relative grid shrink-0 place-items-center rounded-full outline-none transition-transform duration-300 hover:scale-[1.03] focus-visible:scale-[1.03]"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${
          effective === "thinking"
            ? "glow-thinking"
            : effective === "listening"
              ? "glow-listening"
              : effective === "speaking"
                ? "glow-speaking"
                : "glow-idle"
        }`}
        style={{
          background: gradient,
          opacity: effective === "idle" ? 0.75 : 0.95,
          filter: "blur(0.5px)",
          transition: "background 0.35s ease, opacity 0.35s ease",
        }}
      />
      <span aria-hidden className="glass-floating absolute inset-[10px] rounded-full" />
      <span className="relative grid h-11 w-11 place-items-center" aria-hidden>
        <span className="flex h-6 items-end gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-white ${effective === "listening" || effective === "speaking" ? "eq-bar" : ""}`}
              style={{ height: `${10 + ((i * 7) % 14)}px`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </span>
      </span>
      <span className="sr-only">{effective}</span>
    </button>
  );
}

export function PersonaSwitcher({
  personas,
  activeId,
  onSwitch,
}: {
  personas: { id: string; name: string }[];
  activeId: string;
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Choose persona">
      {personas.map((p) => {
        const theme = personaTheme(p.id + p.name);
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={active}
            onClick={() => onSwitch(p.id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all duration-300 ${
              active ? "border-white/60 text-white" : "border-white/10 text-zinc-400 hover:text-white"
            }`}
            style={active ? { background: theme.gradient, color: "#0A0A0A", borderColor: "transparent" } : undefined}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: theme.gradient }}
            />
            {p.name}
            {active && <span className="text-[11px] font-bold uppercase tracking-wide">{theme.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TranscriptCaption({ text, label }: { text: string; label?: string }) {
  if (!text) return null;
  return (
    <div aria-live="polite" className="glass mx-auto max-w-xl rounded-2xl px-5 py-3.5 text-center">
      {label && (
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      )}
      <p className="mt-1 text-[15px] leading-relaxed text-white">{text}</p>
    </div>
  );
}
