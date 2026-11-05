import type { ReactNode } from "react";
import { compact, grp, n2 } from "../lib/format";
import { growthRead, rosterArray } from "../lib/grading";
import type { Metrics, Roster } from "../lib/types";

interface Props { roster: Roster; metrics: Metrics; month: string | null }

function fact(l: string, v: string, n: string, col?: string) {
  return (
    <div className="vfact" key={l}>
      <div className="vl">{l}</div>
      <div className="vv" style={col ? { color: col } : undefined}>{v}</div>
      <div className="vn">{n}</div>
    </div>
  );
}
function dir(d: number | null): [string, string] {
  if (d == null) return ["–", "no previous snapshot"];
  return [(d >= 0 ? "+" : "−") + n2(Math.abs(d), 0) + " %", d >= 0 ? "up on last month's snapshot" : "down on last month's snapshot"];
}

export default function VerdictBand({ roster, metrics, month }: Props) {
  const g = growthRead(roster, metrics, month);
  if (!g) {
    return (
      <div className="verdict" style={{ ["--vc" as string]: "var(--rule)" }}>
        <div className="eyebrow">The programme as a growth engine</div>
        <h3 className="vhead">No numbers imported yet.</h3>
        <p className="vbody">Enter numbers on an artist, or use the import buttons further down — a 30-day snapshot from Instagram,
          Meta, YouTube, Search Console and AdTraction — and this opens with a verdict instead of an empty page.</p>
      </div>
    );
  }
  const vc = g.k === "good" ? "var(--good)" : g.k === "warm" ? "var(--wide)" : "var(--crit)";
  const ds = dir(g.dSearch);

  let conc: ReactNode = null;
  if (g.cSearch && g.cSearch.tot) {
    const top3 = g.cSearch.top.reduce((a, b) => a + b, 0);
    const rest = g.cSearch.tot - top3;
    const names = g.scored.slice().sort((x, y) => (y.m.gscClicks || 0) - (x.m.gscClicks || 0))
      .slice(0, 3).filter((a) => (a.m.gscClicks || 0) > 0).map((a) => a.name);
    conc = (
      <div className="conc">
        <div className="concbar">
          <i style={{ width: `${(top3 / g.cSearch.tot) * 100}%`, background: "var(--brand)" }} />
          <i style={{ width: `${(rest / g.cSearch.tot) * 100}%`, background: "var(--sunk)" }} />
        </div>
        <div className="conclab">
          <span><i style={{ background: "var(--brand)" }} /><b>{n2((top3 / g.cSearch.tot) * 100, 0)} %</b>&nbsp;from {names.join(", ")}</span>
          <span><i style={{ background: "var(--sunk)" }} />{n2((rest / g.cSearch.tot) * 100, 0)} % from everyone else</span>
          <span style={{ color: "var(--muted)" }}>share of artist-linked search clicks</span>
        </div>
      </div>
    );
  }

  return (
    <div className="verdict" style={{ ["--vc" as string]: vc }}>
      <div className="eyebrow">The programme as a growth engine</div>
      <h3 className="vhead">{g.h}</h3>
      <p className="vbody" dangerouslySetInnerHTML={{ __html: g.body }} />
      <div className="vfacts">
        {fact("Producing", `${g.producing} of ${g.supN}`, "supported collaborations with something to show",
          g.producing / g.supN >= 0.55 ? "var(--good-ink)" : g.producing / g.supN < 0.3 ? "var(--crit-ink)" : "var(--warn-ink)")}
        {fact("Artist-linked search", g.t.gscClicks ? grp(g.t.gscClicks) : "–", `${ds[1]} (${ds[0]})`)}
        {fact("Qualified reach", g.t.ytQual ? compact(g.t.ytQual) : "–", `${dir(g.dViews)[1]} (${dir(g.dViews)[0]})`)}
        {fact("Affiliate sales", g.t.adConv ? grp(g.t.adConv) : "–", "pilot — a few artists only")}
      </div>
      {conc}
    </div>
  );
}

// re-exported so App.tsx can compute months list without recomputing rosterArray elsewhere
export { rosterArray };
