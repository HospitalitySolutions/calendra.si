const CHUNK_RELOAD_STATE_KEY = 'calendra.chunkReloadState'
const CHUNK_RELOAD_WINDOW_MS = 30_000
const CHUNK_RELOAD_MAX_ATTEMPTS = 3

let reloadScheduled = false

type ChunkReloadState = {
  attempts: number
  startedAt: number
}

function readReloadState(): ChunkReloadState {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_STATE_KEY)
    if (!raw) return { attempts: 0, startedAt: Date.now() }
    const parsed = JSON.parse(raw) as Partial<ChunkReloadState>
    const attempts = Number(parsed.attempts)
    const startedAt = Number(parsed.startedAt)
    if (!Number.isFinite(attempts) || !Number.isFinite(startedAt)) {
      return { attempts: 0, startedAt: Date.now() }
    }
    return { attempts, startedAt }
  } catch {
    return { attempts: 0, startedAt: Date.now() }
  }
}

function writeReloadState(state: ChunkReloadState) {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_STATE_KEY, JSON.stringify(state))
  } catch {
    // Recovery should still work when storage is unavailable.
  }
}

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to (?:fetch|load) dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed|Unable to preload CSS/i.test(message)
}

export function resetChunkLoadRecovery() {
  reloadScheduled = false
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_STATE_KEY)
  } catch {
    // Ignore unavailable storage.
  }
}

/**
 * Recover from stale Vite chunk URLs after a deployment. During a rolling
 * deployment, index.html and a hashed lazy chunk can briefly be served by
 * different frontend versions. A bounded reload fetches the current HTML and
 * retries the route without trapping the user in an infinite reload loop.
 */
export function recoverFromChunkLoadError() {
  if (reloadScheduled) return true

  const now = Date.now()
  const previous = readReloadState()
  const state = now - previous.startedAt > CHUNK_RELOAD_WINDOW_MS
    ? { attempts: 0, startedAt: now }
    : previous

  if (state.attempts >= CHUNK_RELOAD_MAX_ATTEMPTS) return false

  reloadScheduled = true
  writeReloadState({ attempts: state.attempts + 1, startedAt: state.startedAt })

  window.setTimeout(() => {
    window.location.reload()
  }, 80)

  return true
}
