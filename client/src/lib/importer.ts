import { num, parseCSV, pick } from "./csv";
import { windowFor } from "./format";
import type { ArtistMeta, Metrics, MonthMetrics, Roster } from "./types";

export interface SourceDef { label: string; hint: string; month: boolean }
export const SOURCES: Record<string, SourceDef> = {
  favro: { label: "Favro roster", month: false, hint: `Export the <b>Artists Roster</b> board from Favro as CSV and paste it. Recognised columns: <code>artist name</code>, <code>region</code>, <code>tier</code>, <code>status</code>, <code>latest check-in</code>. Updates the roster itself — it does not belong to a month.` },
  instagram: { label: "Instagram", month: true, hint: `Export from Meta Business Suite (Instagram). Recognised columns: <code>name</code> (or <code>account</code>), plus any of <code>followers</code>, <code>posts</code>, <code>engagement</code> (likes + comments) — all for the past 30 days.` },
  meta: { label: "Meta (Facebook)", month: true, hint: `Export from Meta Business Suite (Facebook Page). Recognised columns: <code>name</code> (or <code>page</code>, <code>account</code>), plus any of <code>followers</code> (or <code>page_likes</code>), <code>posts</code>, <code>engagement</code> (reactions + comments) — all for the past 30 days.` },
  youtube: { label: "YouTube", month: true, hint: `Paste <code>youtube_artists_YYYY-MM.csv</code> from the collector script. Recognised columns: <code>name</code>, <code>subscribers</code>, <code>videos_30d</code> (or <code>videos_in_month</code>), <code>views_30d</code> (or <code>views_in_month</code>), <code>qualified_views</code>, <code>qualification_rate</code>. Counts should cover the past 30 days.` },
  spotify: { label: "Spotify", month: true, hint: `Monthly listeners per artist, from Spotify for Artists or any list you keep. Recognised columns: <code>name</code> (or <code>artist</code>) and <code>monthly_listeners</code> (or <code>listeners</code>). Graded on the <b>trend</b> since last month's snapshot — holding steady is fine, losing listeners counts against the artist. It counts most for Live Artists.` },
  gsc: { label: "Search Console", month: true, hint: `Export the query table from Search Console or the Looker dashboard. Needs <code>query</code> and <code>clicks</code> (<code>impressions</code> optional). <b>Artist names are matched out of the queries automatically</b> — paste the whole table, it will find the rows that name someone on the roster.` },
  adtraction: { label: "AdTraction", month: true, hint: `Export the channel/publisher report. Recognised columns: <code>name</code> (or <code>channel</code>, <code>affiliate</code>), plus <code>clicks</code>, <code>conversions</code>, <code>commission</code> (or <code>revenue</code>). Graded on <b>number of transactions</b>, not kronor — five small sales say more about a working collaboration than one large one.` },
  press: { label: "Press & media", month: true, hint: `Any coverage list — a media-monitoring export, a Google Alert digest, or a few lines typed by hand. One row per piece. Recognised columns: <code>headline</code> (or <code>title</code>), <code>outlet</code>, <code>url</code>, and optionally <code>artist</code>. <b>Artist names are matched out of the headline automatically.</b> Press is <em>not</em> scored — it shows up as a highlight on the row, because a magazine feature is news, not a recurring metric. List coverage from the past 30 days.` },
};

const STOP = new Set(["the", "and", "guitar", "guitars", "bass", "music", "official", "band", "live", "song", "new", "best"]);

/** Match a Search Console query or press headline to a roster artist. Full
 * name first, then a distinctive single name — guarded so short or common
 * words never match. */
export function matchArtist(q: string, roster: Roster): string | null {
  const s = " " + String(q).toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, " ").replace(/\s+/g, " ") + " ";
  const names = Object.keys(roster);
  for (const name of names) {
    const full = name.toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, " ").replace(/\s+/g, " ");
    if (s.indexOf(" " + full + " ") > -1) return name;
  }
  let hit: string | null = null;
  for (const name of names) {
    const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 5 && !STOP.has(p));
    for (const p of parts) {
      if (s.indexOf(" " + p + " ") > -1 && !hit) hit = name;
    }
  }
  return hit;
}

export interface ImportResult {
  ok?: string;
  err?: string;
  hit: number;
  nextRoster?: Roster;
  nextMetrics?: Metrics;
}

export function runImport(source: string, month: string, text: string, roster: Roster, metrics: Metrics): ImportResult {
  const rows = parseCSV(text);
  if (!rows.length) return { err: "Nothing parsed. Paste the CSV including its header row.", hit: 0 };

  let hit = 0;
  const miss: string[] = [];
  const byArtist: Record<string, MonthMetrics> = {};

  if (source === "favro") {
    const next: Roster = { ...roster };
    let changed = 0, added = 0;
    rows.forEach((r) => {
      const name = pick(r, "artist_name", "name", "title", "artist");
      if (!name) return;
      let cur: ArtistMeta = next[name] ? { ...next[name] } : { tier: "T3", status: "A", region: "", owner: "", yt: "", ig: "", code: "", lastCheck: "", note: "" };
      if (!next[name]) added++;
      const tier = pick(r, "tier"), st = pick(r, "status"), rg = pick(r, "region"), ci = pick(r, "latest_check_in", "last_check_in", "check_in");
      if (tier) {
        const tt = String(tier).trim();
        cur.tier = /^1\s*-|signature$/i.test(tt) && !/light/i.test(tt) ? "T1" : /1\.5|light/i.test(tt) ? "T1.5"
          : /^2/.test(tt) ? "T2" : /^3/.test(tt) ? "T3" : /^4/.test(tt) ? "T4" : /^5/.test(tt) ? "T5"
          : /ex/i.test(tt) ? "EX" : /potential/i.test(tt) ? "POT" : cur.tier;
      }
      if (st) cur.status = (/^a/i.test(st) ? "A" : /^i/i.test(st) ? "I" : /^t/i.test(st) ? "T" : cur.status) as ArtistMeta["status"];
      if (rg) cur.region = rg;
      if (ci) {
        const p = String(ci).trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
        if (p) { let y = +p[3]; y = y < 100 ? 2000 + y : y; cur.lastCheck = `${y}-${("0" + p[1]).slice(-2)}-${("0" + p[2]).slice(-2)}`; }
        else if (/^\d{4}-\d{2}-\d{2}/.test(ci)) cur.lastCheck = String(ci).slice(0, 10);
      }
      next[name] = cur; changed++; hit++;
    });
    return { ok: `Updated ${changed} artists${added ? `, ${added} new` : ""}.`, hit, nextRoster: next };
  }

  if (source === "press") {
    rows.forEach((r) => {
      let who = pick(r, "artist", "name", "artist_name");
      const head = pick(r, "headline", "title", "summary", "text", "mention");
      if (!who && head) who = matchArtist(head, roster) || "";
      if (!who) { if (head) miss.push(head.slice(0, 40)); return; }
      if (!roster[who]) return;
      const b = byArtist[who] || (byArtist[who] = {});
      b.press = b.press || [];
      if (b.press.length < 6) {
        b.press.push({
          h: String(head || "").slice(0, 140),
          o: String(pick(r, "outlet", "publication", "source", "site")).slice(0, 60),
          u: String(pick(r, "url", "link")).slice(0, 300),
        });
      }
      hit++;
    });
  } else if (source === "gsc") {
    rows.forEach((r) => {
      const q = pick(r, "query", "top_queries", "search_query", "keyword");
      let who = pick(r, "artist", "name");
      if (!who && q) who = matchArtist(q, roster) || "";
      if (!who) { if (q) miss.push(q); return; }
      if (!roster[who]) return;
      const b = byArtist[who] || (byArtist[who] = {});
      b.gscClicks = (b.gscClicks || 0) + num(pick(r, "clicks", "url_clicks", "click"));
      b.gscImpr = (b.gscImpr || 0) + num(pick(r, "impressions", "impression"));
      b.gscQueries = (b.gscQueries || 0) + 1;
      hit++;
    });
  } else {
    rows.forEach((r) => {
      const name = pick(r, "name", "artist", "artist_name", "channel", "channel_title", "account", "page", "page_name", "affiliate", "publisher");
      if (!name) return;
      let key: string | null = roster[name] ? name : null;
      if (!key) {
        const lo = name.toLowerCase();
        Object.keys(roster).forEach((k) => { if (!key && k.toLowerCase() === lo) key = k; });
      }
      if (!key) { miss.push(name); return; }
      const b = byArtist[key] || (byArtist[key] = {});
      if (source === "youtube") {
        b.ytSubs = num(pick(r, "subscribers", "subscriber_count", "subs"));
        b.ytVids = num(pick(r, "videos_30d", "videos_in_month", "videos", "video_count"));
        b.ytViews = num(pick(r, "views_30d", "views_in_month", "views", "view_count"));
        b.ytQual = num(pick(r, "qualified_views", "qualified"));
        const rt = pick(r, "qualification_rate", "qual_rate");
        b.ytRate = rt !== "" ? (num(rt) > 1 ? num(rt) / 100 : num(rt)) : (b.ytViews ? b.ytQual / b.ytViews : 0);
      } else if (source === "instagram") {
        b.igFollowers = num(pick(r, "followers", "follower_count", "fans"));
        b.igPosts = num(pick(r, "posts", "posts_30d", "posts_in_month", "post_count"));
        b.igEng = num(pick(r, "engagement", "engagements", "interactions"));
      } else if (source === "meta") {
        b.fbFollowers = num(pick(r, "followers", "follower_count", "fans", "page_likes", "likes"));
        b.fbPosts = num(pick(r, "posts", "posts_30d", "posts_in_month", "post_count"));
        b.fbEng = num(pick(r, "engagement", "engagements", "interactions", "post_engagements"));
      } else if (source === "spotify") {
        b.spListeners = num(pick(r, "monthly_listeners", "listeners", "spotify_monthly_listeners"));
      } else if (source === "adtraction") {
        b.adClicks = num(pick(r, "clicks", "click"));
        b.adConv = num(pick(r, "conversions", "sales", "orders", "transactions"));
        b.adRev = num(pick(r, "commission", "revenue", "sale_value", "amount"));
      }
      hit++;
    });
  }

  if (!hit) {
    return { err: `No rows matched anyone on the roster. ${miss.length ? "First unmatched: " + miss.slice(0, 3).join(", ") : "Check the column names."}`, hit: 0 };
  }

  const existing = metrics[month] || {};
  const merged: Record<string, MonthMetrics> = {};
  Object.keys(existing).forEach((k) => { merged[k] = { ...existing[k] }; });
  const asOf = windowFor(month).end;
  Object.keys(byArtist).forEach((k) => { merged[k] = { ...(merged[k] || {}), ...byArtist[k], asOf }; });
  const nextMetrics: Metrics = { ...metrics, [month]: merged };

  return {
    ok: `Matched ${hit} rows to ${Object.keys(byArtist).length} artists for ${month}.${miss.length ? ` ${miss.length} rows matched nobody on the roster.` : ""}`,
    hit, nextMetrics,
  };
}
