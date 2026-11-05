import { useState } from "react";
import { syncAll } from "../lib/api";
import SyncTip from "./SyncTip";

export interface SyncMsg { ok: boolean; t: string }

/** Sits inline in the roster filter row; the result message is handed up so
 * it can render below the row without changing the row's height. */
export default function SyncAllButton({ onResult }: { onResult: (m: SyncMsg | null) => void }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); onResult(null);
    try {
      const r = await syncAll();
      onResult({ ok: true, t: r.message });
    } catch (e) {
      onResult({ ok: false, t: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="syncrow" style={{ marginBottom: 0 }}>
      <button className="btn ghost" style={{ padding: "6px 13px", fontSize: 12.5 }} onClick={go} disabled={busy}>{busy ? "Syncing…" : "Sync all"}</button>
      <SyncTip id="sync-all-tip" />
    </span>
  );
}
