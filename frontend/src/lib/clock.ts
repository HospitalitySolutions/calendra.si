import { api } from '../api'

/**
 * Frontend clock shim that mirrors the backend's effective time for the current tenant.
 *
 * The backend may shift "now" for a selected tenant (Platform Admin time simulator). We fetch the
 * effective server time from {@code GET /api/time/now} and keep the delta to the local clock so the
 * UI (e.g. calendar booking statuses) reflects the simulated time. When no simulation is active the
 * offset is ~0 and {@link nowMs} behaves like {@code Date.now()}.
 */
let offsetMs = 0
let simulated = false

export function nowMs(): number {
  return Date.now() + offsetMs
}

export function isClockSimulated(): boolean {
  return simulated
}

export async function refreshClock(): Promise<void> {
  try {
    const res = await api.get('/time/now')
    const serverEpoch = Number(res?.data?.epochMillis)
    if (Number.isFinite(serverEpoch)) {
      offsetMs = serverEpoch - Date.now()
      simulated = Boolean(res?.data?.simulated)
    }
  } catch {
    // Keep the previous offset on transient failures; falls back to real time on first failure.
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** Fetches the clock once and refreshes periodically. Safe to call multiple times. */
export function startClockSync(intervalMs = 60_000): void {
  void refreshClock()
  if (intervalHandle != null) return
  intervalHandle = setInterval(() => {
    void refreshClock()
  }, intervalMs)
}

export function stopClockSync(): void {
  if (intervalHandle != null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
