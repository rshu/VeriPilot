import type { DashboardState } from "./types"

export async function fetchState(): Promise<DashboardState> {
  const r = await fetch("/api/state")
  if (!r.ok) throw new Error(`/api/state ${r.status}`)
  return r.json()
}

/**
 * Subscribe to the live event stream. Each event is treated as a "something
 * changed" signal — the caller re-fetches /api/state (authoritative), so there
 * is no client-side reducer to drift from the server. `onLive` tracks the SSE
 * connection for the live indicator. Returns an unsubscribe.
 */
export function subscribe(onChange: () => void, onLive: (live: boolean) => void): () => void {
  const es = new EventSource("/api/events")
  es.onopen = () => onLive(true)
  es.onerror = () => onLive(false)
  es.onmessage = () => onChange()
  return () => es.close()
}
