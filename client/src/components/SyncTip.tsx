export const SYNC_NOTICE = "This tool uses API tokens and requires an active card on file, please double check with the API key holder before syncing stats.";

/** The "?" next to every sync button — shown on hover or keyboard focus. */
export default function SyncTip({ id }: { id: string }) {
  return (
    <span className="tip">
      <button type="button" className="tipq" aria-label="About syncing stats" aria-describedby={id}>?</button>
      <span className="tipbox" role="tooltip" id={id}>{SYNC_NOTICE}</span>
    </span>
  );
}
