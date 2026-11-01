import { useSyncExternalStore } from 'react'
import { getQueue, subscribeQueue } from '../lib/offlineQueue'
import { isServerReachable, subscribeReachable } from '../lib/connectivity'

export function useOfflineQueue() {
  return useSyncExternalStore(subscribeQueue, getQueue, getQueue)
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
const getOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnline, () => true)
}

/** True when the device is offline or the server did not answer the last request. */
export function useOffline(): boolean {
  const online = useOnline()
  const reachable = useSyncExternalStore(subscribeReachable, isServerReachable, () => true)
  return !online || !reachable
}
