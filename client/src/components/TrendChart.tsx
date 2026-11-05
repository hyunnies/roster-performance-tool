import { compact } from "../lib/format";
import { totals } from "../lib/grading";
import type { Metrics } from "../lib/types";

interface Props { metrics: Metrics }

const SERIES: { k: "gscClicks" | "ytQual" | "adConv"; c: string; l: string }[] = [
  { k: "gscClicks", c: "var(--brand)", l: "Search clicks" },
  { k: "ytQual", c: "var(--reach)", l: "Qualified views" },
  { k: "adConv", c: "var(--wide)", l: "Affiliate sales" },
];

export default function TrendChart({ metrics }: Props) {
  const months = Object.keys(metrics).sort();
  if (months.length < 2) {
    return <div className="empty">One snapshot is a dot, not a trend. Record a second month and this becomes a line.</div>;
  }
  const W = 880, H = 230, L = 20, R = 70, T = 16, B = 32;
  const iw = W - L - R, ih = H - T - B;

  const paths = SERIES.map((se) => {
    const vals = months.map((m) => totals(metrics, m)[se.k]);
    const mx = Math.max(...vals) || 1;
    if (!mx) return null;
    const pts = vals.map((v, i) => [L + (months.length === 1 ? iw / 2 : i * (iw / (months.length - 1))), T + ih - (v / mx) * ih * 0.9] as const);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    return { se, d, pts, last, lastVal: vals[vals.length - 1] };
  }).filter(Boolean) as { se: typeof SERIES[number]; d: string; pts: readonly (readonly [number, number])[]; last: readonly [number, number]; lastVal: number }[];

  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
        {SERIES.map((se) => (
          <span key={se.k}><i style={{ display: "inline-block", width: 14, height: 3, borderRadius: 2, background: se.c, verticalAlign: "middle", marginRight: 6 }} />{se.l}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly trend" style={{ width: "100%", height: "auto", display: "block" }}>
        {paths.map(({ se, d, pts, last, lastVal }) => (
          <g key={se.k}>
            <path d={d} fill="none" stroke={se.c} strokeWidth={2.5} strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={3.5} fill={se.c} />)}
            <text x={last[0] + 8} y={(last[1] + 4).toFixed(1)} fontSize={10.5} fontWeight={600} fontFamily="Familjen Grotesk, sans-serif" fill={se.c}>{compact(lastVal)}</text>
          </g>
        ))}
        <line x1={L} y1={T + ih} x2={W - R} y2={T + ih} stroke="var(--rule)" strokeWidth={1} />
        {months.map((m, i) => {
          const x = L + (months.length === 1 ? iw / 2 : i * (iw / (months.length - 1)));
          return <text key={m} x={x.toFixed(1)} y={T + ih + 17} textAnchor="middle" fontSize={10} fontFamily="IBM Plex Mono, monospace" fill="var(--muted)">{m.slice(2)}</text>;
        })}
      </svg>
      <p className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>Each line is scaled to its own maximum — read the shape, not the height against the others.</p>
    </div>
  );
}
