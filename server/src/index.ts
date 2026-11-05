import express from "express";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedRoster } from "./seed.js";
import Anthropic from "@anthropic-ai/sdk";
import { SYNC_FIELDS, syncArtistStats, syncConfigured, windowFor, type ProfileLinks, type SyncField, type SyncOutcome } from "./sync.js";
import { countYouTubeUploads } from "./youtube.js";
import { InstagramError, instagramConfigured, instagramStats } from "./instagram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Secrets (e.g. ANTHROPIC_API_KEY) live in a git-ignored .env at the repo
// root. Anything already set in the real environment wins.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // No .env file — fine; sync just stays disabled.
}
const DATA_DIR = path.resolve(__dirname, "../data");
const ROSTER_FILE = path.join(DATA_DIR, "roster.json");
const METRICS_FILE = path.join(DATA_DIR, "metrics.json");
const IMPORTS_FILE = path.join(DATA_DIR, "imports.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const CONTRACTS_FILE = path.join(DATA_DIR, "contracts.json");
const CONTRACTS_DIR = path.join(DATA_DIR, "contracts");
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");

type JsonValue = Record<string, unknown>;

async function readJson<T extends JsonValue>(file: string, fallback: T): Promise<T> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Atomic-ish write: write to a temp file then rename, so a crash mid-write
 * never leaves a data file truncated or corrupt. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

async function getRoster() {
  const roster = await readJson(ROSTER_FILE, {} as JsonValue);
  if (!Object.keys(roster).length) {
    const seeded = seedRoster();
    await writeJson(ROSTER_FILE, seeded);
    return seeded as unknown as JsonValue;
  }
  return roster;
}

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/state", async (_req, res) => {
  try {
    const [roster, metrics, imports, events, contracts] = await Promise.all([
      getRoster(),
      readJson(METRICS_FILE, {} as JsonValue),
      readJson(IMPORTS_FILE, {} as JsonValue),
      readJson(EVENTS_FILE, { events: [] } as JsonValue),
      readContracts(),
    ]);
    res.json({ roster, metrics, imports, events: Array.isArray(events.events) ? events.events : [], contracts });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

app.put("/api/roster", async (req, res) => {
  try {
    await writeJson(ROSTER_FILE, req.body || {});
    res.json(req.body || {});
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

app.put("/api/metrics/:month", async (req, res) => {
  try {
    const metrics = await readJson(METRICS_FILE, {} as JsonValue);
    metrics[req.params.month] = req.body || {};
    await writeJson(METRICS_FILE, metrics);
    res.json(metrics);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

// Contracts: PDFs stored on this machine in data/contracts/<id>.pdf, with a
// small index (artist, original file name, size, upload time) in
// contracts.json. Files are named by a server-generated id, never by anything
// the browser sends, so an upload can't write outside that folder.
interface ContractMeta { id: string; artist: string; fileName: string; size: number; uploadedAt: string }

async function readContracts(): Promise<ContractMeta[]> {
  const data = await readJson(CONTRACTS_FILE, { contracts: [] } as JsonValue);
  return Array.isArray(data.contracts) ? (data.contracts as ContractMeta[]) : [];
}
const contractPath = (id: string) => path.join(CONTRACTS_DIR, `${id}.pdf`);
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

app.post("/api/contracts", express.raw({ type: "application/pdf", limit: "25mb" }), async (req, res) => {
  try {
    const artist = String(req.query.artist || "");
    const fileName = String(req.query.fileName || "contract.pdf").replace(/[\\/\r\n]/g, "_").slice(0, 200);
    const roster = await getRoster();
    if (!roster[artist]) { res.status(404).json({ error: `${artist} isn't on the roster.` }); return; }
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) { res.status(400).json({ error: "The file was empty." }); return; }
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") { res.status(400).json({ error: "That isn't a PDF — save or export the contract as PDF first." }); return; }

    const meta: ContractMeta = { id: randomUUID(), artist, fileName, size: body.length, uploadedAt: new Date().toISOString() };
    await fs.mkdir(CONTRACTS_DIR, { recursive: true });
    await fs.writeFile(contractPath(meta.id), body);
    const all = await readContracts();
    await writeJson(CONTRACTS_FILE, { contracts: [...all, meta] });
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

app.get("/api/contracts/:id/file", async (req, res) => {
  const { id } = req.params;
  const meta = validId(id) ? (await readContracts()).find((c) => c.id === id) : undefined;
  if (!meta) { res.status(404).send("Contract not found."); return; }
  res.setHeader("Content-Type", "application/pdf");
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`);
  res.sendFile(contractPath(id), (err) => { if (err && !res.headersSent) res.status(404).send("Contract file is missing."); });
});

app.delete("/api/contracts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) { res.status(404).json({ error: "Contract not found." }); return; }
    const all = await readContracts();
    await writeJson(CONTRACTS_FILE, { contracts: all.filter((c) => c.id !== id) });
    await fs.rm(contractPath(id), { force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

// Artist Involvement: the whole events list, saved in one go (it's small).
app.put("/api/events", async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: "Expected a list of events." });
      return;
    }
    await writeJson(EVENTS_FILE, { events: req.body });
    res.json(req.body);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

app.put("/api/imports", async (req, res) => {
  try {
    await writeJson(IMPORTS_FILE, req.body || {});
    res.json(req.body || {});
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

function friendlyError(e: unknown): string {
  return e instanceof Anthropic.AuthenticationError ? "The Anthropic API key in .env was rejected — check it was copied in full."
    : e instanceof Anthropic.PermissionDeniedError ? "The Anthropic API key doesn't have access to this (check billing / card on file with the key holder)."
    : e instanceof Anthropic.RateLimitError ? "Anthropic is rate-limiting this key right now — wait a minute and try again."
    : e instanceof Anthropic.APIError ? `Anthropic returned an error (${e.status}): ${(e.error as { error?: { message?: string } } | undefined)?.error?.message || "details are in the terminal running the app."}`
    : (e as Error).message;
}

// Per-artist "Sync stats". Uses Claude with web search to look up an
// artist's public numbers (followers, subscribers, Spotify listeners).
// Every call is billed to the Anthropic key's card, so it only ever runs
// when someone presses the button — and only for one artist at a time.
app.post("/api/sync/:name", async (req, res) => {
  const name = req.params.name;
  const month = String(req.query.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Pick a month first." });
    return;
  }
  const roster = await getRoster() as Record<string, ProfileLinks>;
  if (!roster[name]) {
    res.status(404).json({ error: `${name} isn't on the roster.` });
    return;
  }
  if (!syncConfigured()) {
    res.status(501).json({ error: "No Anthropic API key is set, so nothing was synced. Add ANTHROPIC_API_KEY to the .env file in the project folder and restart the app." });
    return;
  }
  try {
    // Links typed in the drawer just now win over the saved roster ones.
    const sent = (req.body && typeof req.body.links === "object" ? req.body.links : {}) as Record<string, unknown>;
    const links: ProfileLinks = {};
    for (const k of ["ig", "fb", "yt", "sp"] as const) {
      const v = typeof sent[k] === "string" ? (sent[k] as string).trim() : (roster[name][k] || "").trim();
      if (v) links[k] = v.slice(0, 300);
    }
    const win = windowFor(month);
    const settle = <T,>(p: Promise<T>) => p.then((ok) => ({ ok, err: undefined as unknown }), (err: unknown) => ({ ok: undefined, err }));

    // Measured directly where we can (free, exact): YouTube uploads from the
    // channel's public pages, Instagram via Meta's Business Discovery API.
    // Claude covers whatever's left. All three run at once.
    const useIg = !!links.ig && instagramConfigured();
    const skip: SyncField[] = [...(links.yt ? ["ytVids" as const] : []), ...(useIg ? ["igFollowers" as const, "igPosts" as const] : [])];
    const [yt, ig, claude] = await Promise.all([
      links.yt ? countYouTubeUploads(links.yt, win.start, win.end).catch(() => null) : Promise.resolve(null),
      useIg ? settle(instagramStats(links.ig!, win.start, win.end)) : Promise.resolve(null),
      settle(syncArtistStats(name, month, links, skip)),
    ]);
    if (claude.err && !yt && !ig?.ok) throw claude.err;
    const out: SyncOutcome = claude.ok || { values: {}, sources: [], note: "" };
    const values: Record<string, number> = { ...out.values };
    if (yt) values.ytVids = yt.total;
    if (ig?.ok) {
      values.igFollowers = ig.ok.followers;
      values.igPosts = ig.ok.posts;
      values.igEng = ig.ok.engagement;
    }

    const found = Object.keys(values);
    const metrics = await readJson(METRICS_FILE, {} as JsonValue) as Record<string, Record<string, Record<string, unknown>>>;
    if (found.length) {
      const monthData = metrics[month] || (metrics[month] = {});
      monthData[name] = { ...(monthData[name] || {}), ...values, asOf: win.end };
      await writeJson(METRICS_FILE, metrics);
    }
    const labels: Record<string, string> = {
      igFollowers: "Instagram followers", igPosts: "Instagram posts", igEng: "Instagram likes + comments",
      fbFollowers: "Facebook followers", fbPosts: "Facebook posts", ytSubs: "YouTube subscribers",
      ytVids: "YouTube uploads", spListeners: "Spotify monthly listeners",
    };
    const describe = (k: string) =>
      k === "ytVids" && yt ? `YouTube uploads ${yt.total} (${yt.videos} video${yt.videos === 1 ? "" : "s"}, ${yt.shorts} Short${yt.shorts === 1 ? "" : "s"}, ${yt.live} live)`
      : k === "igEng" && ig?.ok?.hiddenLikes ? `${labels[k]} ${values[k].toLocaleString("en-US")} (some like counts are hidden by the artist)`
      : `${labels[k]} ${values[k].toLocaleString("en-US")}`;
    const missing = (Object.keys(SYNC_FIELDS) as SyncField[]).filter((k) => values[k] == null);
    const igReason = ig?.err ? (ig.err instanceof InstagramError ? ig.err.message : "the Instagram lookup failed")
      : !links.ig ? "add an Instagram link to count these"
      : "Instagram isn't set up yet — run npm run ig:setup";
    const why = (k: SyncField) =>
      k === "igPosts" ? `${labels[k]} (${igReason})`
      : k === "fbPosts" ? `${labels[k]} (Facebook only shows posts to logged-in users — enter by hand)`
      : k === "ytVids" && !links.yt ? `${labels[k]} (add a YouTube link to count these)`
      : labels[k];
    const expires = process.env.META_TOKEN_EXPIRES;
    const daysLeft = useIg && expires ? Math.ceil((new Date(expires + "T00:00:00").getTime() - Date.now()) / 86400000) : null;
    const parts = [
      found.length ? `Found for ${win.start} to ${win.end}: ${found.map(describe).join(", ")}.` : "Couldn't find any public numbers to update.",
      missing.length ? `Not found: ${missing.map(why).join("; ")}.` : "",
      claude.err ? `(The Claude lookup failed, so only directly measured numbers were saved: ${friendlyError(claude.err)})` : "",
      daysLeft != null && daysLeft <= 7 ? `Heads up: the Instagram token expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? "" : "s"} — run npm run ig:setup to renew it.` : "",
    ];
    const message = parts.filter(Boolean).join(" ");
    res.json({ message, metrics, sources: out.sources });
  } catch (e) {
    console.error("Sync failed:", e);
    res.status(502).json({ error: `Sync failed: ${friendlyError(e)}` });
  }
});

// Sync all is deliberately not wired to Claude yet: it would run one billed
// web-search lookup per active artist (100+) in a single click.
app.post("/api/sync", async (_req, res) => {
  const roster = await getRoster() as Record<string, { status?: string }>;
  const active = Object.keys(roster).filter((n) => roster[n].status === "A").length;
  res.status(501).json({ error: `Sync all isn't switched on yet — it would run ${active} paid lookups at once. Use Sync stats on individual artists for now.` });
});

// In production, this same process serves the built client too, so the
// whole app is one `npm run app` on one port.
app.use(express.static(CLIENT_DIST));
app.get(/^(?!\/api).*/, async (_req, res, next) => {
  try {
    await fs.access(path.join(CLIENT_DIST, "index.html"));
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  } catch {
    next();
  }
});

const PORT = Number(process.env.PORT) || 3002;
// Only this computer can reach the app (not other devices on the network),
// since it holds contracts and roster data. Set HOST=0.0.0.0 to share it on
// a trusted network deliberately.
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`Roster performance server listening on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
