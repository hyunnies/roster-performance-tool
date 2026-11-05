# Roster Performance Tool

A dashboard for grading each Strandberg artist collaboration on what it produced over the **past 30 days** on Instagram, Facebook, YouTube, Spotify and search. Grades are relative to the artist's own audience, so a 700k channel and a 20k channel are held to the same standard of effort. How much each channel counts depends on the artist's **Type**: Spotify carries a Live Artist, social carries an Influencer. Affiliate sales and press are shown beside the grade, never scored into it.

It also has:

- **Artist panel:** profile links, numbers per month, band tabs, a contract upload with an anniversary date, recommended activities and notes.
- **Artist Involvement tab:** events, and which roster artists take part in each, with a status for every artist.
- **Sync stats:** fills in an artist's numbers automatically, using your own API keys.

It runs entirely on your own computer. Your data and contracts never leave it, and it only accepts connections from that computer.

---

## 1. Install

You need:

- **Node.js 20.12 or newer.** Check with `node -v`. If it's missing or older, install the LTS version from [nodejs.org](https://nodejs.org).
- **Git**, to download the code. On a Mac, `git --version` offers to install it if it's missing.
- **Access to this repository.** It's private; ask the owner to add you.

Then, in a terminal:

```bash
git clone https://github.com/hyunnies/roster-performance-tool.git
cd roster-performance-tool
npm install
```

`npm install` is a one-time step. It also creates `package-lock.json` for your machine; that file is deliberately not committed.

## 2. Run it

```bash
npm run app
```

Open **http://localhost:3002**. Stop the app with Ctrl+C, and run `npm run app` again next time.

The first run creates the roster from a snapshot of the Favro "Artists Roster" board (139 artists). After that, the **Favro** import on the page keeps it up to date.

The app works without any keys. You can enter numbers by hand on each artist, or import CSVs. Keys are only needed for **Sync stats**.

---

## 3. Add your tokens (for Sync stats)

Sync uses up to three sources. Set up only the ones you need:

| What it fills in | Needs | Cost |
|---|---|---|
| YouTube uploads (videos, Shorts, live) | Nothing, just the artist's YouTube link | Free |
| Instagram followers, posts, likes + comments | A Meta token (step 3b) | Free |
| Facebook followers, YouTube subscribers, Spotify monthly listeners | An Anthropic API key (step 3a) | Billed per sync |

Every key goes in one file, `.env`, in the project folder. Create it from the template:

```bash
cp .env.example .env
```

Open `.env` in any text editor. **`.env` is git-ignored, so it never gets committed or pushed.** Never paste keys into the code, a chat, an issue or a commit.

Restart the app (Ctrl+C, then `npm run app`) after any change to `.env`.

### 3a. Anthropic API key

1. Sign in to the [Anthropic Console](https://console.anthropic.com). Your organisation may already have a workspace for this; ask the person who manages API billing.
2. Go to **API keys → Create key**, and copy the key (it starts with `sk-ant-`). You only see it once.
3. Paste it into `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. If Sync later says **"API key is not scoped to a workspace"**, your key belongs to the whole organisation. Find the workspace ID under **Settings → Workspaces** (it starts with `wrkspc_`) and add it:
   ```
   ANTHROPIC_WORKSPACE_ID=wrkspc_...
   ```

Each sync is a billed call that searches the web, and the key needs an active card on the account. Check with whoever holds the key before syncing a lot of artists.

### 3b. Meta token (Instagram)

This reads Instagram numbers through Strandberg's own Instagram account, using Meta's Business Discovery API. It only works for artists whose accounts are **creator or business** accounts.

1. Make sure Strandberg's Instagram is a **professional** account, linked to Strandberg's **Facebook Page**.
2. At [developers.facebook.com](https://developers.facebook.com), create an app of type **Business**. Add the **Instagram** product and choose **API setup with Facebook login**. Note the **App ID** and **App Secret** under **App settings → Basic**.
3. Open **Tools → Graph API Explorer** and select your app. Generate a **user token** with these permissions:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_read_engagement`
   - `pages_show_list`
   - also `business_management`, if the Page is owned through Business Manager

   Log in as someone who has access to Strandberg's Facebook Page.
4. From the project folder, run this **in your own terminal**:
   ```bash
   npm run ig:setup
   ```
   Paste the App ID, App Secret and token when it asks. It then:
   - swaps the token for a 60-day one;
   - finds Strandberg's Instagram account and tests a real lookup;
   - writes `META_ACCESS_TOKEN`, `IG_USER_ID` and `META_TOKEN_EXPIRES` into `.env`.

   The App Secret is used once and never saved.
5. Restart the app.

The token lasts **60 days**. Sync warns you a week before it expires; renew it by running `npm run ig:setup` again. The Meta app can stay in development mode, and it doesn't need Meta's app review.

If setup says **"No Instagram professional account is linked"**, the token can't see the Page. Regenerate it while logged in as a Page admin, and include `business_management`.

### Check it worked

Open an artist, add their profile links, and press **Sync stats**. The message under the button lists what was found and what wasn't, with the reason. Facebook post counts can't be read without a login, so they stay manual.

---

## Where your data lives

Everything stays in `server/data/` on your computer:

- `roster.json`, `metrics.json`, `imports.json`, `events.json`, plus `contracts.json` listing the uploaded files;
- `server/data/contracts/` for the contract PDFs.

All of it is git-ignored, so pulling or pushing code never touches it. Back the folder up now and then by copying it somewhere safe.

The app only accepts connections from your own computer, because it holds contracts. To open it to a trusted network on purpose, start it with `HOST=0.0.0.0 npm run app`.

## Updating

```bash
git pull
npm install
npm run app
```

Your `.env` and `server/data/` are kept.

## Importing data

The import buttons on the roster page take a pasted CSV:

- **Favro roster:** updates tier, status, region and last check-in.
- **Instagram:** followers, posts and engagement.
- **Meta (Facebook):** followers, posts and engagement.
- **YouTube:** subscribers, uploads, views and qualified views.
- **Spotify:** monthly listeners, graded on the trend since last month.
- **Search Console:** artist names are matched out of the queries automatically.
- **AdTraction:** clicks, sales and commission.
- **Press & media:** shown, never scored.

Each source accepts several column names (`subscribers` or `subscriber_count`, and so on); `client/src/lib/importer.ts` lists them all. Numbers in either `1.234,56` or `1,234.56` style work.

## For developers

```
client/   Vite + React + TypeScript (the page)
server/   Express + TypeScript (local API, Sync, saves to server/data/)
```

- `npm run dev` gives live reload while you change code. The API runs on :3002 and the page on **http://localhost:5180**.
- The grading engine and importers are plain TypeScript in `client/src/lib/` (`grading.ts`, `importer.ts`, `csv.ts`).
- Sync lives in `server/src/`: `sync.ts` for Claude, `youtube.ts`, `instagram.ts` and `ig-setup.ts`.
- If a newer `npm` elsewhere on your PATH misbehaves with workspaces, the scripts already call `npm --prefix` to avoid it.

The team's shared **Artist Relations Cockpit** on claude.ai has the same roster tab without Sync. It's a separate page; this repository doesn't update it.

## License

No license yet, so all rights are reserved.
