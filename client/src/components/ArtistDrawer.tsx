import { useLayoutEffect, useState } from "react";
import { gradeArtist } from "../lib/grading";
import { TIER_LABEL, thisMonth, toHref } from "../lib/format";
import { syncArtist } from "../lib/api";
import SyncTip from "./SyncTip";
import ContractsSection from "./ContractsSection";
import BandPanel from "./BandPanel";
import { ChannelSummary, NumbersForm } from "./StatsBlocks";
import { CATEGORIES, PLATFORMS, PROFILE_LINKS, type LinkKey } from "../lib/categories";
import type { ArtistMeta, Band, Contract, Metrics, MonthMetrics, Roster } from "../lib/types";

interface Props {
  name: string | null;
  roster: Roster; metrics: Metrics; month: string | null; prevMonth: string | null;
  onClose: () => void;
  onSave: (name: string, patch: Partial<ArtistMeta>) => void;
  onSaveMetrics: (name: string, month: string, m: MonthMetrics) => void;
  onSynced: (metrics: Metrics, month: string) => void;
  contracts: Contract[];
  onContractsChange: (contracts: Contract[]) => void;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The artist's bands, each with an id (older entries, including the original
 * single band/bandLink fields, get a stable one here and keep it once saved). */
function bandsOf(a: ArtistMeta): Band[] {
  const list = a.bands ?? (a.band || a.bandLink ? [{ name: a.band || "", link: a.bandLink || "" }] : []);
  return list.map((b, i) => (b.id ? b : { ...b, id: `band-${i + 1}` }));
}

export default function ArtistDrawer({ name, roster, metrics, month, prevMonth, onClose, onSave, onSaveMetrics, onSynced, contracts, onContractsChange }: Props) {
  const a = name ? roster[name] : null;
  const [tab, setTab] = useState<string>("artist");
  const [code, setCode] = useState("");
  const [links, setLinks] = useState<Record<LinkKey, string>>({ ig: "", fb: "", yt: "", sp: "" });
  const [note, setNote] = useState("");
  const [activities, setActivities] = useState("");
  const [msg, setMsg] = useState("");
  const [editMonth, setEditMonth] = useState(month || thisMonth());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [syncCount, setSyncCount] = useState(0); // remounts the numbers form after a sync

  // Layout effect: load the artist's saved values before the panel first
  // paints, so it never flashes empty fields.
  useLayoutEffect(() => {
    if (a) {
      setCode(a.code || ""); setNote(a.note || ""); setActivities(a.activities || ""); setMsg("");
      setLinks({ ig: a.ig || "", fb: a.fb || "", yt: a.yt || "", sp: a.sp || "" });
    }
    setTab("artist");
    setEditMonth(month || thisMonth());
    setSyncMsg(null);
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!name || !a) return null;
  const bands = bandsOf(a);
  const activeBand = bands.find((b) => b.id === tab);
  const g = gradeArtist(roster, metrics, name, month);
  const prev = gradeArtist(roster, metrics, name, prevMonth);

  function save() {
    onSave(name as string, { code: code.trim(), activities, note });
    setMsg("Saved.");
  }

  function linksTrimmed(): Record<LinkKey, string> {
    return { ig: links.ig.trim(), fb: links.fb.trim(), yt: links.yt.trim(), sp: links.sp.trim() };
  }

  /** Saved when a field loses focus — like Type and Main platform, no Save button. */
  function saveLinks() {
    const t = linksTrimmed();
    if (PROFILE_LINKS.some((l) => t[l.k] !== ((a as NonNullable<typeof a>)[l.k] || ""))) onSave(name as string, t);
  }

  /** Bands save as a whole list; this also retires the old single-band fields. */
  function saveBands(list: Band[]) {
    onSave(name as string, { bands: list, band: undefined, bandLink: undefined });
  }
  function addBand() {
    const b: Band = { id: newId(), name: "", link: "" };
    saveBands([...bands, b]);
    setTab(b.id!);
  }

  async function sync() {
    setSyncing(true); setSyncMsg(null);
    try {
      saveLinks(); // make sure a link typed just now is kept, not only used once
      const r = await syncArtist(name as string, editMonth, linksTrimmed());
      setSyncMsg({ ok: true, t: r.message });
      if (r.metrics) {
        onSynced(r.metrics, editMonth);
        setSyncCount((n) => n + 1);
      }
    } catch (e) {
      setSyncMsg({ ok: false, t: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer">
        <button className="dclose" onClick={onClose}>Close</button>
        <div className="eyebrow">{TIER_LABEL[a.tier] || a.tier}{a.region ? ` · ${a.region}` : ""}</div>
        <h3 style={{ margin: "6px 0 12px" }}>{name}</h3>

        <div className="dtabs" role="tablist" aria-label="Artist and bands">
          <button type="button" role="tab" className="dtab" aria-selected={tab === "artist"} onClick={() => setTab("artist")}>Artist</button>
          {bands.map((b) => (
            <button type="button" role="tab" key={b.id} className="dtab" aria-selected={tab === b.id} onClick={() => setTab(b.id!)}>
              {b.name || "New band"}
            </button>
          ))}
          <button type="button" className="dtab add" onClick={addBand} title="Add a band this artist plays in">+ Band</button>
        </div>

        {activeBand ? (
          <BandPanel key={activeBand.id} band={activeBand} artist={a} month={month}
            onSave={(updated) => saveBands(bands.map((b) => (b.id === updated.id ? updated : b)))}
            onRemove={() => { saveBands(bands.filter((b) => b.id !== activeBand.id)); setTab("artist"); }} />
        ) : (
          <div role="tabpanel">
            <div className="classify">
              <div className="fld">
                <label htmlFor="d-cat">Type</label>
                <select id="d-cat" className={a.category ? `catsel ${a.category}` : "catsel"} value={a.category || ""}
                  onChange={(e) => onSave(name, { category: e.target.value || undefined })}>
                  <option value="">Not set</option>
                  {CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="d-main">Main platform</label>
                <select id="d-main" value={a.mainPlatform || ""}
                  onChange={(e) => onSave(name, { mainPlatform: e.target.value || undefined })}>
                  <option value="">Not set</option>
                  {PLATFORMS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <fieldset className="numgrp links">
              <legend>Profile links <span className="dim">· Sync opens these first</span></legend>
              <div className="numgrid">
                {PROFILE_LINKS.map((l) => {
                  const href = toHref(links[l.k]);
                  return (
                    <div className="fld" key={l.k}>
                      <label htmlFor={`l-${l.k}`}>{l.label}{href ? <a className="openlink" href={href} target="_blank" rel="noreferrer">open ↗</a> : null}</label>
                      <input id={`l-${l.k}`} value={links[l.k]} placeholder={l.placeholder} autoComplete="off" spellCheck={false}
                        onChange={(e) => setLinks((s) => ({ ...s, [l.k]: e.target.value }))} onBlur={saveLinks} />
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="syncrow" style={{ marginTop: 12 }}>
              <button className="btn ghost sm" onClick={sync} disabled={syncing}>{syncing ? "Looking up…" : "Sync stats"}</button>
              <SyncTip id="sync-tip" />
            </div>
            {syncMsg && <p className={`prev${syncMsg.ok ? "" : " err"}`} style={{ marginTop: 0, marginBottom: 12 }}>{syncMsg.t}</p>}

            <ChannelSummary g={g} prev={prev} category={a.category} mainPlatform={a.mainPlatform}
              emptyHint="Nothing recorded for the past 30 days yet — enter numbers below, sync, or import a CSV." />

            <ContractsSection artist={name} contracts={contracts} onChange={onContractsChange}
              anniversary={a.contractAnniversary || ""} onAnniversaryChange={(d) => onSave(name, { contractAnniversary: d || undefined })} />

            <NumbersForm key={`${name}:${editMonth}:${syncCount}`} editMonth={editMonth} onMonthChange={setEditMonth}
              initial={metrics[editMonth]?.[name] || {}}
              onSave={(mo, next) => onSaveMetrics(name, mo, next)} />

            <div className="eyebrow" style={{ marginTop: 22 }}>Artist details</div>
            <div className="fld"><label htmlFor="d-code">AdTraction link or code</label>
              <input id="d-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="tracked link, or a discount code if we are running one" />
            </div>
            <div className="fld"><label htmlFor="d-activities">Recommended activities</label>
              <textarea id="d-activities" className="long" value={activities} onChange={(e) => setActivities(e.target.value)}
                placeholder="Ideas for what to do with this artist next — content, events, campaigns, product launches…" />
            </div>
            <div className="fld"><label htmlFor="d-note">Notes</label>
              <textarea id="d-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="btnrow"><button className="btn" onClick={save}>Save</button></div>
            <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>{msg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
