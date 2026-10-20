// Deterministic generative banner art per competition (no stock imagery or third-party assets).
import { cn } from "@/lib/cn";

const THEMES: Record<string, [string, string, string]> = {
  indigo: ["#1e1b4b", "#4f46e5", "#22d3ee"],
  cyan: ["#083344", "#0891b2", "#a5f3fc"],
  emerald: ["#022c22", "#059669", "#a7f3d0"],
  amber: ["#451a03", "#d97706", "#fde68a"],
  rose: ["#4c0519", "#e11d48", "#fecdd3"],
  violet: ["#2e1065", "#7c3aed", "#f0abfc"],
};

export const BANNER_THEMES = Object.keys(THEMES);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function BannerArt({ seed, theme = "indigo", className, label }: { seed: string; theme?: string; className?: string; label?: string }) {
  const [bg, mid, hi] = THEMES[theme] ?? THEMES.indigo;
  const rnd = hash(seed);
  const id = `b${Math.floor(rnd() * 1e9)}`;
  const nodes = Array.from({ length: 9 }, () => ({ x: 20 + rnd() * 360, y: 15 + rnd() * 170, r: 1.5 + rnd() * 3 }));
  const rings = Array.from({ length: 3 }, () => ({ x: rnd() * 400, y: rnd() * 200, r: 40 + rnd() * 90 }));
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="0.8" cy="0.2" r="0.7">
          <stop offset="0" stopColor={hi} stopOpacity="0.55" />
          <stop offset="1" stopColor={hi} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-p`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#fff" strokeOpacity="0.07" />
        </pattern>
      </defs>
      <rect width="400" height="200" fill={`url(#${id}-g)`} />
      <rect width="400" height="200" fill={`url(#${id}-p)`} />
      <rect width="400" height="200" fill={`url(#${id}-r)`} />
      {rings.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="none" stroke="#fff" strokeOpacity={0.12 + i * 0.04} strokeWidth="1" />
      ))}
      {nodes.slice(1).map((n, i) => (
        <line key={`l${i}`} x1={nodes[i].x} y1={nodes[i].y} x2={n.x} y2={n.y} stroke={hi} strokeOpacity="0.35" strokeWidth="0.8" />
      ))}
      {nodes.map((n, i) => (
        <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} fill={i % 3 === 0 ? hi : "#fff"} fillOpacity={0.85} />
      ))}
      <path d="M330 150 l22 22 -22 22 -22 -22Z" fill="#fff" fillOpacity="0.1" />
    </svg>
  );
}
