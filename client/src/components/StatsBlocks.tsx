import { useState } from "react";
import { CHANNELS, gradeArtist, leansOn, statusFor } from "../lib/grading";
import { andList, fmtDay, windowFor } from "../lib/format";
import { num } from "../lib/csv";
import { CATEGORIES } from "../lib/categories";
import type { MonthMetrics, PressItem } from "../lib/types";

/** Shared by the Artist tab and each Band tab of the artist panel. */

type NumKey = "ytSubs" | "ytVids" | "ytViews" | "ytQual" | "igFollowers" | "igPosts" | "igEng" | "fbFollowers" | "fbPosts" | "fbEng" |
  "gscClicks" | "gscImpr" | "adClicks" | "adConv" | "adRev" | "spListeners";

/** Every number the grading engine reads, grouped the way the imports are.
 * A blank field means "no data" (the channel is greyed out and not scored);
 * 0 means "we checked, and it was zero" — the grading treats those differently. */
const FIELD_GROUPS: { label: string; fields: { k: NumKey; label: string }[] }[] = [
  { label: "Instagram", fields: [
    { k: "igFollowers", label: "Followers" }, { k: "igPosts", label: "Posts" }, { k: "igEng", label: "Engagement (likes + comments)" },
  ] },
  { label: "Meta (Facebook)", fields: [
    { k: "fbFollowers", label: "Followers" }, { k: "fbPosts", label: "Posts" }, { k: "fbEng", label: "Engagement (reactions + comments)" },
  ] },
  { label: "YouTube", fields: [
    { k: "ytSubs", label: "Subscribers" }, { k: "ytVids", label: "Uploads (videos, Shorts, live)" },
    { k: "ytViews", label: "Views" }, { k: "ytQual", label: "Qualified views" },
  ] },
  { label: "Spotify", fields: [
    { k: "spListeners", label: "Monthly listeners" },
  ] },
  { label: "Search", fields: [
    { k: "gscClicks", label: "Clicks" }, { k: "gscImpr", label: "Impressions" },
  ] },
  { label: "Affiliate (pilot, not scored)", fields: [
    { k: "adClicks", label: "Clicks" }, { k: "adConv", label: "Sales" }, { k: "adRev", label: "Commission (kr)" },
  ] },
];
const NUM_KEYS = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.k));

function draftFrom(m: MonthMetrics): Record<NumKey, string> {
  const d = {} as Record<NumKey, string>;
  NUM_KEYS.forEach((k) => { d[k] = m[k] != null ? String(m[k]) : ""; });
  return d;
}

type Graded = ReturnType<typeof gradeArtist>;

/** Score line, weighting line, and the per-channel breakdown. */
export function ChannelSummary({ g, prev, category, mainPlatform, emptyHint }: {
  g: Graded; prev: Graded; category?: string; mainPlatform?: string; emptyHint: string;
}) {
  const st = g.score == null ? null : statusFor(g.score);
  return (
    <>
      {st ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span className={`pill ${st.k}`} style={{ fontSize: 11 }}>{st.l}</span>
          <span className="sub" style={{ margin: 0, fontSize: 12.5 }}>{Math.round(g.score as number)} / 100 · graded on {g.graded} of {CHANNELS.length} channels · {st.d}</span>
        </div>
      ) : null}
      <p className="sub weighting">
        {category
          ? <>Weighted as <b>{CATEGORIES.find((c) => c.k === category)?.label}</b> — {andList(leansOn(category))} count{leansOn(category).length === 1 ? "s" : ""} most.</>
          : <>Standard weighting — set a Type on the Artist tab to weight for a Live Artist (Spotify-led) or Influencer (social-led).</>}
      </p>
      {!st ? <p className="sub" style={{ marginBottom: 14 }}>{emptyHint}</p> : null}

      <div className="chdet">
        {CHANNELS.map((c) => {
          const cc = g.cells[c.k], pc = prev.cells[c.k];
          const moved = cc.g !== "none" && pc.g !== "none" && cc.g !== pc.g;
          return (
            <div className={`chd${mainPlatform === c.k ? " main" : ""}`} key={c.k}>
              <span className="chdn">{c.label}{mainPlatform === c.k ? <span className="mainbadge">Main</span> : null}</span>
              <span className={`chdg ${cc.g}`}>{cc.g === "none" ? "—" : cc.g}</span>
              <span className="chdv">{cc.g === "none" ? <span className="dim">{cc.v === "no data" ? "no data yet" : cc.v}</span> : <>{cc.v}{moved ? <span className="dim"> (was {pc.g})</span> : null}</>}</span>
            </div>
          );
        })}
        <div className="chd">
          <span className="chdn">Affiliate</span>
          <span className={`chdg ${g.aff.g}`}>{g.aff.g === "none" ? "pilot" : g.aff.g}</span>
          <span className="chdv">{g.aff.v} <span className="dim">· not scored</span></span>
        </div>
      </div>
    </>
  );
}

/** "Recorded in" month picker plus every number field and press, for one
 * month. Render with a `key` that changes with the month (and after a sync)
 * so the fields reload from `initial`. */
export function NumbersForm({ editMonth, onMonthChange, initial, onSave }: {
  editMonth: string;
  onMonthChange: (month: string) => void;
  initial: MonthMetrics;
  onSave: (month: string, next: MonthMetrics) => void;
}) {
  const [draft, setDraft] = useState<Record<NumKey, string>>(() => draftFrom(initial));
  const [press, setPress] = useState<PressItem[]>(() => (initial.press || []).map((p) => ({ ...p })));
  const [numMsg, setNumMsg] = useState("");
  const win = windowFor(editMonth);

  function saveNumbers() {
    const next: MonthMetrics = { ...initial };
    NUM_KEYS.forEach((k) => {
      const s = draft[k].trim();
      if (s === "") delete next[k]; else next[k] = num(s);
    });
    // Keep the qualification rate consistent with hand-edited views — the
    // YouTube import derives it the same way when the CSV doesn't carry one.
    if (next.ytViews !== initial.ytViews || next.ytQual !== initial.ytQual) {
      if (next.ytViews) next.ytRate = (next.ytQual || 0) / next.ytViews; else delete next.ytRate;
    }
    const cleanPress = press
      .map((p) => ({ h: p.h.trim().slice(0, 140), o: p.o.trim().slice(0, 60), u: p.u.trim().slice(0, 300) }))
      .filter((p) => p.h);
    if (cleanPress.length) next.press = cleanPress; else delete next.press;
    next.asOf = win.end;
    onSave(editMonth, next);
    setNumMsg(`Saved — past 30 days to ${fmtDay(win.end)}.`);
  }

  return (
    <>
      <div className="numhead">
        <div className="eyebrow">Recorded in</div>
        <input type="month" className="inl" aria-label="Month to edit" value={editMonth}
          onChange={(e) => { if (e.target.value) onMonthChange(e.target.value); }} />
      </div>
      <p className="sub" style={{ fontSize: 12 }}>
        Posts, videos, views, engagement, clicks and sales cover the <b className="win">past 30 days, {fmtDay(win.start)} – {fmtDay(win.end)}</b>.
        Followers, subscribers and listeners are the count on {fmtDay(win.end)}.
        {initial.asOf ? <> Last recorded {fmtDay(initial.asOf)}.</> : null}
      </p>
      <p className="sub" style={{ fontSize: 12, marginTop: 4 }}>Leave a field blank if you don't know it — blank is "no data" and isn't scored. Enter 0 only when it really was zero.</p>

      {FIELD_GROUPS.map((grp) => (
        <fieldset className="numgrp" key={grp.label}>
          <legend>{grp.label}</legend>
          <div className="numgrid">
            {grp.fields.map((f) => (
              <div className="fld" key={f.k}>
                <label htmlFor={`n-${f.k}`}>{f.label}</label>
                <input id={`n-${f.k}`} inputMode="decimal" autoComplete="off" placeholder="–" value={draft[f.k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset className="numgrp">
        <legend>Press, past 30 days (shown, not scored)</legend>
        {press.map((p, i) => (
          <div className="pressrow" key={i}>
            <input aria-label="Headline" placeholder="Headline" value={p.h} onChange={(e) => setPress((ps) => ps.map((x, j) => j === i ? { ...x, h: e.target.value } : x))} />
            <input aria-label="Outlet" placeholder="Outlet" value={p.o} onChange={(e) => setPress((ps) => ps.map((x, j) => j === i ? { ...x, o: e.target.value } : x))} />
            <input aria-label="URL" placeholder="URL" value={p.u} onChange={(e) => setPress((ps) => ps.map((x, j) => j === i ? { ...x, u: e.target.value } : x))} />
            <button type="button" className="rm" aria-label="Remove press item" onClick={() => setPress((ps) => ps.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        {press.length < 6 && (
          <button type="button" className="addbtn" onClick={() => setPress((ps) => [...ps, { h: "", o: "", u: "" }])}>+ Add press item</button>
        )}
      </fieldset>

      <div className="btnrow"><button className="btn" onClick={saveNumbers}>Save numbers</button></div>
      <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>{numMsg}</p>
    </>
  );
}
