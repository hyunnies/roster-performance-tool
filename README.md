# Roster Performance Tool

A standalone dashboard for grading every signature and resident
collaboration on what it actually produced this month — on YouTube, Meta
and search — relative to that artist's own audience. A 700k channel and a
20k channel are held to the same standard of effort, not the same absolute
number. Affiliate sales and press sit alongside the grade; neither is
scored into it, since affiliate is still a small pilot and press is news,
not a monthly metric.

This was originally the "Current roster performance" page inside a larger
internal dashboard (the Artist Relations Cockpit, built as a Claude
artifact). It's been pulled out so it can run entirely on your own machine,
take real code changes, and outlive any one person's access to that
dashboard. **It's a local app — there's no GitHub, no account, and no
server anywhere else involved.** Pushing it to a Git host later is entirely
optional; nothing here depends on it.

This is a separate app from the [Artist Evaluation Tool](../artist-evaluation-tool)
(the old "New artist evaluation" page) — the two started life on different
pages of the same dashboard, grade completely different things, and have no
need to share a server or a data file.

## How it's put together

```
roster-performance-tool/
├── client/     Vite + React + TypeScript — the dashboard, tables and import UI
├── server/     Express + TypeScript — a small API that persists roster,
│               metrics and import history to server/data/*.json
└── package.json   npm workspaces root — runs both together
```

The grading engine and the five CSV importers live entirely in
`client/src/lib/` (`grading.ts`, `importer.ts`, `csv.ts`) as plain,
dependency-free TypeScript functions. If you ever want to reuse them
somewhere else — a CLI, a scheduled report, a different UI — those files
are the whole thing; nothing else depends on React.

## Running it

Requires Node 18+. One-time setup, then one command whenever you want to use it:

```bash
npm install      # one-time: installs both client and server workspaces
npm run app       # builds it and starts one local server with everything
```

(`npm install` generates its own `package-lock.json` the first time you run
it — that file isn't committed on purpose, since one generated on a
different machine can make npm skip the correct native build tool for
*your* OS and CPU.)

Then open **http://localhost:3002** — that's the whole app, UI and data
together, running as a single local process. No dev tooling, no browser
build step to think about, nothing else needs to be running. Stop it with
Ctrl+C whenever you're done; run `npm run app` again next time (it rebuilds
each time, which is fast — a couple of seconds).

If you're actively changing the code and want instant reload on save
instead:

```bash
npm run dev       # runs the API on :3002 and the Vite dev server on :5180
```

Open **http://localhost:5180** for that — the dev server proxies `/api/*`
requests to the Express server, so both need to stay running, which is what
`npm run dev` does.

## The first time you run it

`server/data/roster.json` doesn't exist yet, so the first `GET /api/state`
seeds it from a snapshot of the Favro "Artists Roster" board taken when this
tool was built (`server/src/seed.ts` — 139 collaborations, names/tier/status/
region only). That seed only ever fires once, against an empty roster file —
from then on, the **Favro CSV import is the source of truth** for keeping
the roster current, exactly as it was in the original dashboard. If the
roster has moved on since this was built, your first Favro import brings it
up to date; nothing about the seed data blocks that.

## Importing data

The five import buttons each take a pasted CSV and are tolerant of real
exports — quoted fields, commas/semicolons/tabs as delimiters, and a locale-
tolerant number parser (`1.234,56` and `1,234.56` both work):

- **Favro roster** — updates the roster itself (tier, status, region, last
  check-in). Not tied to a month.
- **YouTube** — subscribers, videos/views/qualified-views for the month.
- **Search Console** — pastes the whole query table; artist names are
  matched out of the queries automatically (full name first, then a
  distinctive single name, guarded against short or common words).
- **Meta** — followers, reach, engagement from Business Suite.
- **Press & media** — one row per piece of coverage; artist names are
  matched out of the headline the same way as Search Console. Never scored,
  just shown.
- **AdTraction** — affiliate clicks/conversions/commission. Graded on
  number of transactions, not kronor — five small sales say more about a
  working collaboration than one large one, and it's a pilot program with a
  handful of artists, so it's shown separately and never folded into the
  composite score.

Column names are matched flexibly (`subscribers` or `subscriber_count`,
`reach` or `accounts_reached`, and so on) — see `client/src/lib/importer.ts`
(`SOURCES`) for the exact list each source recognizes.

## Sync stats

Each artist's **Sync stats** button fills in the past 30 days from three
sources, all running at once:

- **YouTube uploads** — counted straight from the channel's public pages
  (videos, Shorts and live streams). Free; needs the artist's YouTube link.
- **Instagram followers, posts, likes + comments** — exact, via Meta's
  Business Discovery API, read through Strandberg's own Instagram
  professional account. Free; needs the artist's Instagram link and the
  one-time setup below. Only works for creator/business accounts.
- **Everything else** (Facebook followers, YouTube subscribers, Spotify
  monthly listeners) — looked up by Claude with web search. Billed to the
  Anthropic key; put `ANTHROPIC_API_KEY` (and `ANTHROPIC_WORKSPACE_ID` for
  org-wide keys) in `.env` — see `.env.example`.

Facebook post counts can't be read without a login, so they stay manual.

### One-time Instagram setup

1. Make sure Strandberg's Instagram is a **professional** account linked to
   Strandberg's **Facebook Page**.
2. At [developers.facebook.com](https://developers.facebook.com), create an
   app (type **Business**) and add the **Instagram** product, choosing
   "API setup with Facebook login". Note the **App ID** and **App Secret**
   (App settings → Basic).
3. Open **Tools → Graph API Explorer**, pick the app, and generate a user
   token with: `instagram_basic`, `instagram_manage_insights`,
   `pages_read_engagement`, `pages_show_list` (plus `business_management`
   if the Page is owned through Business Manager). Log in as someone with
   access to Strandberg's Page.
4. From the repo root run `npm run ig:setup` and paste the App ID, App
   Secret and token. It swaps in a 60-day token, finds the Instagram
   account, tests a real lookup and writes the result to `.env` (the App
   Secret is never saved).
5. Restart the app. Sync warns a week before the token expires — just run
   `npm run ig:setup` again.

The app only needs to stay in Meta's development mode, since the token belongs
to an admin of the app; no Meta app review is needed for this.

## Where the data lives

Roster, metrics, import history and Artist Involvement events are saved to
`server/data/roster.json`, `metrics.json`, `imports.json` and `events.json` —
plain JSON, written atomically (write-to-temp-then-rename) so a crash
mid-save can't corrupt them. Contract PDFs uploaded on an artist go in
`server/data/contracts/` (named by an internal id), listed in
`contracts.json`. All of it is git-ignored on purpose — nobody wants real
roster data or contracts committed to a repo, especially a public one. Back
up the whole `server/data/` folder the boring way: copy it somewhere safe now
and then.

The app only accepts connections from this computer, since it holds
contracts. To share it on a trusted network on purpose, start it with
`HOST=0.0.0.0 npm run app`.

If you need this to serve more than one person, or run on a shared machine,
`server/src/index.ts` is a good, small place to start — swap the JSON files
for SQLite (`better-sqlite3` is a drop-in, no separate database server to
run) once single-file JSON starts to feel thin. The rest of the app doesn't
care how `server/src/index.ts` stores things, as long as the same endpoints
keep working (`GET /api/state`, `PUT /api/roster`, `PUT
/api/metrics/:month`, `PUT /api/imports`, `PUT /api/events`, and the
`/api/contracts` endpoints).

## What's deliberately not here

The original dashboard page had no Claude-specific features on this one (no
AI-powered lookup button, unlike the evaluation tool's page) — the whole
grading and import pipeline was already plain JavaScript, so nothing had to
be left out here. Everything you see is a straight, verbatim port of the
original logic.

## License

No license file is included yet — this repo defaults to "all rights
reserved" until you add one. Add a `LICENSE` file if and when you decide how
you want this shared.
