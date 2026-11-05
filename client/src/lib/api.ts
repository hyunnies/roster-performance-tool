import type { AppState, Contract, Imports, InvolvementEvent, Metrics, Roster } from "./types";

const BASE = "/api";

async function handle<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}

export function getState(): Promise<AppState> {
  return fetch(`${BASE}/state`).then((r) => handle<AppState>(r));
}

export function saveRoster(roster: Roster): Promise<Roster> {
  return fetch(`${BASE}/roster`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(roster),
  }).then((r) => handle<Roster>(r));
}

export function saveMetricsMonth(month: string, byArtist: Metrics[string]): Promise<Metrics> {
  return fetch(`${BASE}/metrics/${encodeURIComponent(month)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(byArtist),
  }).then((r) => handle<Metrics>(r));
}

export function saveEvents(events: InvolvementEvent[]): Promise<InvolvementEvent[]> {
  return fetch(`${BASE}/events`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(events),
  }).then((r) => handle<InvolvementEvent[]>(r));
}

export async function uploadContract(artist: string, file: File): Promise<Contract> {
  const q = `artist=${encodeURIComponent(artist)}&fileName=${encodeURIComponent(file.name)}`;
  const r = await fetch(`${BASE}/contracts?${q}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || (r.status === 413 ? "That file is over 25 MB." : `Upload failed (${r.status})`));
  return body as Contract;
}

export async function deleteContract(id: string): Promise<void> {
  const r = await fetch(`${BASE}/contracts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`Delete failed (${r.status})`);
}

export const contractUrl = (id: string, download = false) => `${BASE}/contracts/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`;

export function saveImports(imports: Imports): Promise<Imports> {
  return fetch(`${BASE}/imports`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(imports),
  }).then((r) => handle<Imports>(r));
}

export interface SyncResult { message: string; metrics?: Metrics }

/** Ask the server to pull this artist's stats from the platform APIs. The
 * server holds the API keys; the browser never sees them. */
export async function syncArtist(name: string, month: string, links: Record<string, string>): Promise<SyncResult> {
  const r = await fetch(`${BASE}/sync/${encodeURIComponent(name)}?month=${encodeURIComponent(month)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Sync failed (${r.status})`);
  return body as SyncResult;
}

/** Sync every active artist on the roster in one go. */
export async function syncAll(): Promise<SyncResult> {
  const r = await fetch(`${BASE}/sync`, { method: "POST" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Sync failed (${r.status})`);
  return body as SyncResult;
}
