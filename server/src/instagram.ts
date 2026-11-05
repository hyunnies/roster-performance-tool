/**
 * Instagram numbers via Meta's Business Discovery API: any public
 * professional (creator/business) account's follower count and recent posts,
 * read through Strandberg's own Instagram professional account. Free, exact,
 * no AI involved. Personal (non-professional) and age-gated accounts can't
 * be read this way — those still need entering by hand.
 *
 * Setup: `npm run ig:setup` (see src/ig-setup.ts) writes META_ACCESS_TOKEN
 * and IG_USER_ID into .env.
 */

/** A function, not a constant: .env is loaded after imports are evaluated. */
export const graphBase = () => process.env.META_GRAPH_URL || "https://graph.facebook.com/v25.0";

export function instagramConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.IG_USER_ID);
}

/** "@handle", "instagram.com/handle/", "https://www.instagram.com/handle/reels" → "handle". */
export function igUsername(link: string): string | null {
  const s = link.trim();
  const at = s.match(/^@?([A-Za-z0-9._]{1,30})$/);
  if (at && !s.includes("/")) return at[1];
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9._]{1,30})(?:[/?#]|$)/i);
  if (!m || ["p", "reel", "reels", "stories", "explore"].includes(m[1].toLowerCase())) return null;
  return m[1];
}

export interface InstagramStats {
  followers: number;
  posts: number;
  /** likes + comments on posts inside the window; likes are missing where the artist hides them */
  engagement: number;
  hiddenLikes: boolean;
}

interface Media { timestamp?: string; like_count?: number; comments_count?: number }
interface Discovery {
  business_discovery?: {
    followers_count?: number;
    media?: { data?: Media[]; paging?: { cursors?: { after?: string } } };
  };
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** A failure worth showing the user as-is (bad token, account not readable). */
export class InstagramError extends Error {}

export async function instagramStats(link: string, start: string, end: string): Promise<InstagramStats> {
  const username = igUsername(link);
  if (!username) throw new InstagramError("the Instagram link doesn't look like a profile link");
  const token = process.env.META_ACCESS_TOKEN!, me = process.env.IG_USER_ID!;
  const s = new Date(start + "T00:00:00").getTime(), e = new Date(end + "T23:59:59").getTime();

  let followers = 0, posts = 0, engagement = 0, hiddenLikes = false, after = "";
  // Newest first; page back until a post predates the window (cap: 4 × 50 posts).
  for (let page = 0; page < 4; page++) {
    const mediaEdge = `media${after ? `.after(${after})` : ""}.limit(50){timestamp,like_count,comments_count}`;
    const fields = `business_discovery.username(${username}){followers_count,${mediaEdge}}`;
    const url = `${graphBase()}/${me}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as Discovery;

    if (body.error || !res.ok) {
      const code = body.error?.code;
      if (code === 190) throw new InstagramError("the Meta access token has expired or was revoked — run `npm run ig:setup` again");
      if (code === 10 || code === 200) throw new InstagramError("the Meta token is missing a permission (needs instagram_basic, instagram_manage_insights, pages_read_engagement) — run `npm run ig:setup` again");
      if (code === 4 || code === 17 || code === 32) throw new InstagramError("Meta is rate-limiting requests right now — try again in a few minutes");
      // Most other failures here mean the target can't be discovered.
      throw new InstagramError(`@${username} couldn't be read — it may be a personal (not creator/business) account, age-restricted, or the username is wrong (${body.error?.message || res.status})`);
    }

    const bd = body.business_discovery;
    if (!bd) throw new InstagramError(`@${username} couldn't be read`);
    if (page === 0) followers = bd.followers_count ?? 0;
    const media = bd.media?.data ?? [];
    if (media.length && media.every((m) => !m.timestamp)) {
      throw new InstagramError("Meta didn't return post dates, so posts can't be counted");
    }
    let older = false;
    for (const m of media) {
      const t = m.timestamp ? new Date(m.timestamp).getTime() : NaN;
      if (isNaN(t)) continue;
      if (t < s) { older = true; continue; }
      if (t > e) continue;
      posts++;
      if (m.like_count == null) hiddenLikes = true;
      engagement += (m.like_count ?? 0) + (m.comments_count ?? 0);
    }
    after = bd.media?.paging?.cursors?.after || "";
    if (older || !after || !media.length) break;
  }
  return { followers, posts, engagement, hiddenLikes };
}
