import { useSyncExternalStore } from 'react'

// True on touch-first devices (phones, tablets): the primary pointer is a finger.
const QUERY = '(pointer: coarse)'

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const snapshot = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
