/** The Twinverse mark — locked brand asset. Do not redraw or recolor.
 *  Palette: accent green → lime gradient, paper bars, violet tip.
 *  These three colors ARE the brand palette (tokens: accent/lime/violet). */
export default function Logo({
  size = 28,
  glow = false,
  className = "",
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={glow ? { filter: "drop-shadow(0 0 14px rgba(43,255,153,0.55))" } : undefined}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
        <defs>
          <linearGradient id="twinverseMarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2BFF99" />
            <stop offset="100%" stopColor="#E2FF70" />
          </linearGradient>
        </defs>
        <rect x="2" y="7" width="4" height="14" rx="2" fill="url(#twinverseMarkGrad)" />
        <rect x="9" y="3" width="4" height="22" rx="2" fill="#FAF9F6" opacity="0.95" />
        <rect x="16" y="9" width="4" height="12" rx="2" fill="#FAF9F6" opacity="0.7" />
        <rect x="23" y="5" width="1.5" height="4" rx="0.75" fill="#C4A6FF" />
      </svg>
    </span>
  );
}
