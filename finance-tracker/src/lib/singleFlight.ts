// Double-submit guard. The flag is checked and set synchronously, before any
// re-render, so a double tap / double Enter in the same frame can't start a
// second request even though the button isn't disabled yet.

export interface FlightFlag { current: boolean }

/**
 * Runs `fn` unless a previous run guarded by the same flag is still pending.
 * Returns undefined when the call was ignored. `onBusy` reports start/end.
 */
export async function runSingleFlight<T>(
  flag: FlightFlag,
  fn: () => T | Promise<T>,
  onBusy?: (busy: boolean) => void,
): Promise<T | undefined> {
  if (flag.current) return undefined
  flag.current = true
  onBusy?.(true)
  try {
    return await fn()
  } finally {
    flag.current = false
    onBusy?.(false)
  }
}
