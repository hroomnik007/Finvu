// "Can we reach the server?" — false after a request got no answer at all
// (no network, server down), true again after any answer. Together with
// navigator.onLine this drives the offline banner.
let reachable = true
const listeners = new Set<() => void>()

export function isServerReachable(): boolean { return reachable }

export function setServerReachable(v: boolean): void {
  if (v === reachable) return
  reachable = v
  for (const l of listeners) l()
}

export function subscribeReachable(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Feeds the flag from an axios result: any response means reachable. */
export function noteRequestOutcome(err: unknown): void {
  const e = err as { response?: unknown; code?: string } | null
  if (!e || e.code === 'ERR_CANCELED') return
  setServerReachable(!!e.response)
}
