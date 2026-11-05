/** Artist type and main platform — set by hand per artist, saved on the
 * roster entry. Display and filtering only; neither feeds the score. */

export type Category = "influencer" | "live" | "both" | "other";

export const CATEGORIES: { k: Category; label: string }[] = [
  { k: "influencer", label: "Influencer" },
  { k: "live", label: "Live Artist" },
  { k: "both", label: "Both" },
  { k: "other", label: "Other" },
];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.k, c.label]));

/** Keys match the roster table's column keys, so the table can highlight
 * the main platform's cell directly. */
/** Which roster field holds each platform's profile link. */
export type LinkKey = "ig" | "fb" | "yt" | "sp";
export const PROFILE_LINKS: { k: LinkKey; label: string; placeholder: string }[] = [
  { k: "ig", label: "Instagram", placeholder: "instagram.com/handle" },
  { k: "fb", label: "Facebook", placeholder: "facebook.com/page" },
  { k: "yt", label: "YouTube", placeholder: "youtube.com/@handle" },
  { k: "sp", label: "Spotify", placeholder: "open.spotify.com/artist/…" },
];

export const PLATFORMS: { k: string; label: string }[] = [
  { k: "Instagram", label: "Instagram" },
  { k: "Meta", label: "Meta (Facebook)" },
  { k: "Youtube", label: "YouTube" },
  { k: "spotify", label: "Spotify" },
];
