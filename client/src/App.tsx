import { useEffect, useMemo, useRef, useState } from "react";
import VerdictBand from "./components/VerdictBand";
import StatusBar from "./components/StatusBar";
import FreshnessStrip from "./components/FreshnessStrip";
import ImportModal from "./components/ImportModal";
import RosterTable from "./components/RosterTable";
import ArtistDrawer from "./components/ArtistDrawer";
import TrendChart from "./components/TrendChart";
import ExportSummaryButton from "./components/ExportSummaryButton";
import InvolvementPage from "./components/InvolvementPage";
import { getState, saveEvents, saveImports, saveMetricsMonth, saveRoster } from "./lib/api";
import { runImport, SOURCES } from "./lib/importer";
import { prevMonth, thisMonth } from "./lib/format";
import type { AppState, ArtistMeta, InvolvementEvent, MonthMetrics } from "./lib/types";

type Tab = "roster" | "involvement";
const TABS: { k: Tab; label: string; href: string }[] = [
  { k: "roster", label: "Roster Performance", href: "#/" },
  { k: "involvement", label: "Artist Involvement", href: "#/involvement" },
];
function tabFromHash(): Tab {
  return window.location.hash.startsWith("#/involvement") ? "involvement" : "roster";
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [drawerName, setDrawerName] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [eventsSave, setEventsSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pendingEvents = useRef<InvolvementEvent[] | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Tabs live in the URL hash (#/involvement), so refresh and back/forward work.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Events autosave half a second after the last change. If the tab is closed
  // inside that window, the pending save is sent on the way out.
  useEffect(() => {
    const flush = () => {
      if (!pendingEvents.current) return;
      fetch("/api/events", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendingEvents.current) });
      pendingEvents.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    getState().then((s) => {
      setState(s);
      const months = Object.keys(s.metrics).sort();
      setMonth(months.length ? months[months.length - 1] : null);
    }).catch((e) => setErr(String(e.message || e)));
  }, []);

  const months = useMemo(() => state ? Object.keys(state.metrics).sort() : [], [state]);

  if (!state) {
    return (
      <div className="wrap" style={{ padding: 40 }}>
        {err ? (
          <div className="alert"><span>!</span><span>Could not load data from the server: {err}. Is the server running? (<code>npm run dev</code> from the repo root.)</span></div>
        ) : <p className="sub">Loading…</p>}
      </div>
    );
  }

  function handleRunImport(source: string, importMonth: string, text: string) {
    if (!state) return { err: "Not ready yet." };
    const res = runImport(source, importMonth, text, state.roster, state.metrics);
    if (res.err) return { err: res.err };

    const nextRoster = res.nextRoster || state.roster;
    const nextMetrics = res.nextMetrics || state.metrics;
    const nextImports = {
      ...state.imports,
      [source]: { at: new Date().toISOString(), month: SOURCES[source].month ? importMonth : undefined, rows: res.hit },
    };
    setState({ ...state, roster: nextRoster, metrics: nextMetrics, imports: nextImports });
    if (res.nextMetrics) setMonth(importMonth);

    // Persist in the background; a local single-user tool doesn't need to
    // block the UI on it, but we do surface a failure if one happens.
    (async () => {
      if (res.nextRoster) await saveRoster(res.nextRoster);
      if (res.nextMetrics) await saveMetricsMonth(importMonth, res.nextMetrics[importMonth]);
      await saveImports(nextImports);
    })().catch((e) => setErr(`Import saved locally but failed to persist: ${(e as Error).message}`));

    return { ok: res.ok };
  }

  function handleSaveArtist(name: string, patch: Partial<ArtistMeta>) {
    if (!state) return;
    const nextRoster = { ...state.roster, [name]: { ...state.roster[name], ...patch } };
    setState({ ...state, roster: nextRoster });
    saveRoster(nextRoster).catch((e) => setErr(`Could not save: ${(e as Error).message}`));
  }

  function handleSaveMetrics(name: string, m: string, mm: MonthMetrics) {
    if (!state) return;
    const monthData = { ...(state.metrics[m] || {}) };
    if (Object.keys(mm).length) monthData[name] = mm; else delete monthData[name];
    setState({ ...state, metrics: { ...state.metrics, [m]: monthData } });
    setMonth(m);
    saveMetricsMonth(m, monthData).catch((e) => setErr(`Could not save numbers: ${(e as Error).message}`));
  }

  function handleEventsChange(events: InvolvementEvent[]) {
    if (!state) return;
    setState({ ...state, events });
    pendingEvents.current = events;
    setEventsSave("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const toSave = pendingEvents.current;
      if (!toSave) return;
      pendingEvents.current = null;
      saveEvents(toSave).then(
        () => { if (!pendingEvents.current) setEventsSave("saved"); },
        () => setEventsSave("error"),
      );
    }, 500);
  }

  const prev = month ? prevMonth(month) : null;

  return (
    <>
      <div className="topbar"><div className="wrap">
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.k} href={t.href} className="tab" aria-current={tab === t.k ? "page" : undefined}>{t.label}</a>
          ))}
        </nav>
      </div></div>

      <main><div className="wrap stack">
        {tab === "involvement" ? (
          <InvolvementPage events={state.events || []} roster={state.roster} onChange={handleEventsChange} saveState={eventsSave} />
        ) : <>
        <div>
          <h2 className="sec">Collaboration status</h2>
          <p className="sub">Every signature and resident collaboration, graded on what it produced over the past 30 days on
            Instagram, Meta, YouTube, Spotify and search — weighted by whether they're a Live Artist, an Influencer or both. Grades are relative to the artist's own audience, so a 700 k channel and a 20 k channel are held to the
            same standard of effort rather than the same absolute number. Affiliate sales and press sit alongside the score,
            not inside it.</p>
        </div>

        {err && <div className="alert"><span>!</span><span>{err}</span></div>}

        <VerdictBand roster={state.roster} metrics={state.metrics} month={month} />

        <div>
          <StatusBar roster={state.roster} metrics={state.metrics} month={month} months={months} onMonthChange={setMonth} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <ExportSummaryButton roster={state.roster} metrics={state.metrics} month={month} />
        </div>

        <RosterTable roster={state.roster} metrics={state.metrics} month={month} onOpen={setDrawerName} />

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Where the numbers came from</div>
          <FreshnessStrip imports={state.imports} onImport={setImportSource} />
        </div>

        <div className="panel">
          <div className="eyebrow">Trend</div>
          <h3 style={{ fontSize: 19, fontWeight: 600, margin: "5px 0 3px" }}>Month by month</h3>
          <p className="sub">Each month you record a 30-day snapshot adds a point. Two points is a line, six is a trend — do not
            read the first one as either.</p>
          <div style={{ marginTop: 16 }}><TrendChart metrics={state.metrics} /></div>
        </div>
        </>}
      </div></main>

      <ArtistDrawer
        name={drawerName} roster={state.roster} metrics={state.metrics} month={month} prevMonth={prev}
        onClose={() => setDrawerName(null)} onSave={handleSaveArtist} onSaveMetrics={handleSaveMetrics}
        onSynced={(metrics, m) => { setState({ ...state, metrics }); setMonth(m); }}
        contracts={state.contracts || []} onContractsChange={(contracts) => setState((s) => (s ? { ...s, contracts } : s))}
      />
      <ImportModal
        source={importSource} defaultMonth={month || thisMonth()}
        onClose={() => setImportSource(null)} onImport={handleRunImport}
      />
    </>
  );
}
