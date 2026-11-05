const NB = " ";

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
export function n2(v: number, d = 1): string {
  if (!isFinite(v)) return "–";
  return v.toFixed(d).replace(".", ",");
}
export function grp(v: number): string {
  if (!isFinite(v)) return "–";
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB);
}
export function compact(v: number): string {
  if (!isFinite(v) || v === 0) return "–";
  if (v >= 1e6) return n2(v / 1e6, 1) + NB + "M";
  if (v >= 1e3) return n2(v / 1e3, 0) + NB + "k";
  return grp(v);
}
export function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";
}
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
export function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
export function prevMonth(m: string): string {
  const d = new Date(m + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
export function andList(a: string[]): string {
  if (a.length <= 1) return a[0] || "";
  if (a.length === 2) return a[0] + " and " + a[1];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}

export const TIER_LABEL: Record<string, string> = {
  T1: "1 · Signature", "T1.5": "1.5 · Signature light", T2: "2 · Resident",
  T3: "3 · Associate", T4: "4 · Affiliate", T5: "5 · Promoter",
  POT: "Potential", EX: "Ex-signature",
};
export const STATUS_LABEL: Record<string, string> = { A: "Active", I: "Inactive", T: "Terminated" };

/** Every activity number (posts, videos, views, engagement, clicks, sales,
 * press) covers the 30 days before it was recorded, not the calendar month.
 * Data is still filed under the month it was recorded in, so month-over-
 * month comparisons and the trend still work.
 *  - current (or future) month: the 30 days ending today
 *  - a past month: the 30 days ending on that month's last day */
export function windowFor(month: string, now = new Date()): { start: string; end: string } {
  const local = (d: Date) => `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${("0" + d.getDate()).slice(-2)}`;
  const todayStr = local(now);
  let end = todayStr;
  if (month < todayStr.slice(0, 7)) {
    const [y, m] = month.split("-").map(Number);
    end = local(new Date(y, m, 0)); // day 0 of next month = last day of this one
  }
  const e = new Date(end + "T12:00:00");
  e.setDate(e.getDate() - 29);
  return { start: local(e), end };
}
export function fmtDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
export function windowLabel(month: string): string {
  const w = windowFor(month);
  return `${fmtDay(w.start)} – ${fmtDay(w.end)}`;
}

/** A clickable URL for a typed link ("youtube.com/@x" → https://…), or "" if it isn't one. */
export function toHref(raw: string): string {
  const v = raw.trim();
  return /^https?:\/\//i.test(v) ? v : /^[\w-]+(\.[\w-]+)+(\/|$)/i.test(v) ? `https://${v}` : "";
}
