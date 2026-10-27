"use client";

import { useEffect, useRef, useState } from "react";
import { createBodyScene, type BodySceneHandle, type RegionHighlight } from "./bodyScene";

export type { RegionHighlight };

type Props = {
  highlights: RegionHighlight[];
  height?: number;
};

/* Illustrative body twin: stylized figure + scenario-linked region markers. */
export default function BodyViewer({ highlights, height = 380 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BodySceneHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    try {
      const handle = createBodyScene(mountRef.current);
      handle.onSelect((id) => setSelected(id));
      handleRef.current = handle;
    } catch {
      setFailed(true);
    }
    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleRef.current?.setHighlights(highlights);
    if (selected && !highlights.some((h) => h.region === selected)) setSelected(null);
  }, [highlights, selected]);

  useEffect(() => {
    handleRef.current?.setSelected(
      (selected as Parameters<BodySceneHandle["setSelected"]>[0]) ?? null,
    );
  }, [selected]);

  if (failed) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
        3D view unavailable in this browser (WebGL required). The region list below still applies.
      </div>
    );
  }

  const active = highlights.find((h) => h.region === selected) ?? null;

  return (
    <div>
      <div
        ref={mountRef}
        style={{ height }}
        className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
        role="img"
        aria-label="Illustrative 3D body figure with marked regions"
      />
      <p className="mt-1 text-xs text-slate-500">
        Illustrative figure — not patient anatomy. Drag to rotate, scroll to zoom.
      </p>
      {highlights.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {highlights.map((h) => (
            <button
              key={h.region}
              onClick={() => setSelected((s) => (s === h.region ? null : h.region))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                selected === h.region
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}
      {active?.note && <p className="mt-2 text-xs text-slate-300">{active.note}</p>}
    </div>
  );
}
