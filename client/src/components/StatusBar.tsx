import { STATUS, rosterArray, statusFor, supported, totals } from "../lib/grading";
import { compact, grp } from "../lib/format";
import type { Metrics, Roster } from "../lib/types";

interface Props {
  roster: Roster; metrics: Metrics; month: string | null;
  months: string[]; onMonthChange: (m: string) => void;
}

export default function StatusBar({ roster, metrics, month, months, onMonthChange }: Props) {
  const arr = rosterArray(roster, metrics, month).filter((a) => supported(a) && a.status === "A");
  const counts: Record<string, number> = { bet: 0, working: 0, watch: 0, question: 0, ungraded: 0 };
  arr.forEach((a) => { if (a.score == null) counts.ungraded++; else counts[statusFor(a.score).k]++; });
  const total = arr.length || 1;
  const t = totals(metrics, month);

  const colorFor = (k: string) => k === "bet" ? "var(--good)" : k === "working" ? "var(--reach)" : k === "watch" ? "var(--warn)" : "var(--crit)";

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 className="sec" style={{ margin: 0 }}>Collaboration status</h2>
        <select className="inl" style={{ fontSize: 13, padding: "6px 9px" }} value={month || ""} onChange={(e) => onMonthChange(e.target.value)}>
          {months.length ? months.map((m) => <option key={m} value={m}>{m}</option>) : <option>no data yet</option>}
        </select>
      </div>
      {!months.length ? (
        <div className="empty" style={{ border: "1px solid var(--hair)", borderRadius: 6, background: "var(--surface)" }}>
          No numbers imported yet. Use the Import buttons below and this fills in.
        </div>
      ) : (
        <div className="statusbar">
          <div className="sbwrap">
            <div className="sbmain">
              <div className="eyebrow">{arr.length} active collaborations in tiers 1 and 2</div>
              <div className="sbbar">
                {STATUS.map((st) => counts[st.k] ? <i key={st.k} style={{ width: `${(counts[st.k] / total) * 100}%`, background: colorFor(st.k) }} title={`${st.l}: ${counts[st.k]}`} /> : null)}
                {counts.ungraded ? <i style={{ width: `${(counts.ungraded / total) * 100}%`, background: "var(--sunk)" }} /> : null}
              </div>
              <div className="sblegend">
                {STATUS.map((st) => (
                  <span key={st.k} style={!counts[st.k] ? { opacity: 0.4 } : undefined}>
                    <i style={{ background: colorFor(st.k) }} /><b>{counts[st.k]}</b> {st.l}
                  </span>
                ))}
                {counts.ungraded ? <span style={{ color: "var(--muted)" }}><i style={{ background: "var(--sunk)" }} /><b>{counts.ungraded}</b> no data</span> : null}
              </div>
            </div>
            <div className="sbnums">
              <div className="sbn"><div className="sbl">Instagram engagement</div><div className="sbv num">{t.igEng ? compact(t.igEng) : "–"}</div></div>
              <div className="sbn"><div className="sbl">Meta engagement</div><div className="sbv num">{t.fbEng ? compact(t.fbEng) : "–"}</div></div>
              <div className="sbn"><div className="sbl">Press, past 30 days</div><div className="sbv num">{t.press ? grp(t.press) : "–"}</div></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
