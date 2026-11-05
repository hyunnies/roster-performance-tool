import { CHANNELS, STATUS, rosterArray, statusFor, supported, totals } from "../lib/grading";
import { compact, grp, today, windowLabel } from "../lib/format";
import type { Metrics, Roster } from "../lib/types";

interface Props { roster: Roster; metrics: Metrics; month: string | null }

export default function ExportSummaryButton({ roster, metrics, month }: Props) {
  function go() {
    const arr = rosterArray(roster, metrics, month).filter((a) => supported(a) && a.status === "A");
    const t = totals(metrics, month);
    const L: string[] = [`Artist collaborations — ${month ? `past 30 days, ${windowLabel(month)}` : "no data"}  (exported ${today()})`, ""];
    L.push(
      `Qualified views ${t.ytQual ? compact(t.ytQual) : "–"}` +
      ` · Instagram engagement ${t.igEng ? compact(t.igEng) : "–"}` +
      ` · Meta engagement ${t.fbEng ? compact(t.fbEng) : "–"}` +
      ` · Search clicks ${t.gscClicks ? grp(t.gscClicks) : "–"}` +
      ` · Affiliate ${t.adConv ? grp(t.adConv) + " sales" : "–"}` +
      ` · Press ${t.press ? grp(t.press) : "–"}`
    );
    L.push("");
    STATUS.forEach((st) => {
      const g = arr.filter((a) => a.score != null && statusFor(a.score).k === st.k).sort((x, y) => (y.score as number) - (x.score as number));
      if (!g.length) return;
      L.push(`${st.l.toUpperCase()} — ${st.d}  (${g.length})`);
      g.forEach((a) => {
        const strong = CHANNELS.filter((c) => a.cells[c.k].g === "strong").map((c) => c.label);
        const silent = CHANNELS.filter((c) => a.cells[c.k].g === "silent").map((c) => c.label);
        L.push(`  ${a.name}  [${Math.round(a.score as number)}]` +
          (strong.length ? `  strong: ${strong.join(", ")}` : "") +
          (silent.length ? `  silent: ${silent.join(", ")}` : "") +
          (a.spListeners >= 0 ? `  spotify: ${compact(a.spListeners) === "–" ? "0" : compact(a.spListeners)} listeners` : "") +
          (a.press.length ? `  press: ${a.press.length}` : ""));
        a.press.forEach((x) => L.push(`        → ${x.h}${x.o ? `  (${x.o})` : ""}`));
      });
      L.push("");
    });
    const ng = arr.filter((a) => a.score == null);
    if (ng.length) L.push(`NO DATA (${ng.length}): ${ng.map((a) => a.name).join(", ")}\n`);

    const blob = new Blob([L.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `collaboration-status-${month || today()}.txt`;
    el.click();
    URL.revokeObjectURL(url);
  }

  return <button className="btn ghost" style={{ marginLeft: "auto", padding: "8px 14px", fontSize: 13 }} onClick={go}>Export the summary</button>;
}
