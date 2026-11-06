/** When this device last synced: a device-only note (never exported, never synced), for the Settings row. */
const KEY = 'cadence.lastSync'

export function lastSynced(): Date | undefined {
  try {
    const v = localStorage.getItem(KEY)
    return v ? new Date(v) : undefined
  } catch {
    return undefined
  }
}

export function markSynced(now = new Date()): void {
  try {
    localStorage.setItem(KEY, now.toISOString())
  } catch {
    // Storage refused: only the "last synced" line is lost.
  }
}
