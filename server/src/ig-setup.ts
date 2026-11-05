/**
 * One-time Instagram setup: `npm run ig:setup` from the repo root.
 *
 * Takes a short-lived user token from Meta's Graph API Explorer, swaps it
 * for a 60-day token, finds Strandberg's Instagram professional account,
 * checks a real lookup works, and writes META_ACCESS_TOKEN / IG_USER_ID /
 * META_TOKEN_EXPIRES into .env. The app secret is used once for the swap
 * and never saved.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { graphBase, instagramStats } from "./instagram.js";

const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");

async function graph<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${graphBase()}/${pathAndQuery}`);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message || `HTTP ${res.status}`);
  return body;
}

/** Set KEY=value lines in .env, keeping every other line exactly as it was. */
function writeEnv(values: Record<string, string>) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const done = new Set<string>();
  const out = lines.map((line) => {
    const k = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (k && k in values) { done.add(k); return `${k}=${values[k]}`; }
    return line;
  });
  const missing = Object.keys(values).filter((k) => !done.has(k));
  if (missing.length) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("# Instagram (written by npm run ig:setup)", ...missing.map((k) => `${k}=${values[k]}`), "");
  }
  fs.writeFileSync(ENV_FILE, out.join("\n"));
}

async function main() {
  // Queue input lines so nothing is lost if they arrive before the question
  // is asked (pasting several at once, or piped input).
  const rl = readline.createInterface({ input: process.stdin });
  const queued: string[] = [];
  let waiting: ((line: string) => void) | null = null;
  let closed = false;
  rl.on("line", (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queued.push(l); });
  rl.on("close", () => { closed = true; if (waiting) waiting(""); });
  const ask = (q: string) => {
    process.stdout.write(q);
    if (queued.length) return Promise.resolve(queued.shift()!);
    if (closed) return Promise.resolve("");
    return new Promise<string>((r) => { waiting = r; });
  };
  console.log(`
Instagram setup — you'll need, from developers.facebook.com:
  • your Meta app's App ID and App Secret (App settings → Basic)
  • a user token from Graph API Explorer (Tools → Graph API Explorer), with permissions:
      instagram_basic, instagram_manage_insights, pages_read_engagement, pages_show_list
    (add business_management too if Strandberg's Facebook Page is owned through Business Manager)
`);
  const appId = (await ask("App ID: ")).trim();
  const appSecret = (await ask("App Secret (used once, not saved): ")).trim();
  const shortToken = (await ask("Graph API Explorer token: ")).trim();
  if (!appId || !appSecret || !shortToken) throw new Error("All three are needed.");

  console.log("\nSwapping for a 60-day token…");
  const long = await graph<{ access_token: string; expires_in?: number }>(
    `oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  );
  const token = long.access_token;
  const expires = new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000).toISOString().slice(0, 10);

  console.log("Finding Instagram accounts linked to your Facebook Pages…");
  type PageRow = { name: string; instagram_business_account?: { id: string; username?: string } };
  const igField = "name,instagram_business_account{id,username}";
  const enc = encodeURIComponent(token);

  // Pages you have a direct role on.
  const direct = await graph<{ data: PageRow[] }>(`me/accounts?fields=${igField}&limit=100&access_token=${enc}`).catch(() => ({ data: [] as PageRow[] }));
  // Pages owned through a Meta Business Suite / Business Manager portfolio —
  // these don't show up above. Needs business_management; skipped if not granted.
  const viaBusiness: PageRow[] = [];
  const biz = await graph<{ data: { name: string; owned_pages?: { data: PageRow[] }; client_pages?: { data: PageRow[] } }[] }>(
    `me/businesses?fields=name,owned_pages.limit(100){${igField}},client_pages.limit(100){${igField}}&limit=50&access_token=${enc}`,
  ).catch(() => null);
  for (const b of biz?.data ?? []) viaBusiness.push(...(b.owned_pages?.data ?? []), ...(b.client_pages?.data ?? []));

  const seen = new Set<string>();
  const allPages = [...direct.data, ...viaBusiness];
  const accounts = allPages.filter((p) => {
    const id = p.instagram_business_account?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (!accounts.length) {
    // Say exactly what the token can and can't see, so the fix is obvious.
    const perms = await graph<{ data: { permission: string; status: string }[] }>(`me/permissions?access_token=${enc}`).catch(() => ({ data: [] }));
    const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);
    const need = ["instagram_basic", "instagram_manage_insights", "pages_read_engagement", "pages_show_list"];
    const lacking = need.filter((p) => !granted.includes(p));
    const pageNames = [...new Set(allPages.map((p) => p.name))];
    const lines = [
      "No Instagram professional account was found on any Facebook Page this token can see.",
      "",
      `Pages the token can see: ${pageNames.length ? pageNames.join(", ") : "none"}`,
      `Permissions granted: ${granted.length ? granted.join(", ") : "none reported"}`,
      lacking.length ? `Missing permissions: ${lacking.join(", ")}` : "",
      biz ? "" : "Couldn't check Business Suite Pages (business_management not granted).",
      "",
      "What to try:",
      !pageNames.length
        ? "  • In Graph API Explorer, generate a new token and, when Facebook asks which Pages/Instagram accounts to share, choose Strandberg's (or \"Opt in to all current and future\")."
        : "  • Strandberg's Page is visible but has no Instagram linked through it — link the Instagram account to that Page (Meta Business Suite → Settings → Instagram accounts), then try again.",
      !biz ? "  • If Strandberg's Page is managed in Meta Business Suite, add business_management (and ads_read) to the token." : "",
      lacking.length ? `  • Add the missing permissions (${lacking.join(", ")}) when generating the token.` : "",
    ];
    throw new Error(lines.filter((l, i, arr) => l !== "" || (arr[i - 1] ?? "") !== "").join("\n"));
  }
  let pick = accounts[0];
  if (accounts.length > 1) {
    accounts.forEach((a, i) => console.log(`  ${i + 1}. @${a.instagram_business_account!.username} (Page: ${a.name})`));
    const n = Number(await ask("Which one is Strandberg's? ")) - 1;
    pick = accounts[n] || accounts[0];
  }
  const ig = pick.instagram_business_account!;
  console.log(`Using @${ig.username} (ID ${ig.id}).`);

  // Prove it end to end with the same call Sync makes.
  process.env.META_ACCESS_TOKEN = token;
  process.env.IG_USER_ID = ig.id;
  const test = (await ask("Test on an artist's Instagram username (Enter to test on your own account): ")).trim() || ig.username || "";
  rl.close();
  process.stdout.write("\n");
  const today = new Date();
  const start = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const stats = await instagramStats(test, start, today.toISOString().slice(0, 10));
  console.log(`  @${test.replace(/^@/, "")}: ${stats.followers.toLocaleString("en-US")} followers, ${stats.posts} posts in the past 30 days, ${stats.engagement.toLocaleString("en-US")} likes + comments`);

  writeEnv({ META_ACCESS_TOKEN: token, IG_USER_ID: ig.id, META_TOKEN_EXPIRES: expires });
  console.log(`\nSaved to .env. The token lasts until ${expires} — run this again before then.\nRestart the app (npm run app) to start using it.`);
}

main().catch((e) => {
  console.error(`\nSetup failed: ${(e as Error).message}`);
  process.exit(1);
});
