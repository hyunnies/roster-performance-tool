import { useRef, useState } from "react";
import { contractUrl, deleteContract, uploadContract } from "../lib/api";
import { fmtDay } from "../lib/format";
import type { Contract } from "../lib/types";

interface Props {
  artist: string;
  contracts: Contract[];
  onChange: (contracts: Contract[]) => void;
  anniversary: string;
  onAnniversaryChange: (date: string) => void;
}

/** Next yearly occurrence of a YYYY-MM-DD date, from today (29 Feb → 28 Feb in non-leap years). */
export function nextAnniversary(date: string, now = new Date()): { date: Date; days: number; years: number } | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y0, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const on = (y: number) => {
    const last = new Date(y, mo + 1, 0).getDate();
    return new Date(y, mo, Math.min(d, last));
  };
  let y = today.getFullYear();
  if (on(y) < today) y++;
  const next = on(y);
  return { date: next, days: Math.round((next.getTime() - today.getTime()) / 86_400_000), years: y - y0 };
}

function fmtSize(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** Upload, open, download and delete an artist's contract PDFs. Files stay
 * on this computer (server/data/contracts/). */
export default function ContractsSection({ artist, contracts, onChange, anniversary, onAnniversaryChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const next = anniversary ? nextAnniversary(anniversary) : null;
  const mine = contracts.filter((c) => c.artist === artist).sort((x, y) => (x.uploadedAt < y.uploadedAt ? 1 : -1));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    const added: Contract[] = [];
    const failed: string[] = [];
    for (const f of Array.from(files)) {
      try { added.push(await uploadContract(artist, f)); }
      catch (e) { failed.push(`${f.name}: ${(e as Error).message}`); }
    }
    if (added.length) onChange([...contracts, ...added]);
    setMsg(failed.length
      ? { ok: false, t: failed.join(" · ") }
      : { ok: true, t: `Uploaded ${added.length} contract${added.length === 1 ? "" : "s"}.` });
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function remove(id: string) {
    try {
      await deleteContract(id);
      onChange(contracts.filter((c) => c.id !== id));
      setMsg(null);
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
    }
    setConfirmId(null);
  }

  return (
    <fieldset className="numgrp contracts">
      <legend>Contracts <span className="dim">· PDF, stored on this computer only</span></legend>
      {mine.length > 0 && (
        <div className="ctlist">
          {mine.map((c) => (
            <div className="ctrow" key={c.id}>
              <div className="ctname">
                <a href={contractUrl(c.id)} target="_blank" rel="noreferrer" title="Open in a new tab">{c.fileName}</a>
                <span className="dim">{fmtSize(c.size)} · uploaded {fmtDay(c.uploadedAt.slice(0, 10))} {c.uploadedAt.slice(0, 4)}</span>
              </div>
              {confirmId === c.id ? (
                <span className="ctactions">
                  <span className="dim">Delete?</span>
                  <button type="button" className="btn sm danger" onClick={() => remove(c.id)}>Delete</button>
                  <button type="button" className="btn ghost sm" onClick={() => setConfirmId(null)}>Keep</button>
                </span>
              ) : (
                <span className="ctactions">
                  <a className="btn ghost sm" href={contractUrl(c.id)} target="_blank" rel="noreferrer">Open</a>
                  <a className="btn ghost sm" href={contractUrl(c.id, true)}>Download</a>
                  <button type="button" className="rm" aria-label={`Delete ${c.fileName}`} title="Delete" onClick={() => setConfirmId(c.id)}>×</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="ctbar">
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button type="button" className="addbtn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : mine.length ? "+ Upload another contract" : "+ Upload contract"}
        </button>
        <label className="anniv">
          <span>Anniversary</span>
          <input type="date" className="inl" value={anniversary} onChange={(e) => onAnniversaryChange(e.target.value)} />
        </label>
        {next && (
          <span className={`anninext${next.days <= 30 ? " soon" : ""}`}>
            {next.days === 0 ? "Today" : `Next: ${next.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · in ${next.days} day${next.days === 1 ? "" : "s"}`}
            {next.years > 0 ? ` · ${next.years} year${next.years === 1 ? "" : "s"}` : ""}
          </span>
        )}
      </div>
      {msg && <p className={`prev${msg.ok ? "" : " err"}`} style={{ marginTop: 8 }}>{msg.t}</p>}
    </fieldset>
  );
}
