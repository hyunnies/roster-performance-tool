/**
 * Grading engine, ported from the Artist Relations Cockpit's "Current
 * roster performance" page.
 *
 * Grades are RELATIVE to the artist's own audience wherever the channel has
 * a denominator, so a 700k channel and a 20k channel are held to the same
 * standard of effort. Search, affiliate and media are absolute — a search
 * click is a search click whoever earned it. Spotify is graded on its
 * listener trend: the bar is "not losing listeners", not raw size.
 *
 * Modular weighting: how much each channel counts depends on the artist's
 * Type (see WEIGHTS) — Spotify carries a Live Artist, social carries an
 * Influencer.
 */
import { compact, grp, n2 } from "./format";
import type { ChannelCell, Grade, GradedArtist, MonthMetrics, Roster, Metrics, PressItem } from "./types";

export interface ChannelDef {
  k: string;
  label: string;
  has: (m: MonthMetrics) => boolean;
  /** `prev` is the previous month's snapshot, for channels graded on change.
   * Returning g: "none" means "data, but nothing to grade yet" — not scored. */
  grade: (m: MonthMetrics, prev: MonthMetrics) => ChannelCell;
}

/** How much each channel counts, by artist Type. Unset/Other keeps the
 * original balance. Channels with no data drop out and the rest re-weight. */
export const WEIGHTS: Record<string, Record<string, number>> = {
  default:    { Instagram: 1.0, Meta: 0.8, Youtube: 1.2, spotify: 0.8, Search: 1.3 },
  influencer: { Instagram: 1.6, Meta: 1.0, Youtube: 1.6, spotify: 0.4, Search: 1.0 },
  live:       { Instagram: 0.6, Meta: 0.5, Youtube: 0.8, spotify: 2.2, Search: 1.0 },
  both:       { Instagram: 1.2, Meta: 0.8, Youtube: 1.2, spotify: 1.3, Search: 1.0 },
};
export function weightsFor(category?: string): Record<string, number> {
  return WEIGHTS[category || ""] || WEIGHTS.default;
}
/** The channel(s) a Type leans on most — for the "weighted as" line. */
export function leansOn(category?: string): string[] {
  const w = weightsFor(category);
  const top = Math.max(...Object.values(w));
  return CHANNELS.filter((c) => w[c.k] >= top * 0.95).map((c) => c.label);
}

/** Instagram and Facebook are graded only on what's publicly visible:
 * posts in the past 30 days (did they show up at all?) and engagement — likes
 * plus comments over the same 30 days — relative to the account's own following.
 * Reach isn't used: it's private to the account holder. */
function gradeSocial(posts: number | undefined, eng: number | undefined, followers: number | undefined): ChannelCell {
  if (!posts && !eng) return { g: "silent", v: "nothing posted", n: 0 };
  const rate = followers ? (eng || 0) / followers : 0;
  const bits: string[] = [];
  if (posts) bits.push(`${grp(posts)} post${posts === 1 ? "" : "s"}`);
  if (eng) bits.push(compact(eng) + " eng." + (rate ? " · " + n2(rate * 100, rate < 0.1 ? 1 : 0) + " %" : ""));
  return {
    g: rate >= 0.10 ? "strong" : rate >= 0.03 ? "ok" : rate > 0 || posts ? "weak" : "silent",
    v: bits.join(" · "),
    n: rate,
  };
}

/** Display order matters: the table and drawer follow it. */
export const CHANNELS: ChannelDef[] = [
  {
    k: "Instagram", label: "Instagram",
    has: (m) => (m.igFollowers ?? 0) > 0 || m.igPosts != null || m.igEng != null,
    grade: (m) => gradeSocial(m.igPosts, m.igEng, m.igFollowers),
  },
  {
    // Facebook. Weighted a little below Instagram: for most of the roster
    // it's the quieter of the two Meta surfaces.
    k: "Meta", label: "Meta",
    has: (m) => (m.fbFollowers ?? 0) > 0 || m.fbPosts != null || m.fbEng != null,
    grade: (m) => gradeSocial(m.fbPosts, m.fbEng, m.fbFollowers),
  },
  {
    k: "Youtube", label: "YouTube",
    has: (m) => (m.ytSubs ?? 0) > 0 || (m.ytViews ?? 0) > 0 || m.ytVids != null,
    grade: (m) => {
      if (!m.ytVids && !m.ytViews) return { g: "silent", v: "nothing published", n: 0 };
      // Uploads known but no view numbers yet (Sync counts uploads, not
      // views): credit the activity without pretending to know its pull.
      if (m.ytViews == null && m.ytQual == null) {
        const u = m.ytVids || 0;
        return { g: "weak", v: `${grp(u)} upload${u === 1 ? "" : "s"} · views not recorded`, n: 0 };
      }
      const rate = m.ytSubs ? (m.ytQual || 0) / m.ytSubs : 0;
      let g: Grade = rate >= 0.35 ? "strong" : rate >= 0.12 ? "ok" : rate > 0 ? "weak" : "silent";
      let note = compact(m.ytQual || 0) + " qualified";
      if (m.ytRate && m.ytRate < 0.2 && (m.ytVids || 0) > 0) {
        g = g === "strong" ? "ok" : g;
        note += " · only " + n2(m.ytRate * 100, 0) + " % qualifies";
      }
      return { g, v: note, n: rate };
    },
  },
  {
    // Graded on the listener trend since the previous month's snapshot.
    // Growth is hard to pin to a collaboration, so holding steady is fine;
    // the real warning sign is losing listeners.
    k: "spotify", label: "Spotify",
    has: (m) => m.spListeners != null,
    grade: (m, prev) => {
      const cur = m.spListeners || 0, was = prev.spListeners;
      const size = cur ? compact(cur) : "0";
      if (!was) return { g: "none", v: `${size} listeners · baseline, graded from next month`, n: 0 };
      const d = (cur - was) / was;
      const pct = (d >= 0 ? "+" : "−") + n2(Math.abs(d) * 100, 0) + " %";
      const g: Grade = d >= 0.03 ? "strong" : d >= -0.03 ? "ok" : d >= -0.10 ? "weak" : "silent";
      const word = g === "strong" ? "growing" : g === "ok" ? "holding steady" : g === "weak" ? "slipping" : "losing listeners";
      return { g, v: `${size} · ${pct} · ${word}`, n: d };
    },
  },
  {
    k: "Search", label: "Search",
    has: (m) => m.gscClicks != null,
    grade: (m) => {
      const c = m.gscClicks || 0;
      return { g: c >= 50 ? "strong" : c >= 15 ? "ok" : c > 0 ? "weak" : "silent", v: c ? grp(c) + " clicks" : "not searched", n: c };
    },
  },
];

/** Affiliate is deliberately NOT in CHANNELS: the programme is a pilot with
 * a handful of artists, so grading everyone on it would punish the ones
 * who were never enrolled. It's shown alongside, graded on transactions
 * once enough artists are in it. */
export const AFFIL = {
  in: (m: MonthMetrics) => m.adConv != null || m.adRev != null || m.adClicks != null,
  grade: (m: MonthMetrics): ChannelCell => {
    const t = m.adConv || 0, r = m.adRev || 0, c = m.adClicks || 0;
    const g: Grade = t >= 5 ? "strong" : t >= 3 ? "ok" : t >= 1 ? "weak" : "silent";
    const v = t ? `${t} sale${t === 1 ? "" : "s"}${r ? " · " + grp(r) + " kr" : ""}` : c ? `${grp(c)} clicks, no sale` : "no sales yet";
    return { g, v, n: t };
  },
};

export const GVAL: Record<Grade, number> = { strong: 100, ok: 62, weak: 28, silent: 0, none: 0 };
export const GCOL: Record<Grade, string> = { strong: "var(--good)", ok: "var(--reach)", weak: "var(--warn)", silent: "var(--crit)", none: "var(--muted)" };

export interface StatusLevel { min: number; k: "bet" | "working" | "watch" | "question"; l: string; d: string }
export const STATUS: StatusLevel[] = [
  { min: 70, k: "bet", l: "Bet on", d: "contributing across the channels we can see" },
  { min: 46, k: "working", l: "Working", d: "contributing on at least one channel" },
  { min: 22, k: "watch", l: "Watch", d: "thin contribution — worth a nudge before a decision" },
  { min: 0, k: "question", l: "Question", d: "not contributing — is this collaboration earning its place?" },
];
export function statusFor(score: number): StatusLevel {
  for (const s of STATUS) if (score >= s.min) return s;
  return STATUS[STATUS.length - 1];
}

export function supported(a: { tier: string }): boolean {
  return a.tier === "T1" || a.tier === "T1.5" || a.tier === "T2";
}

function metricsFor(metrics: Metrics, name: string, month: string | null): MonthMetrics {
  if (!month) return {};
  return metrics[month]?.[name] || {};
}

export function gradeArtist(roster: Roster, metrics: Metrics, name: string, month: string | null): {
  cells: Record<string, ChannelCell>; score: number | null; graded: number; m: MonthMetrics; press: PressItem[]; aff: ChannelCell;
} {
  const m = metricsFor(metrics, name, month);
  const prev = month ? metricsFor(metrics, name, prevMonthOf(month)) : {};
  const w = weightsFor(roster[name]?.category);
  const cells: Record<string, ChannelCell> = {};
  const press = Array.isArray(m.press) ? m.press : [];
  let sum = 0, wsum = 0, graded = 0;
  CHANNELS.forEach((c) => {
    if (!c.has(m)) { cells[c.k] = { g: "none", v: "no data", n: 0 }; return; }
    const r = c.grade(m, prev);
    cells[c.k] = r;
    if (r.g === "none") return; // data, but nothing to grade yet (e.g. Spotify's first month)
    graded++;
    sum += GVAL[r.g] * w[c.k]; wsum += w[c.k];
  });
  const aff = AFFIL.in(m) ? AFFIL.grade(m) : { g: "none" as Grade, v: "not in the pilot", n: 0 };
  const totalW = CHANNELS.reduce((a, c) => a + w[c.k], 0);
  const missing = totalW - wsum;
  const priorW = missing * 0.85;
  const score = wsum ? (sum + 45 * priorW) / (wsum + priorW) : null;
  return { cells, score, graded, m, press, aff };
}

export function rosterArray(roster: Roster, metrics: Metrics, month: string | null): GradedArtist[] {
  const prev = month ? prevMonthOf(month) : null;
  return Object.keys(roster).map((name) => {
    const a = roster[name];
    const g = gradeArtist(roster, metrics, name, month);
    const gp = gradeArtist(roster, metrics, name, prev);
    const o: GradedArtist = {
      name, tier: a.tier, status: a.status, region: a.region || "", code: a.code || "", yt: a.yt || "",
      note: a.note || "", category: a.category || "", mainPlatform: a.mainPlatform || "", score: g.score, graded: g.graded, cells: g.cells, m: g.m, press: g.press, aff: g.aff,
      delta: (g.score != null && gp.score != null && gp.graded) ? g.score - gp.score : null,
      gInstagram: 0, gYoutube: 0, gMeta: 0, gSearch: 0, gAffiliate: 0, npress: g.press.length,
      spListeners: g.m.spListeners ?? -1, spPrev: gp.m.spListeners ?? null,
    };
    CHANNELS.forEach((c) => {
      (o as unknown as Record<string, number>)["g" + c.k] = g.cells[c.k].g === "none" ? -1 : GVAL[g.cells[c.k].g];
    });
    o.gAffiliate = g.aff.g === "none" ? -1 : GVAL[g.aff.g];
    return o;
  });
}

function prevMonthOf(m: string): string {
  const d = new Date(m + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export interface Totals { ytQual: number; gscClicks: number; adRev: number; adConv: number; igEng: number; fbEng: number; press: number; n: number }
export function totals(metrics: Metrics, month: string | null): Totals {
  const t: Totals = { ytQual: 0, gscClicks: 0, adRev: 0, adConv: 0, igEng: 0, fbEng: 0, press: 0, n: 0 };
  const m = (month && metrics[month]) || {};
  Object.keys(m).forEach((k) => {
    const d = m[k];
    t.ytQual += d.ytQual || 0; t.gscClicks += d.gscClicks || 0; t.adRev += d.adRev || 0; t.adConv += d.adConv || 0;
    t.igEng += d.igEng || 0; t.fbEng += d.fbEng || 0; t.press += Array.isArray(d.press) ? d.press.length : 0; t.n++;
  });
  return t;
}

export function medianSupported(all: GradedArtist[]): number | null {
  const sup = all.filter((a) => supported(a) && a.status === "A" && a.score != null).map((a) => a.score as number).sort((x, y) => x - y);
  return sup.length ? sup[Math.floor(sup.length / 2)] : null;
}

/** Comment-column read: what the tool would say if nobody typed one. */
export function readOut(a: GradedArtist): { t: string; own: boolean } {
  if (a.note) return { t: a.note, own: true };
  if (a.score == null) return { t: "Nothing recorded for the past 30 days.", own: false };
  const strong: string[] = [], weakish: string[] = [], silent: string[] = [];
  CHANNELS.forEach((c) => {
    const g = a.cells[c.k].g;
    if (g === "strong") strong.push(c.label);
    else if (g === "ok" || g === "weak") weakish.push(c.label);
    else if (g === "silent") silent.push(c.label);
  });
  const bits: string[] = [];
  const andList = (arr: string[]) => arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? arr[0] + " and " + arr[1] : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  if (strong.length) bits.push("Carrying " + andList(strong));
  if (silent.length) bits.push((bits.length ? "nothing from " : "Nothing from ") + andList(silent));
  if (weakish.length && bits.length < 2) bits.push((bits.length ? "thin on " : "Ticking over on ") + andList(weakish));
  if (!bits.length) bits.push("Quiet everywhere we can see");
  if (bits.length < 2 && a.graded < CHANNELS.length) bits.push(`only ${a.graded} of ${CHANNELS.length} channels ${a.graded === 1 ? "has" : "have"} data`);
  let t = bits.join(", ") + ".";
  if (a.aff.g === "strong" || a.aff.g === "ok") t += " " + a.aff.v.split(" · ")[0] + " through the link.";
  if (a.press.length) t += " " + (a.press.length === 1 ? "Press: " + (a.press[0].o || "one piece") : a.press.length + " pieces of press") + ".";
  return { t, own: false };
}

export interface GrowthRead {
  k: "cold" | "warm" | "good"; h: string; body: string; producing: number; supN: number;
  conc: number | null; cSearch: { share: number; top: number[]; tot: number } | null;
  t: Totals; dSearch: number | null; dViews: number | null; months: number; scored: GradedArtist[];
}

function topShare(arr: GradedArtist[], key: "gscClicks" | "ytQual", n: number) {
  const v = arr.map((a) => a.m[key] || 0).sort((x, y) => y - x);
  const tot = v.reduce((s, x) => s + x, 0);
  if (!tot) return null;
  return { share: v.slice(0, n).reduce((s, x) => s + x, 0) / tot, top: v.slice(0, n), tot };
}

/** Three things decide whether the programme reads as a growth engine: how
 * much of the roster produces anything at all, how concentrated that output
 * is on a handful of people, and which way search demand is moving. */
export function growthRead(roster: Roster, metrics: Metrics, month: string | null): GrowthRead | null {
  const months = Object.keys(metrics).sort();
  if (!months.length) return null;
  const arr = rosterArray(roster, metrics, month).filter((a) => a.status === "A");
  const sup = arr.filter(supported);
  const scored = arr.filter((a) => a.score != null);
  const t = totals(metrics, month);
  const idx = month ? months.indexOf(month) : -1;
  const prevM = idx > 0 ? months[idx - 1] : null;
  const pt = prevM ? totals(metrics, prevM) : null;

  let producing = 0;
  sup.forEach((a) => { if (a.score != null && a.score >= 46) producing++; });

  const cSearch = topShare(scored, "gscClicks", 3);
  const cViews = topShare(scored, "ytQual", 3);
  const conc = cSearch ? cSearch.share : (cViews ? cViews.share : null);

  const dSearch = pt && pt.gscClicks ? ((t.gscClicks - pt.gscClicks) / pt.gscClicks) * 100 : null;
  const dViews = pt && pt.ytQual ? ((t.ytQual - pt.ytQual) / pt.ytQual) * 100 : null;

  let codes = 0; Object.keys(roster).forEach((n) => { if (roster[n].code) codes++; });

  let k: GrowthRead["k"], h: string, body: string;
  const supN = sup.length, share = supN ? producing / supN : 0;
  if (!scored.length) {
    k = "cold"; h = "Nothing measured yet for the past 30 days.";
    body = "Import a month from each source and this line answers itself.";
  } else if (share < 0.3) {
    k = "cold"; h = "Most of the roster is not contributing.";
    body = `${producing} of ${supN} supported collaborations produced something we can measure over the past 30 days. The rest are either quiet or have no data flowing at all — and the two look identical from here, which is its own problem worth fixing before any of this can be called an engine.`;
  } else if (conc != null && conc > 0.7) {
    k = "warm"; h = "Working — but carried by a handful of people.";
    body = `${producing} of ${supN} supported collaborations are producing, and the top three account for ${n2(conc * 100, 0)} % of everything measured. That is a real engine with a single point of failure: if one of them goes quiet, the programme's numbers go with them.`;
  } else if (share >= 0.55) {
    k = "good"; h = "Contributing broadly across the roster.";
    body = `${producing} of ${supN} supported collaborations are producing, and the output is spread rather than resting on two or three names. This is what the programme is supposed to look like.`;
  } else {
    k = "warm"; h = "Half the roster is pulling.";
    body = `${producing} of ${supN} supported collaborations are producing over the past 30 days. The other half is the opportunity — most of them need a conversation, not a replacement.`;
  }
  if (months.length < 2) body += " This is the first snapshot recorded, so treat every number here as a baseline rather than a trend.";
  else if (dSearch != null) body += ` Artist-linked search is ${dSearch >= 0 ? "up " : "down "}${n2(Math.abs(dSearch), 0)} % on ${prevM}, which is the number that tracks demand arriving at the site.`;
  if (!codes) body += " No artist has a tracked AdTraction link against their name yet, so none of this can be tied to revenue — that is the single biggest gap between this page and a growth case.";

  return { k, h, body, producing, supN, conc, cSearch, t, dSearch, dViews, months: months.length, scored };
}
