import Anthropic from "@anthropic-ai/sdk";

/** The metric fields Sync can fill in. Only numbers that are publicly
 * visible are asked for — anything Claude can't find stays null and the
 * existing value (or "no data") is left alone. */
export const SYNC_FIELDS = {
  igFollowers: "Instagram followers (current)",
  igPosts: "Instagram posts published in the 30-day window",
  fbFollowers: "Facebook page followers (current)",
  fbPosts: "Facebook page posts published in the 30-day window",
  ytSubs: "YouTube subscribers (current)",
  ytVids: "YouTube uploads (videos, Shorts and live streams) published in the 30-day window",
  spListeners: "Spotify monthly listeners (as shown on the artist's Spotify page)",
} as const;
export type SyncField = keyof typeof SYNC_FIELDS;

/** Same rule as the client (client/src/lib/format.ts → windowFor): the 30
 * days ending today for the current month, or ending on the month's last
 * day for a past month. */
export function windowFor(month: string, now = new Date()): { start: string; end: string } {
  const local = (d: Date) => `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${("0" + d.getDate()).slice(-2)}`;
  const todayStr = local(now);
  let end = todayStr;
  if (month < todayStr.slice(0, 7)) {
    const [y, m] = month.split("-").map(Number);
    end = local(new Date(y, m, 0));
  }
  const e = new Date(end + "T12:00:00");
  e.setDate(e.getDate() - 29);
  return { start: local(e), end };
}

export interface SyncOutcome {
  values: Partial<Record<SyncField, number>>;
  sources: string[];
  note: string;
}

const MODEL = "claude-opus-5";
const MAX_CONTINUATIONS = 3;

export function syncConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Profile links entered by hand on the artist — the account may not be
 * under the artist's own name, so these take priority over searching. */
export interface ProfileLinks { ig?: string; fb?: string; yt?: string; sp?: string }
const LINK_LABELS: Record<keyof ProfileLinks, string> = { ig: "Instagram", fb: "Facebook", yt: "YouTube", sp: "Spotify" };

function buildPrompt(name: string, month: string, links: ProfileLinks, skip: SyncField[]): string {
  const win = windowFor(month);
  const wanted = (Object.keys(SYNC_FIELDS) as SyncField[]).filter((k) => !skip.includes(k));
  const fields = wanted.map((k) => `- ${k}: ${SYNC_FIELDS[k]}`).join("\n");
  const given = (Object.keys(LINK_LABELS) as (keyof ProfileLinks)[]).filter((k) => links[k]);
  const linkBlock = given.length
    ? `\n\nThese are the artist's confirmed profiles — they may not be under the artist's name, so trust them over anything you find by searching. Open them directly with web fetch first; only fall back to web search for a platform if the page won't load or doesn't show the number:\n${given.map((k) => `- ${LINK_LABELS[k]}: ${links[k]}`).join("\n")}`
    : "";
  return `Look up public social-media and streaming numbers for the musician "${name}" (a guitarist/musician collaborating with Strandberg Guitars).${linkBlock}

The 30-day window is ${win.start} to ${win.end} (inclusive). Find each of these:
${fields}

Rules:
- Only report a number you actually found on a public page (the platform itself, or a stats site that shows it). Never estimate or guess — use null instead.
- Make sure each account really belongs to this artist, not someone with a similar name. If unsure, use null.
- "30-day window" fields count only items published between ${win.start} and ${win.end}; if you can't count them reliably, use null.
- Follower, subscriber and listener counts are the current figure shown on the page.
- Instagram and Facebook profile pages usually require a login and won't load. Search results often still show the follower count. Only report a post count if you can see the individual posts' dates.

When you're done, reply with ONLY a JSON object, no other text, in exactly this shape:
{"values": {${wanted.map((k) => `"${k}": number | null`).join(", ")}}, "sources": ["url", ...], "note": "one short sentence on what you found or couldn't find"}`;
}

/** Pull the last JSON object out of Claude's final text. */
function parseOutcome(text: string): SyncOutcome {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Claude didn't return any numbers.");
  const raw = JSON.parse(text.slice(start, end + 1)) as { values?: Record<string, unknown>; sources?: unknown; note?: unknown };
  const values: SyncOutcome["values"] = {};
  for (const k of Object.keys(SYNC_FIELDS) as SyncField[]) {
    const v = raw.values?.[k];
    if (typeof v === "number" && isFinite(v) && v >= 0) values[k] = Math.round(v);
  }
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((s): s is string => typeof s === "string").slice(0, 10) : [];
  return { values, sources, note: typeof raw.note === "string" ? raw.note : "" };
}

/** `skip` lists fields already measured another way (e.g. YouTube uploads), so Claude isn't asked for them. */
export async function syncArtistStats(name: string, month: string, links: ProfileLinks, skip: SyncField[] = []): Promise<SyncOutcome> {
  // Org-level API keys (not scoped to one workspace) must say which
  // workspace to bill; workspace-scoped keys don't need this.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildPrompt(name, month, links, skip) }];

  let response: Anthropic.Beta.BetaMessage | undefined;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // Each search is billed; five is plenty for a handful of follower counts.
      tools: [
        // Fetch opens the hand-entered profile links (it can only open URLs
        // already in the conversation); search covers anything without one.
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
        { type: "web_search_20260209", name: "web_search", max_uses: 5 },
      ],
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    // The server-side search loop can pause; resend so it picks up where it left off.
    if (response.stop_reason !== "pause_turn") break;
    messages.splice(1, messages.length - 1, { role: "assistant", content: response.content });
  }
  if (!response) throw new Error("No response from Claude.");
  if (response.stop_reason === "refusal") throw new Error("Claude declined this lookup.");
  if (response.stop_reason === "pause_turn") throw new Error("The lookup took too many steps — try again.");

  const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
  return parseOutcome(text);
}
