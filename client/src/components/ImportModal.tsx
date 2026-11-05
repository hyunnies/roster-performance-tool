import { useEffect, useState } from "react";
import { parseCSV } from "../lib/csv";
import { SOURCES } from "../lib/importer";
import { thisMonth, windowFor } from "../lib/format";

interface Props {
  source: string | null;
  defaultMonth: string;
  onClose: () => void;
  onImport: (source: string, month: string, text: string) => { ok?: string; err?: string };
}

export default function ImportModal({ source, defaultMonth, onClose, onImport }: Props) {
  const [month, setMonth] = useState(defaultMonth || thisMonth());
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ msg: string; err: boolean } | null>(null);

  useEffect(() => {
    if (source) {
      setMonth(defaultMonth || thisMonth());
      setText("");
      setPreview(null);
    }
  }, [source, defaultMonth]);

  if (!source) return null;
  const src = source;
  const def = SOURCES[src];

  function handleTextChange(v: string) {
    setText(v);
    const rows = parseCSV(v);
    setPreview(rows.length ? { msg: `${rows.length} rows parsed. Columns seen: ${Object.keys(rows[0]).join(", ")}`, err: false } : null);
  }

  function go() {
    const res = onImport(src, month || thisMonth(), text);
    if (res.err) setPreview({ msg: res.err, err: true });
    else {
      setPreview({ msg: res.ok || "Imported.", err: false });
      setTimeout(onClose, 1400);
    }
  }

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div><div className="eyebrow">Import</div><h3 style={{ fontSize: 21, fontWeight: 600, margin: "5px 0 0" }}>{def.label}</h3></div>
          <button className="btn ghost" style={{ marginLeft: "auto", padding: "7px 13px", fontSize: 13 }} onClick={onClose}>Close</button>
        </div>
        <div className="hintbox" dangerouslySetInnerHTML={{ __html: def.hint }} />
        {def.month && (
          <div className="fld" style={{ marginBottom: 10, marginTop: 0 }}>
            <label htmlFor="imMonth">Month to file it under <span className="dim">· numbers should cover the 30 days up to {windowFor(month || thisMonth()).end}</span></label>
            <input id="imMonth" type="month" style={{ maxWidth: 200 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}
        <textarea placeholder="Paste the CSV here, header row included" value={text} onChange={(e) => handleTextChange(e.target.value)} />
        {preview && <div className={`prev${preview.err ? " err" : ""}`} dangerouslySetInnerHTML={{ __html: preview.err ? preview.msg : `<b>${preview.msg}</b>` }} />}
        <div className="btnrow">
          <button className="btn" onClick={go}>Import</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
