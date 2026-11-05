import { useState } from "react";
import { gradeArtist } from "../lib/grading";
import { prevMonth, thisMonth, toHref } from "../lib/format";
import { PROFILE_LINKS, type LinkKey } from "../lib/categories";
import { ChannelSummary, NumbersForm } from "./StatsBlocks";
import type { ArtistMeta, Band, Metrics, Roster } from "../lib/types";

interface Props {
  band: Band;
  artist: ArtistMeta;
  /** dashboard month, used as the starting "Recorded in" month */
  month: string | null;
  onSave: (band: Band) => void;
  onRemove: () => void;
}

const BAND_KEY = "__band";

/** One band's tab in the artist panel: the same stats as the artist, minus
 * Sync. Render with key={band.id} so switching bands resets the fields. */
export default function BandPanel({ band, artist, month, onSave, onRemove }: Props) {
  const [name, setName] = useState(band.name);
  const [link, setLink] = useState(band.link);
  const [links, setLinks] = useState<Record<LinkKey, string>>({ ig: band.ig || "", fb: band.fb || "", yt: band.yt || "", sp: band.sp || "" });
  const [editMonth, setEditMonth] = useState(month || thisMonth());
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Grade the band with the same engine as artists: its numbers stand in for
  // an artist's, and the artist's Type sets the weighting.
  const bandMetrics: Metrics = Object.fromEntries(Object.entries(band.metrics || {}).map(([mo, m]) => [mo, { [BAND_KEY]: m }]));
  const asRoster: Roster = { [BAND_KEY]: { ...artist, mainPlatform: undefined } };
  const g = gradeArtist(asRoster, bandMetrics, BAND_KEY, editMonth);
  const prev = gradeArtist(asRoster, bandMetrics, BAND_KEY, prevMonth(editMonth));

  /** Name, link and profile links save when a field loses focus. */
  function saveDetails() {
    const next: Band = { ...band, name: name.trim(), link: link.trim() };
    PROFILE_LINKS.forEach((l) => { const v = links[l.k].trim(); if (v) next[l.k] = v; else delete next[l.k]; });
    const same = next.name === band.name && next.link === band.link && PROFILE_LINKS.every((l) => (next[l.k] || "") === (band[l.k] || ""));
    if (!same) onSave(next);
  }

  const bandHref = toHref(link);
  return (
    <div className="bandpanel">
      <div className="numgrid bandtop">
        <div className="fld"><label htmlFor="b-name">Band name</label>
          <input id="b-name" value={name} placeholder="band or project name" onChange={(e) => setName(e.target.value)} onBlur={saveDetails} />
        </div>
        <div className="fld"><label htmlFor="b-link">Band link{bandHref ? <a className="openlink" href={bandHref} target="_blank" rel="noreferrer">open ↗</a> : null}</label>
          <input id="b-link" value={link} placeholder="website, Spotify, Instagram…" autoComplete="off" spellCheck={false}
            onChange={(e) => setLink(e.target.value)} onBlur={saveDetails} />
        </div>
      </div>

      <fieldset className="numgrp links">
        <legend>Profile links</legend>
        <div className="numgrid">
          {PROFILE_LINKS.map((l) => {
            const href = toHref(links[l.k]);
            return (
              <div className="fld" key={l.k}>
                <label htmlFor={`bl-${l.k}`}>{l.label}{href ? <a className="openlink" href={href} target="_blank" rel="noreferrer">open ↗</a> : null}</label>
                <input id={`bl-${l.k}`} value={links[l.k]} placeholder={l.placeholder} autoComplete="off" spellCheck={false}
                  onChange={(e) => setLinks((s) => ({ ...s, [l.k]: e.target.value }))} onBlur={saveDetails} />
              </div>
            );
          })}
        </div>
      </fieldset>

      <div style={{ marginTop: 18 }}>
        <ChannelSummary g={g} prev={prev} category={artist.category}
          emptyHint={`Nothing recorded for ${band.name || "this band"} for the past 30 days yet — enter numbers below.`} />
      </div>

      <NumbersForm key={editMonth} editMonth={editMonth} onMonthChange={setEditMonth}
        initial={band.metrics?.[editMonth] || {}}
        onSave={(mo, next) => onSave({ ...band, metrics: { ...(band.metrics || {}), [mo]: next } })} />

      <div className="bandremove">
        {confirmRemove ? (
          <>
            <span className="dim">Remove {band.name || "this band"} and all its numbers?</span>
            <button type="button" className="btn sm danger" onClick={onRemove}>Remove band</button>
            <button type="button" className="btn ghost sm" onClick={() => setConfirmRemove(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => setConfirmRemove(true)}>Remove band</button>
        )}
      </div>
    </div>
  );
}
