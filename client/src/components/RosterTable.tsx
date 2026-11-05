import { useMemo, useState } from "react";
import { medianSupported, readOut, rosterArray, statusFor, supported } from "../lib/grading";
import { TIER_LABEL, windowLabel } from "../lib/format";
import SyncAllButton, { type SyncMsg } from "./SyncAllButton";
import { CATEGORIES, CATEGORY_LABEL } from "../lib/categories";
import type { GradedArtist, Metrics, Roster } from "../lib/types";

interface Props { roster: Roster; metrics: Metrics; month: string | null; onOpen: (name: string) => void }

const DOT: Record<string, string> = { strong: "g", ok: "y", weak: "y", silent: "r", none: "n" };

function Cell({ c, noneLabel, main }: { c: { g: string; v: string }; noneLabel?: string; main?: boolean }) {
  return (
    <td className={`ch ${c.g}${main ? " main" : ""}`}>
      {main && <span className="mainbadge">Main</span>}
      <span className={`dot ${DOT[c.g]}`} />
      <span className="chv">{c.g === "none" ? <span className="dim">{noneLabel || c.v || "no data"}</span> : c.v}</span>
    </td>
  );
}


/** The data columns, left to right. Header and row cells both render from
 * this, so they can't drift out of line. Affiliate is shown
 * but never scored. */
const COLS: { k: string; label: string; sort: string; sub?: string }[] = [
  { k: "Instagram", label: "Instagram", sort: "gInstagram" },
  { k: "Meta", label: "Meta", sort: "gMeta", sub: "Facebook" },
  { k: "Youtube", label: "YouTube", sort: "gYoutube" },
  { k: "spotify", label: "Spotify", sort: "gspotify", sub: "listener trend" },
  { k: "Search", label: "Search", sort: "gSearch" },
  { k: "affiliate", label: "Affiliate", sort: "gAffiliate", sub: "pilot, not scored" },
];

function RowCells({ a }: { a: GradedArtist }) {
  const st = a.score == null ? null : statusFor(a.score);
  const r = readOut(a);
  return (
    <>
      <td className="nm">{a.name}<span className="rg">{TIER_LABEL[a.tier] || a.tier}{a.region ? ` · ${a.region}` : ""}</span>{a.category ? <span className={`cat ${a.category}`}>{CATEGORY_LABEL[a.category] || a.category}</span> : null}</td>
      <td className="dec">
        {st ? (
          <>
            <span className={`pill ${st.k}`}>{st.l}</span>
            <span className="gr">
              {Math.round(a.score as number)}
              {a.delta != null ? <span className={a.delta > 3 ? "up" : a.delta < -3 ? "down" : "flat"}> {a.delta > 0 ? "+" : a.delta < 0 ? "−" : "±"}{Math.round(Math.abs(a.delta))}</span> : null}
            </span>
          </>
        ) : <span className="dim">no data</span>}
      </td>
      {COLS.map((c) => c.k === "affiliate" ? <Cell key={c.k} c={a.aff} noneLabel="not in the pilot" />
        : <Cell key={c.k} c={a.cells[c.k]} main={a.mainPlatform === c.k} />)}
      <td className={`cmt${r.own ? " own" : ""}`}>{r.t}</td>
    </>
  );
}

export default function RosterTable({ roster, metrics, month, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [region, setRegion] = useState("");
  const [cat, setCat] = useState("");
  const [watchOnly, setWatchOnly] = useState(false);
  const [sortK, setSortK] = useState<keyof GradedArtist | "score">("score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [showBlank, setShowBlank] = useState(true);
  const [syncMsg, setSyncMsg] = useState<SyncMsg | null>(null);

  const all = useMemo(() => rosterArray(roster, metrics, month), [roster, metrics, month]);
  const regionOpts = useMemo(() => {
    const set = new Set<string>();
    all.forEach((a) => { if (a.region) set.add(a.region); });
    return Array.from(set).sort();
  }, [all]);

  let rows = all.filter((a) => {
    if (a.status !== "A") return false;
    if (tier === "ALL") { /* everyone */ }
    else if (tier) { if (a.tier !== tier) return false; }
    else if (!supported(a)) return false;
    if (q && a.name.toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
    if (region && a.region !== region) return false;
    if (cat === "none" ? a.category : cat && a.category !== cat) return false;
    if (watchOnly) { if (a.score == null || a.score >= 46) return false; }
    return true;
  });
  rows = rows.slice().sort((x, y) => {
    let p: unknown = (x as unknown as Record<string, unknown>)[sortK as string];
    let r: unknown = (y as unknown as Record<string, unknown>)[sortK as string];
    if (p == null) p = -1;
    if (r == null) r = -1;
    if (typeof p === "string") return sortDir * String(p).localeCompare(String(r));
    return sortDir * (((p as number) || 0) - ((r as number) || 0));
  });

  const med = medianSupported(all);
  let stand: GradedArtist[] = [];
  if (!tier && !watchOnly && med != null) {
    stand = all.filter((a) => a.status === "A" && !supported(a) && a.score != null && (a.score as number) > med &&
      (!q || a.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && (!region || a.region === region))
      .sort((x, y) => (y.score as number) - (x.score as number)).slice(0, 6);
  }

  const blank = rows.filter((a) => a.score == null);
  const scored = rows.filter((a) => a.score != null);

  function sortBy(k: string) {
    if (k === sortK) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortK(k as keyof GradedArtist); setSortDir(k === "name" ? 1 : -1); }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 className="sec" style={{ margin: 0 }}>Active artist roster</h2>
        <span className="sub" style={{ margin: 0 }}>
          {rows.length} collaborations{month ? ` · past 30 days (${windowLabel(month)})` : ""}{stand.length ? ` · ${stand.length} standing out from lower tiers` : ""}
        </span>
      </div>
      <div className="filters">
        <input type="search" placeholder="Search a name" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Tier 1 and 2</option><option value="T1">Tier 1 only</option><option value="T2">Tier 2 only</option><option value="ALL">Everyone</option>
        </select>
        <select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {regionOpts.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select aria-label="Artist type" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All types</option>
          {CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          <option value="none">Not categorised</option>
        </select>
        <button className="chipbtn" aria-pressed={watchOnly} onClick={() => setWatchOnly((v) => !v)}>Only the ones to question</button>
        <SyncAllButton onResult={setSyncMsg} />
        <span className="legend">
          <span><i className="dot g" />working</span>
          <span><i className="dot y" />some</span>
          <span><i className="dot r" />nothing</span>
          <span><i className="dot n" />no data</span>
        </span>
      </div>
      {syncMsg && <p className={`prev${syncMsg.ok ? "" : " err"}`} style={{ margin: "-4px 0 12px", maxWidth: "80ch" }}>{syncMsg.t}</p>}
      <div className="tbl tall">
        <table>
          <thead>
            <tr>
              <th onClick={() => sortBy("name")} aria-sort={sortK === "name" ? (sortDir === 1 ? "ascending" : "descending") : undefined}>Artist</th>
              <th onClick={() => sortBy("score")} aria-sort={sortK === "score" ? (sortDir === 1 ? "ascending" : "descending") : undefined}>Decision</th>
              {COLS.map((c) => (
                <th key={c.k} className="chh" onClick={() => sortBy(c.sort)} aria-sort={sortK === c.sort ? (sortDir === 1 ? "ascending" : "descending") : undefined}>
                  {c.label}{c.sub ? <span className="th2">{c.sub}</span> : null}
                </th>
              ))}
              <th className="cmt" onClick={() => sortBy("score")}>Comment</th>
            </tr>
          </thead>
          <tbody>
            {!scored.length && !stand.length && !blank.length && (
              <tr><td colSpan={9}><div className="empty">Nothing matches those filters.</div></td></tr>
            )}
            {scored.map((a) => <tr key={a.name} onClick={() => onOpen(a.name)}><RowCells a={a} /></tr>)}
            {!scored.length && (blank.length || stand.length) && (
              <tr><td colSpan={9}><div className="empty">No imported numbers for anyone in this view yet.</div></td></tr>
            )}
            {stand.length > 0 && (
              <>
                <tr className="sep"><td colSpan={9}>Up and coming — tier 3 and below, beating the Tier 1–2 median of {Math.round(med as number)}</td></tr>
                {stand.map((a) => <tr className="below" key={a.name} onClick={() => onOpen(a.name)}><RowCells a={a} /></tr>)}
              </>
            )}
            {blank.length > 0 && (
              <>
                <tr className="sep more" onClick={() => setShowBlank((v) => !v)}>
                  <td colSpan={9}>
                    {showBlank ? "▾ " : "▸ "}{blank.length} with nothing recorded for the past 30 days
                    {showBlank ? " — listed below, and not a judgement on them" : ` — ${blank.map((a) => a.name).slice(0, 7).join(", ")}${blank.length > 7 ? ` and ${blank.length - 7} more` : ""}`}
                  </td>
                </tr>
                {showBlank && blank.map((a) => <tr className="below" key={a.name} onClick={() => onOpen(a.name)}><RowCells a={a} /></tr>)}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ fontSize: 11.5, marginTop: 9 }}>Click any artist for the full picture — the numbers behind
        each grade, press, last month's score, and a place to write your own comment. A channel with nothing recorded is
        grey and does not count against the decision. Affiliate and press are shown but never scored. How much each channel counts depends on the artist's Type — Spotify carries a Live Artist, social carries an Influencer.</p>
    </div>
  );
}
