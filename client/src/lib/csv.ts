/** A tolerant CSV/TSV parser: handles quoted fields, commas, semicolons and
 * tabs as delimiters, and normalises headers to snake_case keys. */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!nonEmpty.length) return [];
  const head = nonEmpty[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]).trim(); });
    return o;
  });
}

export function num(v: unknown): number {
  if (v == null) return 0;
  let s = String(v).replace(/\s| | /g, "").replace(/%/g, "").replace(/[^\d,.\-]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/,/g, "");
  else if (s.indexOf(",") > -1 && /,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function pick(o: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (o[k] != null && o[k] !== "") return o[k];
  }
  return "";
}
