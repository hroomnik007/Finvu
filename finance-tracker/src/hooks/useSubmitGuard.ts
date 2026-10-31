import { useCallback, useRef, useState } from 'react'
import { runSingleFlight } from '../lib/singleFlight'

/** `run(fn)` ignores calls while a previous one is pending; `pending` drives the busy UI. */
export function useSubmitGuard() {
  const flag = useRef(false)
  const [pending, setPending] = useState(false)
  const run = useCallback(<T,>(fn: () => T | Promise<T>) => runSingleFlight(flag, fn, setPending), [])
  return { pending, run }
}
