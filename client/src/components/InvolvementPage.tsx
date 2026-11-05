import { useMemo, useState } from "react";
import { TIER_LABEL, fmtDay, today } from "../lib/format";
import { CATEGORY_LABEL } from "../lib/categories";
import type { InvolvementEvent, InvolvementStatus, Roster } from "../lib/types";

interface Props {
  events: InvolvementEvent[];
  roster: Roster;
  onChange: (events: InvolvementEvent[]) => void;
  saveState: "idle" | "saving" | "saved" | "error";
}

export const STATUSES: { k: InvolvementStatus; label: string }[] = [
  { k: "proposed", label: "Proposed" },
  { k: "pending", label: "Pending" },
  { k: "rejected", label: "Rejected" },
  { k: "confirmed", label: "Confirmed" },
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtEventDate(d: string): string {
  if (!d) return "No date yet";
  return `${fmtDay(d)} ${d.slice(0, 4)}`;
}

/** Artist Involvement: events, and which roster artists are part of each. */
export default function InvolvementPage({ events, roster, onChange, saveState }: Props) {
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const todayStr = today();

  // Active artists first, then everyone else, alphabetical within each.
  const rosterNames = useMemo(() => Object.keys(roster).sort((x, y) =>
    (roster[x].status === "A" ? 0 : 1) - (roster[y].status === "A" ? 0 : 1) || x.localeCompare(y)), [roster]);

  const upcoming = events.filter((e) => !e.date || e.date >= todayStr)
    .sort((x, y) => (x.date || "0000") < (y.date || "0000") ? -1 : 1); // undated drafts first
  const past = events.filter((e) => e.date && e.date < todayStr).sort((x, y) => (x.date < y.date ? 1 : -1));

  function update(id: string, patch: Partial<InvolvementEvent>) {
    onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function addEvent() {
    const id = newId();
    onChange([{ id, name: "", date: "", description: "", artists: [] }, ...events]);
    setJustAdded(id);
  }
  function removeEvent(id: string) {
    onChange(events.filter((e) => e.id !== id));
  }

  const card = (ev: InvolvementEvent) => (
    <EventCard key={ev.id} ev={ev} roster={roster} rosterNames={rosterNames} autoFocus={ev.id === justAdded}
      onUpdate={(patch) => update(ev.id, patch)} onRemove={() => removeEvent(ev.id)} />
  );

  return (
    <div className="stack">
      <div className="invhead">
        <div>
          <h2 className="sec">Artist involvement</h2>
          <p className="sub">Events and the roster artists taking part — who's involved, and what each of them is doing.
            Changes save automatically.</p>
        </div>
        <div className="invactions">
          <span className={`savestate ${saveState}`} aria-live="polite" hidden={saveState === "idle"}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Couldn't save — check the app is running" : ""}
          </span>
          <button className="btn" onClick={addEvent}>+ Add event</button>
        </div>
      </div>

      {!events.length && (
        <div className="panel empty">No events yet. Use <b>Add event</b> to create one, then add the artists involved.</div>
      )}

      {upcoming.length > 0 && (
        <section className="stack" style={{ gap: 14 }}>
          <div className="eyebrow">Upcoming{upcoming.some((e) => !e.date) ? " and undated" : ""} · {upcoming.length}</div>
          {upcoming.map(card)}
        </section>
      )}
      {past.length > 0 && (
        <section className="stack" style={{ gap: 14 }}>
          <div className="eyebrow">Past · {past.length}</div>
          {past.map(card)}
        </section>
      )}
    </div>
  );
}

interface CardProps {
  ev: InvolvementEvent;
  roster: Roster;
  rosterNames: string[];
  autoFocus: boolean;
  onUpdate: (patch: Partial<InvolvementEvent>) => void;
  onRemove: () => void;
}

function EventCard({ ev, roster, rosterNames, autoFocus, onUpdate, onRemove }: CardProps) {
  const [pick, setPick] = useState("");
  const [pickMsg, setPickMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const listId = `roster-${ev.id}`;
  const taken = new Set(ev.artists.map((a) => a.name));
  const available = rosterNames.filter((n) => !taken.has(n));

  /** Picking from the suggestions gives an exact roster name, which adds the
   * artist straight away. On Enter, a case-insensitive match is accepted too. */
  function tryAdd(value: string, fromEnter = false) {
    const v = value.trim();
    if (!v) return;
    const match = roster[v] ? v : fromEnter ? rosterNames.find((n) => n.toLowerCase() === v.toLowerCase()) : undefined;
    if (!match) {
      if (fromEnter) setPickMsg(`No one called "${v}" on the roster.`);
      return;
    }
    if (taken.has(match)) { setPickMsg(`${match} is already on this event.`); setPick(""); return; }
    onUpdate({ artists: [...ev.artists, { name: match, role: "", status: "proposed" }] });
    setPick(""); setPickMsg("");
  }
  function setArtist(i: number, patch: { role?: string; status?: InvolvementStatus }) {
    onUpdate({ artists: ev.artists.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  }
  // e.g. "2 confirmed · 1 pending" — older entries without a status count as proposed
  const counts = STATUSES.map((s) => ({ ...s, n: ev.artists.filter((a) => (a.status || "proposed") === s.k).length })).filter((s) => s.n);
  function removeArtist(i: number) {
    onUpdate({ artists: ev.artists.filter((_, j) => j !== i) });
  }

  return (
    <article className="panel evcard" aria-label={ev.name || "Untitled event"}>
      <div className="evtop">
        <input className="evname" value={ev.name} placeholder="Event name" aria-label="Event name" autoFocus={autoFocus}
          onChange={(e) => onUpdate({ name: e.target.value })} />
        <label className="evdate">
          <span className="eyebrow">Date</span>
          <input type="date" className="inl" value={ev.date} onChange={(e) => onUpdate({ date: e.target.value })} />
        </label>
        {confirmDelete ? (
          <span className="evdel">
            <span className="dim">Delete this event?</span>
            <button className="btn sm danger" onClick={onRemove}>Delete</button>
            <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button className="btn ghost sm" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
      <div className="evmeta dim">
        {fmtEventDate(ev.date)} · {ev.artists.length} artist{ev.artists.length === 1 ? "" : "s"}
        {counts.map((c) => <span key={c.k} className={`stcount ${c.k}`}>{c.n} {c.label.toLowerCase()}</span>)}
      </div>

      <div className="fld">
        <label htmlFor={`desc-${ev.id}`}>Description</label>
        <textarea id={`desc-${ev.id}`} value={ev.description} placeholder="What's the event, where, and what are we trying to get out of it?"
          onChange={(e) => onUpdate({ description: e.target.value })} />
      </div>

      <div className="evartists">
        <div className="eyebrow" style={{ margin: "18px 0 8px" }}>Artists involved</div>
        {ev.artists.length > 0 && (
          <div className="evrows">
            {ev.artists.map((a, i) => {
              const r = roster[a.name];
              return (
                <div className="evrow" key={a.name}>
                  <div className="evwho">
                    <span className="evn">{a.name}</span>
                    <span className="rg">
                      {r ? <>{TIER_LABEL[r.tier] || r.tier}{r.region ? ` · ${r.region}` : ""}</> : "no longer on the roster"}
                      {r?.category ? <span className={`cat ${r.category}`}>{CATEGORY_LABEL[r.category]}</span> : null}
                    </span>
                  </div>
                  <select className={`stsel ${a.status || "proposed"}`} value={a.status || "proposed"} aria-label={`${a.name}'s involvement status`}
                    onChange={(e) => setArtist(i, { status: e.target.value as InvolvementStatus })}>
                    {STATUSES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
                  </select>
                  <input value={a.role} placeholder="What they're involved with…" aria-label={`What ${a.name} is involved with`}
                    onChange={(e) => setArtist(i, { role: e.target.value })} />
                  <button type="button" className="rm" aria-label={`Remove ${a.name}`} title="Remove" onClick={() => removeArtist(i)}>×</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="evadd">
          <input list={listId} value={pick} placeholder={available.length ? "Add an artist — start typing a name" : "Everyone on the roster is already added"}
            aria-label="Add an artist from the roster" disabled={!available.length}
            onChange={(e) => { setPick(e.target.value); setPickMsg(""); tryAdd(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryAdd(pick, true); } }} />
          <datalist id={listId}>
            {available.map((n) => (
              <option key={n} value={n}>{`${TIER_LABEL[roster[n].tier] || roster[n].tier}${roster[n].status !== "A" ? " · inactive" : ""}`}</option>
            ))}
          </datalist>
          {pickMsg && <span className="prev err" style={{ margin: 0 }}>{pickMsg}</span>}
        </div>
      </div>
    </article>
  );
}
