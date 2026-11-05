/**
 * Counts a channel's uploads inside the 30-day window by reading its public
 * /videos page directly — no API key, no AI. The page embeds its video list
 * as JSON (ytInitialData) with a relative upload time per video ("3 weeks
 * ago"); Claude's page reader doesn't see that data, so we parse it here.
 *
 * Three tabs are counted: Videos and Live use the relative time on each
 * tile (coarse at the window's edges — "4 weeks ago" counts, "1 month ago"
 * doesn't); Shorts tiles carry no date, so each recent Short's own page is
 * read for its exact upload date, newest first, until one falls outside.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const REL = /^(?:Streamed )?(\d+) (second|minute|hour|day|week|month|year)s? ago$/;
const DAYS: Record<string, number> = { second: 0, minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 };

/** Turns "@handle", "youtube.com/@handle/featured", "/channel/UC…" etc. into
 * the channel's base URL, or null if it isn't a YouTube channel link. */
export function channelBase(link: string): string | null {
  const s = link.trim();
  if (/^@[\w.-]+$/.test(s)) return `https://www.youtube.com/${s}`;
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[\w.-]+|channel\/UC[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i);
  return m ? `https://www.youtube.com/${m[1]}` : null;
}

async function getHtml(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  return res.ok ? res.text() : null;
}

async function initialData(url: string): Promise<{ data: unknown; raw: string } | null> {
  const html = await getHtml(url);
  const m = html?.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return null;
  try { return { data: JSON.parse(m[1]), raw: m[1] }; } catch { return null; }
}

/** Ages in days of each video on the page, newest first. */
function videoAges(initialData: unknown): number[] {
  const ages: number[] = [];
  const firstRelative = (o: unknown): number | null => {
    if (typeof o === "string") {
      const m = o.match(REL);
      if (!m) return null;
      // "N months ago" spans N to N+1 months, so take the middle — that keeps
      // "1 month ago" (30–60 days) out of a 30-day window.
      return Number(m[1]) * DAYS[m[2]] + (m[2] === "month" ? 15 : 0);
    }
    if (o && typeof o === "object") {
      for (const v of Object.values(o)) {
        const r = firstRelative(v);
        if (r != null) return r;
      }
    }
    return null;
  };
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      // One entry per video tile, in either of YouTube's current layouts.
      if (k === "lockupViewModel" || k === "videoRenderer") {
        const age = firstRelative(v);
        if (age != null) ages.push(age);
      } else walk(v);
    }
  };
  walk(initialData);
  return ages;
}

export interface YouTubeCount { videos: number; shorts: number; live: number; total: number }

const DAY = 86_400_000;
const bounds = (start: string, end: string) => [new Date(start + "T00:00:00").getTime(), new Date(end + "T23:59:59").getTime()] as const;

/** Videos or Live tab: count tiles whose relative age lands in the window. */
async function countTab(base: string, tab: "videos" | "streams", start: string, end: string): Promise<number | null> {
  const page = await initialData(`${base}/${tab}?hl=en`);
  if (!page) return null;
  const ages = videoAges(page.data);
  const [s, e] = bounds(start, end);
  const now = Date.now();
  // one day of slack at the start for coarse "N days ago"
  return ages.filter((a) => { const t = now - a * DAY; return t >= s - DAY && t <= e; }).length;
}

/** Shorts tab has no dates on the tiles, so read each Short's upload date
 * (newest first) until one is older than the window. Capped so a very
 * prolific channel can't trigger hundreds of page loads. */
async function countShorts(base: string, start: string, end: string): Promise<number | null> {
  const page = await initialData(`${base}/shorts?hl=en`);
  if (!page) return null;
  const ids = [...new Set([...page.raw.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, 40);
  const [s, e] = bounds(start, end);
  let count = 0;
  for (let i = 0; i < ids.length; i += 4) {
    const dates = await Promise.all(ids.slice(i, i + 4).map(async (id) => {
      const html = await getHtml(`https://www.youtube.com/watch?v=${id}&hl=en`);
      const m = html?.match(/"uploadDate":"([^"]+)"/);
      return m ? new Date(m[1]).getTime() : null;
    }));
    let older = false;
    for (const t of dates) {
      if (t == null) continue;
      if (t >= s && t <= e) count++;
      if (t < s) older = true;
    }
    if (older) break;
  }
  return count;
}

/** Uploads between `start` and `end` (YYYY-MM-DD) across Videos, Shorts and
 * Live. Null if the channel couldn't be read at all. */
export async function countYouTubeUploads(link: string, start: string, end: string): Promise<YouTubeCount | null> {
  const base = channelBase(link);
  if (!base) return null;
  const [videos, shorts, live] = await Promise.all([
    countTab(base, "videos", start, end).catch(() => null),
    countShorts(base, start, end).catch(() => null),
    countTab(base, "streams", start, end).catch(() => null),
  ]);
  if (videos == null && shorts == null && live == null) return null;
  const v = videos ?? 0, sh = shorts ?? 0, l = live ?? 0;
  return { videos: v, shorts: sh, live: l, total: v + sh + l };
}
