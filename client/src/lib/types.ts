export interface PressItem { h: string; o: string; u: string }

/** A band or project the artist plays in. Tracked like a mini artist: its own
 * profile links and its own numbers per month (graded with the artist's Type
 * weighting, but never counted in the artist's score or the roster totals). */
export interface Band {
  /** Older entries may lack an id; one is assigned the next time bands are saved. */
  id?: string;
  name: string;
  link: string;
  ig?: string; fb?: string; yt?: string; sp?: string;
  /** month recorded ("2026-10") -> numbers, same shape as an artist's */
  metrics?: Record<string, MonthMetrics>;
}

export interface ArtistMeta {
  tier: string;
  status: "A" | "I" | "T";
  region: string;
  owner?: string;
  /** Profile links (or handles), one per platform — Sync opens these
   * directly instead of searching by name. */
  yt?: string;
  ig?: string;
  fb?: string;
  sp?: string;
  code?: string;
  /** Bands or projects the artist plays in, each with its most relevant link. */
  bands?: Band[];
  /** Older single-band fields; read once and folded into `bands` on the next save. */
  band?: string;
  bandLink?: string;
  lastCheck?: string;
  note?: string;
  /** Long-form ideas for what to do with this artist next (content, events, campaigns…). */
  activities?: string;
  /** Contract anniversary (YYYY-MM-DD); recurs every year on this month/day. */
  contractAnniversary?: string;
  /** "influencer" | "live" | "both" | "other" — see lib/categories.ts */
  category?: string;
  /** Column key of the artist's main platform, e.g. "Instagram" or "Youtube". */
  mainPlatform?: string;
}

export type Roster = Record<string, ArtistMeta>;

export interface MonthMetrics {
  ytSubs?: number; ytVids?: number; ytViews?: number; ytQual?: number; ytRate?: number;
  igFollowers?: number; igPosts?: number; igEng?: number;
  /** Facebook (shown as "Meta"); the ig* fields are Instagram. */
  fbFollowers?: number; fbPosts?: number; fbEng?: number;
  gscClicks?: number; gscImpr?: number; gscQueries?: number;
  adClicks?: number; adConv?: number; adRev?: number;
  spListeners?: number;
  /** Date (YYYY-MM-DD) these numbers were recorded; activity counts cover the 30 days up to it. */
  asOf?: string;
  press?: PressItem[];
}

/** month recorded ("2026-08") -> artist name -> that artist's numbers.
 * Activity counts cover the 30 days before `asOf`, not the calendar month. */
export type Metrics = Record<string, Record<string, MonthMetrics>>;

/** An uploaded contract PDF, stored on this machine. */
export interface Contract { id: string; artist: string; fileName: string; size: number; uploadedAt: string }

export type InvolvementStatus = "proposed" | "pending" | "rejected" | "confirmed";

/** Artist Involvement: an event and the roster artists taking part in it. */
export interface InvolvementEvent {
  id: string;
  name: string;
  /** YYYY-MM-DD, or "" if not set yet */
  date: string;
  description: string;
  /** `name` is the roster key; `role` is what they're involved with */
  artists: { name: string; role: string; status?: InvolvementStatus }[];
}

export interface ImportEntry { at: string; month?: string; rows: number }
export type Imports = Record<string, ImportEntry>;

export interface AppState {
  roster: Roster;
  metrics: Metrics;
  imports: Imports;
  events: InvolvementEvent[];
  contracts: Contract[];
}

export type Grade = "strong" | "ok" | "weak" | "silent" | "none";
export interface ChannelCell { g: Grade; v: string; n: number }

export interface GradedArtist {
  name: string;
  tier: string;
  status: ArtistMeta["status"];
  region: string;
  code: string;
  yt: string;
  note: string;
  category: string;
  mainPlatform: string;
  score: number | null;
  graded: number;
  cells: Record<string, ChannelCell>;
  m: MonthMetrics;
  press: PressItem[];
  aff: ChannelCell;
  delta: number | null;
  gYoutube: number;
  gInstagram: number;
  gMeta: number;
  gSearch: number;
  gAffiliate: number;
  /** Spotify monthly listeners, -1 when not entered (sorts below zero). Shown, never scored. */
  spListeners: number;
  spPrev: number | null;
  npress: number;
}
